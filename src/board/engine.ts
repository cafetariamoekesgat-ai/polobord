/**
 * BoardEngine: tekent het bord in SVG en verwerkt alle aanraking.
 *
 * - Het document (store.doc.board) bevat de "echte" posities.
 * - De engine houdt per cap een weergavepositie bij die daar vloeiend naartoe
 *   drijft; zo voelt slepen als water en animeren opstellingen vanzelf.
 * - Multi-touch: elke vinger/pen heeft zijn eigen gebaar.
 */
import barlow600 from '@fontsource/barlow/files/barlow-latin-600-normal.woff2?url'
import barlow700 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?url'
import { effect } from '@preact/signals'
import { defenseTargets, keeperTarget } from '../defense'
import { newId, reentrySpot } from '../formations'
import { alongPolyline, attackGoal, clamp, dist, easeInOut, nearestFreeSpot, otherTeam, resolveCollisions, sub, unit, v } from '../geometry'
import { RULES } from '../rules'
import {
  autoDefense,
  capMenu,
  commit,
  doc,
  drawColor,
  ghosts,
  isExcluded,
  layers,
  lineKind,
  locked,
  playback,
  presentation,
  registerEngine,
  settings,
  shareOrDownload,
  tool,
  view,
  type EngineApi,
} from '../store'
import type { Board, Frame, Piece, Stroke, Vec } from '../types'
import { BallView, PieceView } from './caps'
import { buildCaustics } from './caustics'
import { drawField, FIELD_THEMES, MARGIN } from './field'
import { drawPassLanes, drawShotWindow, drawVoronoi, type OverlayInput } from './overlays'
import { livePath, renderStroke, strokeHit, strokeVecs } from './strokes'
import { el, f2, FONT_NUM, SVGNS } from './svg'

type Gesture =
  | { kind: 'piece'; id: string; off: Vec; sx: number; sy: number; t0: number; moved: boolean; lp: number }
  | { kind: 'ball'; off: Vec; sx: number; sy: number; t0: number; moved: boolean }
  | { kind: 'draw'; stroke: Stroke; path: SVGPathElement; under: SVGPathElement; sx: number; sy: number; t0: number; moved: boolean; onPiece: string | null; lp: number }
  | { kind: 'erase'; removed: number }
  | { kind: 'measure' }
  | { kind: 'none' }

const SEGMENT_SECONDS = 1.6
const LONG_PRESS_MS = 480
const TAP_PX = 9

export class BoardEngine implements EngineApi {
  private sheet: HTMLDivElement
  private svg: SVGSVGElement
  private world: SVGGElement
  private gField: SVGGElement
  private gVoronoi: SVGGElement
  private gStrokes: SVGGElement
  private gAnalysis: SVGGElement
  private gShot: SVGGElement
  private gGhost: SVGGElement
  private gPieces: SVGGElement
  private gBall: SVGGElement
  private gLive: SVGGElement
  private gMeasure: SVGGElement
  private water: HTMLDivElement
  private ballView: BallView

  private views = new Map<string, PieceView>()
  private disp = new Map<string, Vec>()
  private ballDisp: Vec = v(0, 0)
  private flight: { from: Vec; to: string; t0: number; dur: number } | null = null
  private glideUntil = 0
  private glideTau = 120
  private gestures = new Map<number, Gesture>()
  private raf = 0
  private lastTs = 0
  private inverse: DOMMatrix | null = null
  private measureAB: [Vec, Vec] | null = null
  private overlaysDirty = true
  private lastOverlay = 0
  private playOverride: { pos: Map<string, Vec>; ball: Vec; lift: number; excluded: Record<string, boolean>; step: number } | null = null
  private shownStep = -1

  /** cap-straal in meters, afhankelijk van de schermgrootte */
  r = 0.6
  ppm = 40
  private textFix = ''
  private matrix = { sx: 1, sy: 1, e: 0, f: 0 }
  private vb = { x: 0, y: 0, w: 1, h: 1 }

  constructor(private stage: HTMLElement) {
    this.sheet = document.createElement('div')
    this.sheet.className = 'sheet'
    stage.appendChild(this.sheet)
    this.water = buildCaustics(this.sheet)

    this.svg = document.createElementNS(SVGNS, 'svg')
    this.svg.classList.add('board')
    this.svg.setAttribute('xmlns', SVGNS)
    this.sheet.appendChild(this.svg)
    this.world = el('g', {}, this.svg)
    this.gField = el('g', {}, this.world)
    this.gVoronoi = el('g', {}, this.world)
    this.gStrokes = el('g', {}, this.world)
    this.gAnalysis = el('g', {}, this.world)
    this.gShot = el('g', {}, this.world)
    this.gGhost = el('g', {}, this.world)
    this.gPieces = el('g', {}, this.world)
    this.gBall = el('g', {}, this.world)
    this.gLive = el('g', { 'data-live': '1' }, this.world)
    this.gMeasure = el('g', { 'data-live': '1' }, this.world)
    this.ballView = new BallView(this.gBall)

    this.svg.addEventListener('pointerdown', this.onDown)
    this.svg.addEventListener('pointermove', this.onMove)
    this.svg.addEventListener('pointerup', this.onUp)
    this.svg.addEventListener('pointercancel', this.onCancel)
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault())

    new ResizeObserver(() => this.layout()).observe(stage)
    registerEngine(this)
    this.reload()
    this.ensureSeparated()

    effect(() => {
      view.value
      this.reload()
    })
    effect(() => {
      presentation.value
      settings.value
      this.settingsChanged()
    })
    effect(() => {
      layers.value
      this.overlaysDirty = true
      this.kick()
    })
    effect(() => {
      const a = autoDefense.value
      if (a.enabled) this.glide(500)
      this.kick()
    })
    effect(() => {
      const m = capMenu.value
      for (const [id, pv] of this.views) pv.highlight(m?.id === id)
    })
    effect(() => {
      tool.value
      this.measureAB = null
      this.gMeasure.replaceChildren()
    })
    effect(() => {
      this.drawGhosts(ghosts.value)
    })
    effect(() => {
      const pb = playback.value
      if (pb.playing || pb.scrubbing) this.kick()
    })
    // uitsluitingstimers: 4× per seconde verversen
    setInterval(() => {
      if (doc.board.pieces.some((p) => (p.excludedUntil ?? 0) > 0)) this.kick()
    }, 250)
  }

  private get board(): Board {
    return doc.board
  }

  // ── Layout en weergave ───────────────────────────────────────────────────

  private computeView() {
    const { length: L, width: W } = this.board.field
    const vw = view.value
    let sx = 1
    let sy = 1
    if (vw.rotated) {
      sx = -sx
      sy = -sy
    }
    if (vw.mirrored) sx = -sx
    const cx = L / 2
    const cy = W / 2
    this.matrix = { sx, sy, e: cx - sx * cx, f: cy - sy * cy }
    this.textFix = sx === 1 && sy === 1 ? '' : `scale(${sx} ${sy})`
    let x0 = -MARGIN.left
    let x1 = L + MARGIN.right
    if (vw.half) {
      if (this.board.attacking === 'white') x0 = L / 2 - 0.9
      else x1 = L / 2 + 0.9
    }
    const y0 = -MARGIN.top
    const y1 = W + MARGIN.bottom
    const pts = [v(x0, y0), v(x1, y0), v(x0, y1), v(x1, y1)].map((p) => this.toView(p))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    this.vb = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    const { sx: a, sy: d, e, f } = this.matrix
    this.world.setAttribute('transform', `matrix(${a} 0 0 ${d} ${f2(e)} ${f2(f)})`)
    this.svg.setAttribute('viewBox', `${f2(this.vb.x)} ${f2(this.vb.y)} ${f2(this.vb.w)} ${f2(this.vb.h)}`)
  }

  /** Jurytafel midden op het zichtbare deel. */
  private tableX() {
    const L = this.board.field.length
    if (!view.value.half) return L / 2
    return this.board.attacking === 'white' ? (L * 3) / 4 : L / 4
  }

  private toView(p: Vec): Vec {
    const { sx, sy, e, f } = this.matrix
    return v(sx * p.x + e, sy * p.y + f)
  }

  layout() {
    const w = this.stage.clientWidth
    const h = this.stage.clientHeight
    if (!w || !h) return
    this.computeView()
    const scale = Math.min(w / this.vb.w, h / this.vb.h)
    const sw = this.vb.w * scale
    const sh = this.vb.h * scale
    Object.assign(this.sheet.style, { width: `${sw}px`, height: `${sh}px`, left: `${(w - sw) / 2}px`, top: `${(h - sh) / 2}px` })
    this.ppm = scale
    const r = clamp(RULES.capMinScreenRadius / scale, RULES.capRadiusMin, 1.1)
    const rChanged = Math.abs(r - this.r) > 1e-3
    this.r = r
    // water-laag precies onder het water
    const { length: L, width: W } = this.board.field
    const a = this.toView(v(0, 0))
    const b = this.toView(v(L, W))
    Object.assign(this.water.style, {
      left: `${(Math.min(a.x, b.x) - this.vb.x) * scale}px`,
      top: `${(Math.min(a.y, b.y) - this.vb.y) * scale}px`,
      width: `${Math.abs(b.x - a.x) * scale}px`,
      height: `${Math.abs(b.y - a.y) * scale}px`,
    })
    this.inverse = null
    if (rChanged) this.overlaysDirty = true
    this.kick()
  }

  /** Alles opnieuw opbouwen (ander bord, andere veldmaat, andere weergave). */
  reload() {
    this.flight = null
    this.computeView()
    const theme = FIELD_THEMES[settings.value.theme]
    drawField(this.gField, this.board.field, theme, this.textFix, null, this.tableX())
    this.water.style.background = theme.water
    this.layout()
    this.piecesChanged()
    // weergaveposities direct goed zetten als er nog niets stond
    for (const p of this.board.pieces) if (!this.disp.has(p.id)) this.disp.set(p.id, v(p.x, p.y))
    this.strokesChanged()
    this.overlaysDirty = true
    this.kick()
  }

  settingsChanged() {
    const s = settings.value
    const pres = presentation.value
    const theme = FIELD_THEMES[s.theme]
    drawField(this.gField, this.board.field, theme, this.textFix, null, this.tableX())
    this.water.style.background = theme.water
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    this.water.classList.toggle('still', !s.caustics || pres || !!reduce)
    for (const p of this.board.pieces) this.views.get(p.id)?.style(p, s.teamColors, this.textFix, s.showNames)
    this.strokesChanged()
    this.overlaysDirty = true
    this.kick()
  }

  piecesChanged() {
    const s = settings.value
    const ids = new Set(this.board.pieces.map((p) => p.id))
    for (const [id, pv] of this.views) {
      if (!ids.has(id)) {
        pv.remove()
        this.views.delete(id)
        this.disp.delete(id)
      }
    }
    for (const p of this.board.pieces) {
      let pv = this.views.get(p.id)
      if (!pv) {
        pv = new PieceView(this.gPieces, p.id)
        this.views.set(p.id, pv)
        if (!this.disp.has(p.id)) this.disp.set(p.id, v(p.x, p.y))
      }
      pv.style(p, s.teamColors, this.textFix, s.showNames)
      pv.highlight(capMenu.value?.id === p.id)
    }
    this.overlaysDirty = true
    this.kick()
  }

  private get strokeMul() {
    return presentation.value ? 1.9 : 1
  }

  private visibleStep() {
    if (this.playOverride) return this.playOverride.step
    return this.board.steps.length ? this.board.currentStep : 0
  }

  strokesChanged() {
    this.gStrokes.replaceChildren()
    const step = this.visibleStep()
    this.shownStep = step
    for (const s of this.board.strokes) if (s.step === step) renderStroke(this.gStrokes, s, this.strokeMul)
  }

  glide(ms = 600) {
    this.glideUntil = performance.now() + ms
    this.glideTau = ms / 3.4
    this.overlaysDirty = true
    this.kick()
  }

  kick() {
    if (!this.raf) {
      this.lastTs = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  spacing() {
    return this.r * 2 * 0.9
  }

  /**
   * Haal overlap weg: vaste caps blijven staan, de rest krijgt de dichtstbijzijnde
   * vrije plek bij waar hij hoort (caps zijn op het scherm groter dan een hoofd).
   */
  separate(fixedIds: Set<string> = new Set()) {
    const b = this.board
    const { length: L, width: W } = b.field
    const bounds = { x0: 0.2, y0: 0.2, x1: L - 0.2, y1: W - 0.2 }
    const min = this.r * 2 * 0.9
    const inPlay = b.pieces.filter((p) => !isExcluded(p))
    const placed: Vec[] = inPlay.filter((p) => fixedIds.has(p.id)).map((p) => v(p.x, p.y))
    // eerst wie het dichtst bij het doel ligt: die plekken zijn het krapst
    const movers = inPlay.filter((p) => !fixedIds.has(p.id))
    const goal = attackGoal(b.attacking, b.field)
    movers.sort((a, c) => dist(a, goal) - dist(c, goal))
    for (const p of movers) {
      const spot = nearestFreeSpot(v(p.x, p.y), placed, min, bounds)
      p.x = spot.x
      p.y = spot.y
      placed.push(spot)
    }
  }

  /**
   * Bij het openen: liggen caps over elkaar (bijv. een bord dat op een groter
   * scherm is gemaakt), schuif de verdedigers dan opzij.
   */
  private ensureSeparated() {
    const ps = this.board.pieces.filter((p) => !isExcluded(p))
    const min = this.r * 2 * 0.75
    const overlap = ps.some((a, i) => ps.slice(i + 1).some((b) => dist(a, b) < min))
    if (!overlap) return
    this.separate(new Set(ps.filter((p) => p.team === this.board.attacking).map((p) => p.id)))
    commit()
  }

  // ── Pass ────────────────────────────────────────────────────────────────

  passTo(id: string) {
    const b = this.board
    const to = b.pieces.find((p) => p.id === id)
    if (!to) return
    const from = { ...this.ballDisp }
    const d = dist(from, this.disp.get(id) ?? to)
    this.flight = { from, to: id, t0: performance.now(), dur: 260 + d * 38 }
    b.ball = { x: to.x, y: to.y, holder: id }
    commit()
    this.overlaysDirty = true
    this.kick()
  }

  // ── Hoofdlus ─────────────────────────────────────────────────────────────

  private tick = (ts: number) => {
    this.raf = 0
    const dt = Math.min(64, ts - this.lastTs)
    this.lastTs = ts
    const b = this.board
    let active = false

    // afspelen / scrubben
    const pb = playback.value
    if (pb.playing && b.steps.length > 1) {
      let t = pb.t + ((dt / 1000) * pb.speed) / SEGMENT_SECONDS
      const end = b.steps.length - 1
      let playing = true
      if (t >= end) {
        if (pb.loop) t = t - end
        else {
          t = end
          playing = false
        }
      }
      playback.value = { ...pb, t, playing }
      this.computePlayFrame(t)
      active = playing
      if (!playing) this.finishPlayback(t)
    } else if (pb.scrubbing && b.steps.length > 1) {
      this.computePlayFrame(pb.t)
    } else if (this.playOverride) {
      this.playOverride = null
      this.strokesChanged()
    }

    // automatische verdediging
    if (!this.playOverride && autoDefense.value.enabled) this.applyAutoDefense()

    // weergaveposities laten drijven
    const now = performance.now()
    const gliding = now < this.glideUntil
    const dragged = new Set<string>()
    for (const g of this.gestures.values()) if (g.kind === 'piece') dragged.add(g.id)
    for (const p of b.pieces) {
      const target = this.playOverride ? (this.playOverride.pos.get(p.id) ?? v(p.x, p.y)) : v(p.x, p.y)
      let d = this.disp.get(p.id)
      if (!d) {
        d = { ...target }
        this.disp.set(p.id, d)
      }
      const tau = this.playOverride ? 1 : dragged.has(p.id) ? 26 : gliding ? this.glideTau : 70
      const k = 1 - Math.exp(-dt / tau)
      const dx = target.x - d.x
      const dy = target.y - d.y
      if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
        d.x += dx * k
        d.y += dy * k
        active = true
      } else {
        d.x = target.x
        d.y = target.y
      }
    }
    if (gliding) active = true

    // bal
    let lift = 0
    if (this.playOverride) {
      this.ballDisp = { ...this.playOverride.ball }
      lift = this.playOverride.lift
    } else if (this.flight) {
      const f = this.flight
      const u = Math.min(1, (now - f.t0) / f.dur)
      const to = this.heldBallPos(f.to)
      const e = easeInOut(u)
      const base = v(f.from.x + (to.x - f.from.x) * e, f.from.y + (to.y - f.from.y) * e)
      const dir = unit(sub(to, f.from))
      const arc = Math.sin(Math.PI * u) * Math.min(1.1, dist(f.from, to) * 0.08)
      this.ballDisp = v(base.x - dir.y * arc, base.y + dir.x * arc)
      lift = Math.sin(Math.PI * u)
      if (u >= 1) this.flight = null
      active = true
    } else {
      const target = b.ball.holder ? this.heldBallPos(b.ball.holder) : v(b.ball.x, b.ball.y)
      const k = 1 - Math.exp(-dt / 40)
      const dx = target.x - this.ballDisp.x
      const dy = target.y - this.ballDisp.y
      if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
        this.ballDisp.x += dx * k
        this.ballDisp.y += dy * k
        active = true
      } else this.ballDisp = target
    }

    // DOM bijwerken
    const total = settings.value.exclusionSeconds
    const wall = Date.now()
    for (const p of b.pieces) {
      const pv = this.views.get(p.id)
      const d = this.disp.get(p.id)
      if (!pv || !d) continue
      pv.place(d.x, d.y, this.r)
      const holder = (this.playOverride ? null : b.ball.holder) === p.id
      const aim = holder ? attackGoal(p.team, b.field) : this.ballDisp
      const ang = (Math.atan2(aim.y - d.y, aim.x - d.x) * 180) / Math.PI
      if (dist(aim, d) > 0.05) pv.face(ang)
      const excl = this.playOverride ? (this.playOverride.excluded[p.id] ? 0 : null) : p.excludedUntil
      if (excl == null) pv.exclusion(null, total)
      else if (excl === 0) pv.exclusion(0, 0)
      else pv.exclusion(Math.max(0, (excl - wall) / 1000), total)
    }
    this.ballView.place(this.ballDisp.x, this.ballDisp.y, this.r * 0.44, lift)

    // analyse-lagen: bij beweging max ~30× per seconde
    const anyLayer = layers.value.passes || layers.value.shot || layers.value.voronoi
    if (anyLayer && (this.overlaysDirty || active) && ts - this.lastOverlay > 30) {
      this.drawOverlays()
      this.lastOverlay = ts
      this.overlaysDirty = false
    } else if (!anyLayer && this.overlaysDirty) {
      this.gVoronoi.replaceChildren()
      this.gAnalysis.replaceChildren()
      this.gShot.replaceChildren()
      this.overlaysDirty = false
    }
    if (anyLayer && active) this.overlaysDirty = true

    if (active || this.overlaysDirty) this.kick()
  }

  private heldBallPos(id: string): Vec {
    const d = this.disp.get(id)
    const p = this.board.pieces.find((q) => q.id === id)
    return d && p ? this.handPos(p, d) : this.ballDisp
  }

  /** De bal ligt aan de werphand, schuin richting het doel waarop de speler aanvalt. */
  private handPos(p: Piece, at: Vec): Vec {
    const g = attackGoal(p.team, this.board.field)
    const ang = Math.atan2(g.y - at.y, g.x - at.x) + (p.team === 'white' ? 0.7 : -0.7)
    return v(at.x + Math.cos(ang) * this.r * 1.02, at.y + Math.sin(ang) * this.r * 1.02)
  }

  private inPlay = (id: string) => {
    if (this.playOverride) return !this.playOverride.excluded[id]
    const p = this.board.pieces.find((q) => q.id === id)
    return !!p && !isExcluded(p)
  }

  private drawOverlays() {
    const l = layers.value
    const o: OverlayInput = {
      board: this.board,
      pos: (id) => this.disp.get(id) ?? v(0, 0),
      ball: this.ballDisp,
      holder: this.playOverride ? this.holderAt(this.ballDisp) : this.board.ball.holder,
      r: this.r,
      textFix: this.textFix,
      mul: this.strokeMul,
      colors: settings.value.teamColors,
      inPlay: this.inPlay,
    }
    if (l.voronoi) drawVoronoi(this.gVoronoi, o)
    else this.gVoronoi.replaceChildren()
    if (l.passes) drawPassLanes(this.gAnalysis, o)
    else this.gAnalysis.replaceChildren()
    if (l.shot) drawShotWindow(this.gShot, o)
    else this.gShot.replaceChildren()
  }

  private holderAt(ball: Vec): string | null {
    let best: string | null = null
    let bd = this.r * 1.6
    for (const [id, d] of this.disp) {
      const dd = dist(d, ball)
      if (dd < bd) {
        bd = dd
        best = id
      }
    }
    return best
  }

  // ── Automatische verdediging ─────────────────────────────────────────────

  private applyAutoDefense() {
    const b = this.board
    const ad = autoDefense.value
    const A = b.attacking
    const D = otherTeam(A)
    const f = { length: b.field.length, width: b.field.width }
    const dragged = new Set<string>()
    for (const g of this.gestures.values()) if (g.kind === 'piece') dragged.add(g.id)
    const attackers = b.pieces.filter((p) => p.team === A && !p.keeper && !isExcluded(p)).map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } }))
    const defenders = b.pieces.filter((p) => p.team === D && !p.keeper && !isExcluded(p))
    const holder = b.ball.holder ? b.pieces.find((p) => p.id === b.ball.holder) : null
    const ball = holder ? v(holder.x, holder.y) : v(b.ball.x, b.ball.y)
    const marks: Record<string, string | null> = {}
    for (const d of defenders) marks[d.id] = d.marks ?? null
    const r = defenseTargets(
      ad.mode,
      A,
      f,
      attackers,
      defenders.map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } })),
      ball,
      b.ball.holder,
      marks,
    )
    const minSep = this.r * 2 * 0.86
    const byId = new Map(attackers.map((a) => [a.id, a.pos]))
    for (const d of defenders) {
      if (dragged.has(d.id)) continue
      let t = r.targets[d.id]
      if (!t) continue
      const m = r.marks[d.id]
      const ap = m ? byId.get(m) : undefined
      // de caps zijn groter dan een echt hoofd: houd visueel afstand
      if (ap && dist(ap, t) < minSep) {
        const dir = unit(sub(t, ap))
        const safe = dir.x === 0 && dir.y === 0 ? unit(sub(attackGoal(A, f), ap)) : dir
        t = v(ap.x + safe.x * minSep, ap.y + safe.y * minSep)
      }
      d.x = t.x
      d.y = t.y
      d.marks = m
    }
    if (ad.keeper) {
      const k = b.pieces.find((p) => p.team === D && p.keeper && !isExcluded(p))
      if (k && !dragged.has(k.id)) {
        const t = keeperTarget(A, f, ball)
        k.x = t.x
        k.y = t.y
      }
    }
  }

  // ── Afspelen van stappen ─────────────────────────────────────────────────

  private frameAt(i: number): Frame {
    const b = this.board
    if (i === b.currentStep) {
      // de huidige stap staat live in het document
      const pos: Frame['pos'] = {}
      const excluded: Frame['excluded'] = {}
      for (const p of b.pieces) {
        pos[p.id] = { x: p.x, y: p.y }
        excluded[p.id] = isExcluded(p)
      }
      return { pos, ball: { ...b.ball }, excluded }
    }
    return b.steps[i]
  }

  private computePlayFrame(t: number) {
    const b = this.board
    const n = b.steps.length
    const i = Math.min(n - 2, Math.floor(t))
    const u = clamp(t - i, 0, 1)
    const e = easeInOut(u)
    const A = this.frameAt(i)
    const B = this.frameAt(i + 1)
    const pos = new Map<string, Vec>()
    for (const p of b.pieces) {
      const a = A.pos[p.id] ?? v(p.x, p.y)
      const bb = B.pos[p.id] ?? a
      const route = b.strokes.find((s) => s.step === i && s.kind === 'swim' && s.pieceId === p.id)
      if (route) {
        const pts = [a, ...strokeVecs(route), bb]
        pos.set(p.id, alongPolyline(pts, e))
      } else pos.set(p.id, v(a.x + (bb.x - a.x) * e, a.y + (bb.y - a.y) * e))
    }
    // bal: blijft bij de oude houder, vliegt, en landt bij de nieuwe
    const ballFrom = (fr: Frame, at: Map<string, Vec>) => {
      const p = fr.ball.holder ? b.pieces.find((q) => q.id === fr.ball.holder) : undefined
      const d = p ? at.get(p.id) : undefined
      return p && d ? this.handPos(p, d) : v(fr.ball.x, fr.ball.y)
    }
    let ball: Vec
    let lift = 0
    const same = A.ball.holder && A.ball.holder === B.ball.holder
    if (same) ball = ballFrom(A, pos)
    else {
      const w0 = 0.3
      const w1 = 0.78
      const pa = ballFrom(A, pos)
      const pbb = ballFrom(B, pos)
      if (u <= w0) ball = pa
      else if (u >= w1) ball = pbb
      else {
        const k = easeInOut((u - w0) / (w1 - w0))
        ball = v(pa.x + (pbb.x - pa.x) * k, pa.y + (pbb.y - pa.y) * k)
        lift = Math.sin(Math.PI * k) * (dist(pa, pbb) > 2 ? 1 : 0.4)
      }
    }
    const excluded = u < 0.5 ? A.excluded : B.excluded
    const step = u < 0.97 ? i : i + 1
    const stepChanged = !this.playOverride || this.playOverride.step !== step
    this.playOverride = { pos, ball, lift, excluded, step }
    if (stepChanged || this.shownStep !== step) this.strokesChanged()
    this.overlaysDirty = true
  }

  private finishPlayback(t: number) {
    const target = Math.round(t)
    this.playOverride = null
    // zet de bewerkte stap op de eindstand
    window.dispatchEvent(new CustomEvent('polobord:goto-step', { detail: target }))
  }

  play() {
    const pb = playback.value
    const n = this.board.steps.length
    if (n < 2) return
    const t = pb.t >= n - 1 - 1e-3 ? 0 : pb.t
    playback.value = { ...pb, t, playing: true }
    this.kick()
  }

  stop() {
    const pb = playback.value
    if (!pb.playing) return
    playback.value = { ...pb, playing: false }
    this.finishPlayback(pb.t)
    this.kick()
  }

  seek(t: number) {
    playback.value = { ...playback.value, t }
    this.kick()
  }

  // ── Invoer ─────────────────────────────────────────────────────────────

  private toWorld(e: PointerEvent | { clientX: number; clientY: number }): Vec {
    if (!this.inverse) {
      const m = this.world.getScreenCTM()
      this.inverse = m ? m.inverse() : new DOMMatrix()
    }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(this.inverse)
    return v(p.x, p.y)
  }

  private hitPiece(w: Vec): string | null {
    let best: string | null = null
    let bd = this.r * 1.2
    for (const p of this.board.pieces) {
      const d = this.disp.get(p.id) ?? v(p.x, p.y)
      const dd = dist(d, w)
      if (dd < bd) {
        bd = dd
        best = p.id
      }
    }
    return best
  }

  private hitBall(w: Vec, pieceHit: string | null): boolean {
    const d = dist(this.ballDisp, w)
    const rb = this.r * 0.44
    if (d > Math.max(rb * 1.5, 0.35)) return false
    if (!pieceHit) return true
    const pd = dist(this.disp.get(pieceHit)!, w)
    return d < pd
  }

  private onDown = (e: PointerEvent) => {
    if (locked.value || this.playOverride) return
    e.preventDefault()
    unlockAudio()
    if (capMenu.value) {
      capMenu.value = null
      return
    }
    this.inverse = null
    const w = this.toWorld(e)
    const isPen = e.pointerType === 'pen'
    const t = tool.value
    const pieceHit = this.hitPiece(w)
    const ballHit = this.hitBall(w, pieceHit)
    try {
      this.svg.setPointerCapture(e.pointerId)
    } catch {
      /* pointer al weg */
    }

    if (t === 'erase') {
      const g: Gesture = { kind: 'erase', removed: 0 }
      this.gestures.set(e.pointerId, g)
      this.eraseAt(w, g)
      return
    }
    if (t === 'measure') {
      const snap = pieceHit ? { ...this.disp.get(pieceHit)! } : ballHit ? { ...this.ballDisp } : w
      this.measureAB = [snap, snap]
      this.gestures.set(e.pointerId, { kind: 'measure' })
      this.drawMeasure()
      return
    }
    const wantsDraw = isPen ? true : t === 'draw' && !settings.value.penOnlyDraws
    if (wantsDraw) {
      const kind = lineKind.value
      // een pass of schot begint bij de bal, een zwemlijn bij de speler
      const start = ballHit && kind !== 'swim' ? { ...this.ballDisp } : pieceHit ? this.disp.get(pieceHit)! : w
      const stroke: Stroke = {
        id: newId('s'),
        kind,
        color: drawColor.value,
        points: [[start.x, start.y, isPen ? e.pressure : 0.5]],
        step: this.board.steps.length ? this.board.currentStep : 0,
        pieceId: kind === 'swim' ? pieceHit : null,
      }
      if (pieceHit && !ballHit && kind !== 'swim') stroke.points[0] = [w.x, w.y, isPen ? e.pressure : 0.5]
      const under = el('path', { fill: 'none', stroke: 'rgba(0,25,50,0.35)', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.gLive)
      const path = el('path', { fill: 'none', stroke: stroke.color, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.gLive)
      const g: Gesture = { kind: 'draw', stroke, path, under, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, onPiece: pieceHit, lp: 0 }
      if (pieceHit) g.lp = window.setTimeout(() => this.longPress(e.pointerId, pieceHit, e.clientX, e.clientY), LONG_PRESS_MS)
      this.gestures.set(e.pointerId, g)
      return
    }
    if (ballHit) {
      const b = this.board
      b.ball = { x: this.ballDisp.x, y: this.ballDisp.y, holder: null }
      this.flight = null
      this.gestures.set(e.pointerId, { kind: 'ball', off: sub(w, this.ballDisp), sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false })
      return
    }
    if (pieceHit) {
      const p = this.board.pieces.find((q) => q.id === pieceHit)!
      const g: Gesture = {
        kind: 'piece',
        id: pieceHit,
        off: sub(w, v(p.x, p.y)),
        sx: e.clientX,
        sy: e.clientY,
        t0: performance.now(),
        moved: false,
        lp: window.setTimeout(() => this.longPress(e.pointerId, pieceHit, e.clientX, e.clientY), LONG_PRESS_MS),
      }
      this.gestures.set(e.pointerId, g)
      return
    }
    this.gestures.set(e.pointerId, { kind: 'none' })
  }

  private longPress(pointerId: number, id: string, x: number, y: number) {
    const g = this.gestures.get(pointerId)
    if (!g) return
    if ((g.kind === 'piece' || g.kind === 'draw') && !g.moved) {
      if (g.kind === 'draw') {
        g.path.remove()
        g.under.remove()
      }
      this.gestures.set(pointerId, { kind: 'none' })
      navigator.vibrate?.(15)
      capMenu.value = { id, x, y }
    }
  }

  private onMove = (e: PointerEvent) => {
    const g = this.gestures.get(e.pointerId)
    if (!g) return
    e.preventDefault()
    const events = (e.getCoalescedEvents?.() ?? []).length ? e.getCoalescedEvents() : [e]
    const w = this.toWorld(e)
    const b = this.board
    const { length: L, width: W } = b.field

    if (g.kind === 'piece' || g.kind === 'ball' || g.kind === 'draw') {
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > TAP_PX) {
        g.moved = true
        if (g.kind !== 'ball') clearTimeout(g.lp)
      }
    }

    switch (g.kind) {
      case 'piece': {
        if (!g.moved) return
        const p = b.pieces.find((q) => q.id === g.id)
        if (!p) return
        p.x = clamp(w.x - g.off.x, 0.15, L - 0.15)
        p.y = clamp(w.y - g.off.y, 0.15, W - 0.15)
        // uit de terugkeerzone gesleept: weer in het spel
        if (p.excludedUntil != null) {
          const home = reentrySpot(p.team, b)
          if (dist(v(p.x, p.y), home) > 3) p.excludedUntil = null
        }
        // zachte botsing: anderen schuiven opzij
        const fixed = new Set<string>()
        for (const gg of this.gestures.values()) if (gg.kind === 'piece') fixed.add(gg.id)
        const items = b.pieces.filter((q) => !isExcluded(q) || fixed.has(q.id)).map((q) => ({ id: q.id, pos: { x: q.x, y: q.y } }))
        resolveCollisions(items, this.r * 2 * 0.9, fixed, { x0: 0.2, y0: 0.2, x1: L - 0.2, y1: W - 0.2 }, 3)
        for (const it of items) {
          const q = b.pieces.find((x) => x.id === it.id)!
          q.x = it.pos.x
          q.y = it.pos.y
        }
        this.overlaysDirty = true
        this.kick()
        return
      }
      case 'ball': {
        b.ball = { x: clamp(w.x - g.off.x, -0.4, L + 0.4), y: clamp(w.y - g.off.y, 0.1, W - 0.1), holder: null }
        this.overlaysDirty = true
        this.kick()
        return
      }
      case 'draw': {
        for (const ev of events) {
          const q = this.toWorld(ev)
          const last = g.stroke.points[g.stroke.points.length - 1]
          if (Math.hypot(q.x - last[0], q.y - last[1]) < 0.04) continue
          g.stroke.points.push([q.x, q.y, ev.pointerType === 'pen' ? ev.pressure : 0.5])
        }
        if (!g.moved) return
        const lp = livePath(g.stroke, this.strokeMul)
        if (lp.fill) {
          g.path.setAttribute('d', lp.d)
          g.path.setAttribute('fill', g.stroke.color)
          g.path.setAttribute('stroke', 'none')
          g.under.setAttribute('d', '')
        } else {
          g.path.setAttribute('d', lp.d)
          g.path.setAttribute('stroke-width', String(lp.width))
          if (lp.dash) g.path.setAttribute('stroke-dasharray', lp.dash)
          g.under.setAttribute('d', lp.d)
          g.under.setAttribute('stroke-width', String(lp.width + 0.07))
          if (lp.dash) g.under.setAttribute('stroke-dasharray', lp.dash)
        }
        return
      }
      case 'erase':
        this.eraseAt(w, g)
        return
      case 'measure': {
        if (!this.measureAB) return
        const pieceHit = this.hitPiece(w)
        const snap = pieceHit ? { ...this.disp.get(pieceHit)! } : w
        this.measureAB = [this.measureAB[0], snap]
        this.drawMeasure()
        return
      }
    }
  }

  private onUp = (e: PointerEvent) => {
    const g = this.gestures.get(e.pointerId)
    this.gestures.delete(e.pointerId)
    if (!g) return
    const b = this.board
    switch (g.kind) {
      case 'piece': {
        clearTimeout(g.lp)
        if (!g.moved) {
          if (performance.now() - g.t0 < LONG_PRESS_MS) this.tapPiece(g.id)
          return
        }
        commit()
        this.kick()
        return
      }
      case 'ball': {
        // bal losgelaten op een cap: die speler heeft de bal
        const target = this.hitPiece(v(b.ball.x, b.ball.y))
        if (target) {
          const p = b.pieces.find((q) => q.id === target)!
          if (!isExcluded(p)) b.ball = { x: p.x, y: p.y, holder: target }
        }
        commit()
        this.kick()
        return
      }
      case 'draw': {
        clearTimeout(g.lp)
        g.path.remove()
        g.under.remove()
        if (!g.moved) {
          if (g.onPiece && performance.now() - g.t0 < LONG_PRESS_MS) this.tapPiece(g.onPiece)
          return
        }
        const pts = g.stroke.points
        let len = 0
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        if (len < 0.35 && g.stroke.kind !== 'free') return
        b.strokes.push(g.stroke)
        this.strokesChanged()
        commit()
        return
      }
      case 'erase':
        if (g.removed) commit()
        return
    }
  }

  private onCancel = (e: PointerEvent) => {
    const g = this.gestures.get(e.pointerId)
    this.gestures.delete(e.pointerId)
    if (!g) return
    if (g.kind === 'draw') {
      clearTimeout(g.lp)
      g.path.remove()
      g.under.remove()
    }
    if (g.kind === 'piece') {
      clearTimeout(g.lp)
      if (g.moved) commit()
    }
    if (g.kind === 'ball') commit()
  }

  private tapPiece(id: string) {
    const b = this.board
    const p = b.pieces.find((q) => q.id === id)
    if (!p || isExcluded(p)) return
    const holder = b.ball.holder ? b.pieces.find((q) => q.id === b.ball.holder) : null
    if (holder && holder.id !== id && holder.team === p.team) {
      this.passTo(id)
      return
    }
    // vrije bal vlakbij: oppakken
    if (!b.ball.holder && dist(v(b.ball.x, b.ball.y), v(p.x, p.y)) < this.r * 2.2) {
      b.ball = { x: p.x, y: p.y, holder: id }
      commit()
      this.kick()
    }
  }

  private eraseAt(w: Vec, g: { removed: number }) {
    const b = this.board
    const step = this.visibleStep()
    const before = b.strokes.length
    const radius = Math.max(0.35, this.r * 0.6)
    b.strokes = b.strokes.filter((s) => s.step !== step || !strokeHit(s, w, radius))
    if (b.strokes.length !== before) {
      g.removed += before - b.strokes.length
      this.strokesChanged()
    }
  }

  private drawMeasure() {
    const gm = this.gMeasure
    gm.replaceChildren()
    if (!this.measureAB) return
    const [a, b] = this.measureAB
    const mul = this.strokeMul
    el('line', { x1: f2(a.x), y1: f2(a.y), x2: f2(b.x), y2: f2(b.y), stroke: 'rgba(0,20,40,0.55)', 'stroke-width': 0.14 * mul, 'stroke-linecap': 'round' }, gm)
    el('line', { x1: f2(a.x), y1: f2(a.y), x2: f2(b.x), y2: f2(b.y), stroke: '#ffffff', 'stroke-width': 0.07 * mul, 'stroke-dasharray': '0.3 0.18', 'stroke-linecap': 'round' }, gm)
    for (const p of [a, b]) el('circle', { cx: f2(p.x), cy: f2(p.y), r: 0.16 * mul, fill: '#ffd21f', stroke: '#1b2a38', 'stroke-width': 0.04 }, gm)
    const d = dist(a, b)
    const mid = v((a.x + b.x) / 2, (a.y + b.y) / 2)
    const tg = el('g', { transform: `translate(${f2(mid.x)} ${f2(mid.y - 0.7 * mul)}) ${this.textFix}` }, gm)
    const label = `${d.toFixed(1).replace('.', ',')} m`
    const fs = 0.62 * mul
    el('rect', { x: -fs * 1.7, y: -fs * 0.72, width: fs * 3.4, height: fs * 1.44, rx: fs * 0.3, fill: 'rgba(11,25,38,0.85)' }, tg)
    el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#ffffff', 'font-family': FONT_NUM, 'font-weight': 700, 'font-size': fs }, tg).textContent = label
  }

  private drawGhosts(list: { pos: Vec; label?: string; color?: string }[]) {
    const g = this.gGhost
    g.replaceChildren()
    for (const gh of list) {
      const c = gh.color ?? '#ffd21f'
      el('circle', { cx: f2(gh.pos.x), cy: f2(gh.pos.y), r: this.r * 1.05, fill: c, 'fill-opacity': 0.18, stroke: c, 'stroke-width': 0.09, 'stroke-dasharray': '0.25 0.15' }, g)
      if (gh.label) {
        const tg = el('g', { transform: `translate(${f2(gh.pos.x)} ${f2(gh.pos.y)}) ${this.textFix}` }, g)
        el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: c, 'font-family': FONT_NUM, 'font-weight': 700, 'font-size': this.r * 0.9, stroke: 'rgba(0,20,40,0.6)', 'stroke-width': 0.08, 'paint-order': 'stroke' }, tg).textContent = gh.label
      }
    }
  }

  /** Weergavepositie van een cap (voor de quiz en het capmenu). */
  displayPos(id: string): Vec | undefined {
    return this.disp.get(id)
  }

  /** Schermcoördinaten van een wereldpunt. */
  toClient(p: Vec): { x: number; y: number } {
    const m = this.world.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const q = new DOMPoint(p.x, p.y).matrixTransform(m)
    return { x: q.x, y: q.y }
  }

  // ── Export ──────────────────────────────────────────────────────────────

  async exportPng() {
    const clone = this.svg.cloneNode(true) as SVGSVGElement
    clone.querySelectorAll('[data-live]').forEach((n) => n.replaceChildren())
    const theme = FIELD_THEMES[settings.value.theme]
    clone.querySelector('rect.water')?.setAttribute('fill', theme.water)
    const outW = 2400
    const outH = Math.round((outW * this.vb.h) / this.vb.w)
    clone.setAttribute('width', String(outW))
    clone.setAttribute('height', String(outH))
    // lettertype meenemen, anders valt het terug op een systeemletter
    try {
      const css = await fontCss()
      const style = document.createElementNS(SVGNS, 'style')
      style.textContent = css
      clone.insertBefore(style, clone.firstChild)
    } catch {
      /* zonder eigen letter */
    }
    const xml = new XMLSerializer().serializeToString(clone)
    const img = new Image()
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('export mislukt'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = theme.deck
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)
    URL.revokeObjectURL(url)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const name = `polobord-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
    await shareOrDownload(blob, name)
  }
}

// ── Hulpjes ────────────────────────────────────────────────────────────────

let fontCssCache: string | null = null
async function fontCss(): Promise<string> {
  if (fontCssCache) return fontCssCache
  const toData = async (u: string) => {
    const buf = await (await fetch(u)).arrayBuffer()
    let s = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:font/woff2;base64,${btoa(s)}`
  }
  const [a, b] = await Promise.all([toData(barlow700), toData(barlow600)])
  fontCssCache = `@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(${a}) format('woff2')}@font-face{font-family:'Barlow';font-weight:600;src:url(${b}) format('woff2')}`
  return fontCssCache
}

let audioUnlocked = false
function unlockAudio() {
  if (audioUnlocked) return
  audioUnlocked = true
  window.dispatchEvent(new Event('polobord:user-gesture'))
}
