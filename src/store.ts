/**
 * Centrale toestand: het bord (document), ongedaan maken/opnieuw, UI-signalen
 * en de acties die de panelen aanroepen. Het bord zelf wordt getekend door
 * BoardEngine, die zich hier registreert.
 */
import { computed, signal } from '@preact/signals'
import * as db from './db'
import type { DefenseMode } from './defense'
import { applyInstant, computeFormation, defaultPieces, FORMATIONS, newId, reentrySpot } from './formations'
import { otherTeam } from './geometry'
import { DEFAULT_FIELD, RULES, type FieldSize } from './rules'
import type { Board, Frame, LineKind, Piece, Play, Squad, Team, ViewState } from './types'

// ── Instellingen ───────────────────────────────────────────────────────────

export interface Settings {
  theme: 'bad' | 'tribune'
  caustics: boolean
  showNames: boolean
  penOnlyDraws: boolean
  exclusionSeconds: number
  shotClockFull: number
  shotClockReset: number
  periodMinutes: number
  periods: number
  timeouts: number
  teamColors: { white: string; blue: string }
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'bad',
  caustics: true,
  showNames: false,
  penOnlyDraws: false,
  exclusionSeconds: RULES.exclusion,
  shotClockFull: RULES.shotClock.full,
  shotClockReset: RULES.shotClock.reset,
  periodMinutes: RULES.periods.minutes,
  periods: RULES.periods.count,
  timeouts: RULES.timeouts,
  teamColors: { white: '#f3f5f7', blue: '#173a86' },
}

export const settings = signal<Settings>(DEFAULT_SETTINGS)
export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
  db.kvSet('settings', settings.value)
  engine?.settingsChanged()
}

// ── UI-signalen ────────────────────────────────────────────────────────────

export type Tool = 'move' | 'draw' | 'erase' | 'measure'
export type PanelTab = 'opstellen' | 'plays' | 'analyse' | 'training' | 'team' | 'instellingen'

export const tool = signal<Tool>('move')
export const lineKind = signal<LineKind>('swim')
export const drawColor = signal<string>('#ffffff')
export const view = signal<ViewState>({ half: false, rotated: false, mirrored: false })
export const layers = signal({ passes: false, shot: false, voronoi: false })
export const autoDefense = signal<{ enabled: boolean; mode: DefenseMode; keeper: boolean }>({ enabled: false, mode: 'man', keeper: true })
export const presentation = signal(false)
export const locked = signal(false)
export const panelOpen = signal(true)
export const panelTab = signal<PanelTab>('opstellen')
export const clocksOpen = signal(false)
export const playback = signal({ playing: false, t: 0, speed: 1, loop: false, scrubbing: false })
export const ghosts = signal<{ pos: { x: number; y: number }; label?: string; color?: string }[]>([])
export const capMenu = signal<{ id: string; x: number; y: number } | null>(null)
export const currentPlay = signal<{ id: string; name: string; category: string } | null>(null)
export const plays = signal<Play[]>([])
export const squads = signal<Squad[]>([])
export const teamSquad = signal<{ white: string | null; blue: string | null }>({ white: null, blue: null })

export interface ToastAction {
  label: string
  run: () => void
}
export const toast = signal<{ text: string; actions?: ToastAction[]; id: number } | null>(null)
let toastTimer = 0
export function showToast(text: string, actions?: ToastAction[], ms = 3500) {
  const id = Date.now()
  toast.value = { text, actions, id }
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    if (toast.value?.id === id) toast.value = null
  }, actions?.length ? Math.max(ms, 8000) : ms)
}

export const DRAW_COLORS = [
  { id: 'white', label: 'Wit', value: '#ffffff' },
  { id: 'blue', label: 'Blauw', value: '#0e2a66' },
  { id: 'yellow', label: 'Geel', value: '#ffd21f' },
  { id: 'red', label: 'Rood', value: '#e3342f' },
  { id: 'black', label: 'Zwart', value: '#111111' },
]

// ── Document ───────────────────────────────────────────────────────────────

export function freshBoard(field: FieldSize = DEFAULT_FIELD): Board {
  const b: Board = {
    field,
    pieces: defaultPieces(),
    ball: { x: field.length / 2, y: field.width / 2, holder: null },
    strokes: [],
    attacking: 'white',
    steps: [],
    currentStep: 0,
  }
  applyInstant(b, FORMATIONS.find((f) => f.id === '3-3')!)
  return b
}

export const doc = { board: freshBoard() }
/** telt op bij elke wijziging; panelen luisteren hiernaar */
export const version = signal(0)
const bump = () => (version.value = version.value + 1)

// ── Engine-koppeling ──────────────────────────────────────────────────────

export interface EngineApi {
  reload(): void
  strokesChanged(): void
  piecesChanged(): void
  settingsChanged(): void
  glide(ms?: number): void
  passTo(id: string): void
  kick(): void
  exportPng(): Promise<void>
  play(): void
  stop(): void
  seek(t: number): void
  separate(fixedIds?: Set<string>): void
}
let engine: EngineApi | null = null
export function registerEngine(e: EngineApi) {
  engine = e
}
export const getEngine = () => engine

// ── Ongedaan maken / opnieuw ──────────────────────────────────────────────

const undoStack: string[] = []
const redoStack: string[] = []
let lastSnapshot = JSON.stringify(doc.board)
export const canUndo = signal(false)
export const canRedo = signal(false)
const syncHistory = () => {
  canUndo.value = undoStack.length > 0
  canRedo.value = redoStack.length > 0
}

/** Leg een wijziging vast (voor ongedaan maken) en sla automatisch op. */
export function commit() {
  const s = JSON.stringify(doc.board)
  if (s === lastSnapshot) return
  undoStack.push(lastSnapshot)
  redoStack.length = 0
  lastSnapshot = s
  syncHistory()
  bump()
  scheduleSave()
}

function restore(s: string) {
  lastSnapshot = s
  doc.board = JSON.parse(s)
  engine?.reload()
  syncHistory()
  bump()
  scheduleSave()
}
export function undo() {
  if (!undoStack.length) return
  redoStack.push(JSON.stringify(doc.board))
  restore(undoStack.pop()!)
}
export function redo() {
  if (!redoStack.length) return
  undoStack.push(JSON.stringify(doc.board))
  restore(redoStack.pop()!)
}

/** Vervang het hele bord (laden, reset); blijft ongedaan te maken. */
export function replaceBoard(b: Board) {
  undoStack.push(JSON.stringify(doc.board))
  redoStack.length = 0
  doc.board = b
  lastSnapshot = JSON.stringify(b)
  engine?.reload()
  syncHistory()
  bump()
  scheduleSave()
}

let saveTimer = 0
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => db.kvSet('board', doc.board).catch(() => {}), 300)
}

// ── Acties: bord ──────────────────────────────────────────────────────────

export const pieceById = (id: string) => doc.board.pieces.find((p) => p.id === id)
export const isExcluded = (p: Piece) => p.excludedUntil != null

export function applyFormation(id: string) {
  const fm = FORMATIONS.find((f) => f.id === id)
  if (!fm) return
  const b = doc.board
  const r = computeFormation(b, fm)
  for (const p of b.pieces) {
    const t = r.targets[p.id]
    if (t) {
      p.x = t.x
      p.y = t.y
    }
    if (r.excluded[p.id] != null) {
      if (r.excluded[p.id]) p.excludedUntil = p.excludedUntil && p.excludedUntil > 0 ? p.excludedUntil : 0
      else p.excludedUntil = null
    }
    if (r.roles[p.id]) p.role = r.roles[p.id]
    if (r.marks[p.id] !== undefined) p.marks = r.marks[p.id]
  }
  b.ball = r.ball
  if (r.defense) autoDefense.value = { ...autoDefense.value, mode: r.defense }
  // caps zijn groter dan een hoofd: aanvallers en keepers blijven staan, verdedigers schuiven
  engine?.separate(new Set(b.pieces.filter((p) => p.team === b.attacking || p.keeper).map((p) => p.id)))
  if (b.ball.holder) {
    const h = pieceById(b.ball.holder)
    if (h) b.ball = { x: h.x, y: h.y, holder: h.id }
  }
  engine?.glide(650)
  commit()
}

export function setAttacking(t: Team) {
  if (doc.board.attacking === t) return
  doc.board.attacking = t
  engine?.reload()
  commit()
}

export function setView(patch: Partial<ViewState>) {
  view.value = { ...view.value, ...patch }
  db.kvSet('view', view.value)
}

/** Nieuwe veldmaat: posities en lijnen schalen mee. */
export function setField(field: FieldSize) {
  const b = doc.board
  const sx = field.length / b.field.length
  const sy = field.width / b.field.width
  for (const p of b.pieces) {
    p.x *= sx
    p.y *= sy
  }
  b.ball.x *= sx
  b.ball.y *= sy
  for (const s of b.strokes) s.points = s.points.map(([x, y, pr]) => [x * sx, y * sy, pr])
  for (const fr of b.steps) {
    for (const k of Object.keys(fr.pos)) fr.pos[k] = { x: fr.pos[k].x * sx, y: fr.pos[k].y * sy }
    fr.ball = { ...fr.ball, x: fr.ball.x * sx, y: fr.ball.y * sy }
  }
  b.field = field
  engine?.reload()
  commit()
}

export function addPiece(team: Team) {
  const b = doc.board
  const used = new Set(b.pieces.filter((p) => p.team === team).map((p) => p.num))
  const num = [...RULES.players.fieldNumbers, ...RULES.players.keeperNumbers].find((n) => !used.has(n)) ?? used.size + 1
  const keeper = !b.pieces.some((p) => p.team === team && p.keeper) && (RULES.players.keeperNumbers as readonly number[]).includes(num)
  const { length: L, width: W } = b.field
  b.pieces.push({
    id: newId(team[0]),
    team,
    num,
    role: keeper ? 'keeper' : 'none',
    keeper,
    x: team === 'white' ? L / 2 - 1.5 : L / 2 + 1.5,
    y: W / 2 + (Math.random() - 0.5) * 4,
  })
  applySquadNames()
  engine?.piecesChanged()
  commit()
}

export function removePiece(id: string) {
  const b = doc.board
  b.pieces = b.pieces.filter((p) => p.id !== id)
  if (b.ball.holder === id) b.ball.holder = null
  for (const p of b.pieces) if (p.marks === id) p.marks = null
  engine?.piecesChanged()
  commit()
}

export function updatePiece(id: string, patch: Partial<Piece>) {
  const p = pieceById(id)
  if (!p) return
  Object.assign(p, patch)
  if (patch.num != null && !patch.name) applySquadNames()
  engine?.piecesChanged()
  commit()
}

export function giveBall(id: string) {
  const p = pieceById(id)
  if (!p) return
  doc.board.ball = { x: p.x, y: p.y, holder: id }
  engine?.kick()
  commit()
}

export function passTo(id: string) {
  engine?.passTo(id)
}

export function excludePiece(id: string) {
  const p = pieceById(id)
  if (!p) return
  const b = doc.board
  const inZone = b.pieces.filter((q) => q.team === p.team && q.id !== p.id && isExcluded(q)).length
  const spot = reentrySpot(p.team, b, inZone)
  p.x = spot.x
  p.y = spot.y
  p.excludedUntil = Date.now() + settings.value.exclusionSeconds * 1000
  if (b.ball.holder === id) {
    b.ball = { x: b.ball.x, y: b.ball.y, holder: null }
  }
  engine?.glide(900)
  commit()
  suggestPowerPlay(p.team)
}

export function returnPiece(id: string) {
  const p = pieceById(id)
  if (!p) return
  p.excludedUntil = null
  const { length: L } = doc.board.field
  p.x = p.team === 'white' ? Math.min(p.x + 2, L / 2) : Math.max(p.x - 2, L / 2)
  engine?.glide(600)
  commit()
}

/** Na een uitsluiting: stel de juiste over-/ondertalopstelling voor. */
function suggestPowerPlay(excludedTeam: Team) {
  const b = doc.board
  const man = otherTeam(excludedTeam)
  const inWater = (t: Team) => b.pieces.filter((p) => p.team === t && !p.keeper && !isExcluded(p)).length
  const up = inWater(man)
  const down = inWater(excludedTeam)
  if (up <= down) return
  const apply = (fid: string) => {
    if (b.attacking !== man) {
      b.attacking = man
      engine?.reload()
    }
    applyFormation(fid)
  }
  const label = man === 'white' ? 'Wit' : 'Blauw'
  if (down === 5 && up === 6) {
    showToast(`${label} speelt 6 tegen 5. Opstelling kiezen?`, [
      { label: '4-2 · M-zone', run: () => apply('pp-42') },
      { label: '3-3 · 2-3-zone', run: () => apply('pp-33') },
    ])
  } else if (down === 4 && up === 5) {
    showToast(`${label} speelt 5 tegen 4.`, [{ label: '5 tegen 4', run: () => apply('5-4') }])
  }
}

export function clearStrokes() {
  const b = doc.board
  const step = b.steps.length ? b.currentStep : 0
  const before = b.strokes.length
  b.strokes = b.strokes.filter((s) => s.step !== step)
  if (b.strokes.length === before) return
  engine?.strokesChanged()
  commit()
}

export function resetBoard() {
  const b = freshBoard(doc.board.field)
  b.attacking = doc.board.attacking
  applyInstant(b, FORMATIONS.find((f) => f.id === '3-3')!)
  currentPlay.value = null
  replaceBoard(b)
  applySquadNames()
}

// ── Stappen (animatie) ────────────────────────────────────────────────────

export function snapshotFrame(b: Board = doc.board): Frame {
  const pos: Frame['pos'] = {}
  const excluded: Frame['excluded'] = {}
  for (const p of b.pieces) {
    pos[p.id] = { x: p.x, y: p.y }
    excluded[p.id] = isExcluded(p)
  }
  return { pos, ball: { ...b.ball }, excluded }
}

export function loadFrame(fr: Frame, b: Board = doc.board) {
  for (const p of b.pieces) {
    const q = fr.pos[p.id]
    if (q) {
      p.x = q.x
      p.y = q.y
    }
    if (fr.excluded[p.id] != null) p.excludedUntil = fr.excluded[p.id] ? (p.excludedUntil ?? 0) : null
  }
  b.ball = { ...fr.ball }
}

export const stepCount = computed(() => {
  version.value
  return doc.board.steps.length
})

const near = (a: [number, number, number], b: { x: number; y: number }, r: number) => Math.hypot(a[0] - b.x, a[1] - b.y) < r

/**
 * Leg de huidige posities vast en maak een volgende stap. Getekende zwemlijnen
 * vanaf een speler worden routes: in de nieuwe stap staat die speler aan het
 * eind van zijn lijn. Een pass vanaf de balbezitter geeft de bal door, een
 * schot legt hem aan het eind van de schotlijn.
 */
export function addStep() {
  const b = doc.board
  engine?.stop()
  if (!b.steps.length) {
    b.steps = [snapshotFrame(b)]
    b.currentStep = 0
  } else b.steps[b.currentStep] = snapshotFrame(b)
  const cur = b.currentStep
  const next: Frame = JSON.parse(JSON.stringify(b.steps[cur]))
  const mine = b.strokes.filter((s) => s.step === cur)
  for (const s of mine) {
    const last = s.points[s.points.length - 1]
    if (s.kind === 'swim' && s.pieceId && next.pos[s.pieceId]) next.pos[s.pieceId] = { x: last[0], y: last[1] }
  }
  const holder = b.ball.holder ? pieceById(b.ball.holder) : undefined
  if (holder) {
    for (const s of mine) {
      if (s.kind !== 'pass' && s.kind !== 'shot') continue
      if (!near(s.points[0], holder, 2)) continue
      const last = s.points[s.points.length - 1]
      if (s.kind === 'shot') next.ball = { x: last[0], y: last[1], holder: null }
      else {
        let best: string | null = null
        let bd = 2.2
        for (const p of b.pieces) {
          if (p.team !== holder.team || p.id === holder.id) continue
          const q = next.pos[p.id]
          const d = q ? Math.hypot(q.x - last[0], q.y - last[1]) : Infinity
          if (d < bd) {
            bd = d
            best = p.id
          }
        }
        next.ball = best ? { x: next.pos[best].x, y: next.pos[best].y, holder: best } : { x: last[0], y: last[1], holder: null }
      }
    }
  }
  b.steps.splice(cur + 1, 0, next)
  for (const s of b.strokes) if (s.step > cur) s.step += 1
  b.currentStep = cur + 1
  loadFrame(next, b)
  playback.value = { ...playback.value, t: b.currentStep }
  engine?.glide(900)
  engine?.strokesChanged()
  commit()
}

export function gotoStep(i: number) {
  const b = doc.board
  if (!b.steps.length) return
  const target = Math.max(0, Math.min(b.steps.length - 1, i))
  b.steps[b.currentStep] = snapshotFrame(b)
  b.currentStep = target
  loadFrame(b.steps[target], b)
  playback.value = { ...playback.value, t: target }
  engine?.glide(450)
  engine?.strokesChanged()
  commit()
}

export function deleteStep(i: number) {
  const b = doc.board
  if (!b.steps.length) return
  engine?.stop()
  b.steps[b.currentStep] = snapshotFrame(b)
  b.steps.splice(i, 1)
  b.strokes = b.strokes.filter((s) => s.step !== i).map((s) => (s.step > i ? { ...s, step: s.step - 1 } : s))
  if (b.steps.length <= 1) {
    if (b.steps.length === 1) loadFrame(b.steps[0], b)
    b.steps = []
    b.currentStep = 0
  } else {
    b.currentStep = Math.min(i, b.steps.length - 1)
    loadFrame(b.steps[b.currentStep], b)
  }
  playback.value = { ...playback.value, t: b.currentStep, playing: false }
  engine?.glide(450)
  engine?.strokesChanged()
  commit()
}

export function clearSteps() {
  const b = doc.board
  if (!b.steps.length) return
  engine?.stop()
  const keep = b.currentStep
  b.strokes = b.strokes.filter((s) => s.step === keep).map((s) => ({ ...s, step: 0 }))
  b.steps = []
  b.currentStep = 0
  playback.value = { ...playback.value, t: 0, playing: false }
  engine?.strokesChanged()
  commit()
}

window.addEventListener('polobord:goto-step', (e) => gotoStep((e as CustomEvent<number>).detail))

// ── Selecties en namen ────────────────────────────────────────────────────

export function applySquadNames() {
  const map = teamSquad.value
  for (const team of ['white', 'blue'] as Team[]) {
    const sq = squads.value.find((s) => s.id === map[team])
    for (const p of doc.board.pieces) {
      if (p.team !== team) continue
      const pl = sq?.players.find((x) => x.num === p.num)
      p.name = pl?.name || undefined
    }
  }
  engine?.piecesChanged()
}

export async function saveSquad(q: Squad) {
  await db.squadPut(q)
  squads.value = [...squads.value.filter((s) => s.id !== q.id), q].sort((a, b) => a.name.localeCompare(b.name))
  applySquadNames()
}
export async function deleteSquad(id: string) {
  await db.squadDelete(id)
  squads.value = squads.value.filter((s) => s.id !== id)
  const m = teamSquad.value
  setTeamSquad({ white: m.white === id ? null : m.white, blue: m.blue === id ? null : m.blue })
}
export function setTeamSquad(m: { white: string | null; blue: string | null }) {
  teamSquad.value = m
  db.kvSet('teamSquad', m)
  applySquadNames()
  commit()
}

// ── Plays ─────────────────────────────────────────────────────────────────

export async function savePlay(name: string, category: string, asNew: boolean) {
  const now = Date.now()
  const existing = !asNew && currentPlay.value ? plays.value.find((p) => p.id === currentPlay.value!.id) : undefined
  const b: Board = JSON.parse(JSON.stringify(doc.board))
  if (b.steps.length) b.steps[b.currentStep] = snapshotFrame(b)
  const play: Play = {
    id: existing?.id ?? newId('play'),
    name: name.trim() || 'Naamloos',
    category,
    board: b,
    created: existing?.created ?? now,
    updated: now,
  }
  await db.playPut(play)
  plays.value = [...plays.value.filter((p) => p.id !== play.id), play]
  currentPlay.value = { id: play.id, name: play.name, category }
  showToast(`Opgeslagen: ${play.name}`)
}

export function loadPlay(id: string) {
  const p = plays.value.find((x) => x.id === id)
  if (!p) return
  const b: Board = JSON.parse(JSON.stringify(p.board))
  replaceBoard(b)
  currentPlay.value = { id: p.id, name: p.name, category: p.category }
  applySquadNames()
}

export async function deletePlay(id: string) {
  await db.playDelete(id)
  plays.value = plays.value.filter((p) => p.id !== id)
  if (currentPlay.value?.id === id) currentPlay.value = null
}

export async function renamePlay(id: string, name: string, category: string) {
  const p = plays.value.find((x) => x.id === id)
  if (!p) return
  const next = { ...p, name, category, updated: Date.now() }
  await db.playPut(next)
  plays.value = plays.value.map((x) => (x.id === id ? next : x))
  if (currentPlay.value?.id === id) currentPlay.value = { id, name, category }
}

// ── Export / import ───────────────────────────────────────────────────────

export interface ExportFile {
  app: 'polobord'
  version: 1
  exported: string
  plays: Play[]
  squads: Squad[]
  settings?: Settings
}

export function exportJson() {
  const data: ExportFile = {
    app: 'polobord',
    version: 1,
    exported: new Date().toISOString(),
    plays: plays.value,
    squads: squads.value,
    settings: settings.value,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const stamp = new Date().toISOString().slice(0, 10)
  return shareOrDownload(blob, `polobord-${stamp}.json`)
}

export async function importJson(file: File) {
  const text = await file.text()
  let data: ExportFile
  try {
    data = JSON.parse(text)
  } catch {
    showToast('Dit bestand is geen geldige JSON.')
    return
  }
  if (data?.app !== 'polobord' || !Array.isArray(data.plays)) {
    showToast('Dit is geen Polobord-bestand.')
    return
  }
  for (const p of data.plays) await db.playPut(p)
  for (const q of data.squads ?? []) await db.squadPut(q)
  plays.value = await db.playsAll()
  squads.value = await db.squadsAll()
  showToast(`Geïmporteerd: ${data.plays.length} plays, ${(data.squads ?? []).length} selecties`)
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ── Opstarten ─────────────────────────────────────────────────────────────

export async function hydrate() {
  db.requestPersistence()
  try {
    const [s, b, v, ts, ps, qs] = await Promise.all([
      db.kvGet<Settings>('settings'),
      db.kvGet<Board>('board'),
      db.kvGet<ViewState>('view'),
      db.kvGet<{ white: string | null; blue: string | null }>('teamSquad'),
      db.playsAll(),
      db.squadsAll(),
    ])
    if (s) settings.value = { ...DEFAULT_SETTINGS, ...s, teamColors: { ...DEFAULT_SETTINGS.teamColors, ...s.teamColors } }
    if (b?.pieces && b.field) {
      doc.board = { ...freshBoard(b.field), ...b }
      lastSnapshot = JSON.stringify(doc.board)
    }
    if (v) view.value = v
    if (ts) teamSquad.value = ts
    plays.value = ps
    squads.value = qs.sort((a, c) => a.name.localeCompare(c.name))
  } catch (e) {
    console.warn('Opslag niet beschikbaar', e)
  }
  bump()
}
