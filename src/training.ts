/**
 * Positiespellen en trainingsmodules: rotatietrainer 6-5, "Waar sta jij?"-quiz,
 * scenario-generator, overtal-trainer en vaste scenario's (strafworp, start).
 *
 * Alles bouwt een gewoon bord met stappen, zodat afspelen, presentatiemodus en
 * opslaan in de bibliotheek vanzelf werken.
 */
import { signal } from '@preact/signals'
import { defenseTargets, keeperTarget, type DefenseMode } from './defense'
import { applyInstant, computeFormation, FORMATIONS, keeperHome, newId, reentrySpot } from './formations'
import { attackGoal, clamp, dist, fromAttack, inGoalArea, keeperPosition, legalAttackSpot, nearestFreeSpot, toAttack, v } from './geometry'
import { autoDefense, commit, currentPlay, doc, freshBoard, getEngine, ghosts, guides, isExcluded, playback, replaceBoard, setView, showToast } from './store'
import { RULES } from './rules'
import type { BallState, Board, Frame, Piece, Stroke, Team, Vec } from './types'

export type Level = 'makkelijk' | 'gemiddeld' | 'moeilijk'
export const LEVELS: { value: Level; label: string }[] = [
  { value: 'makkelijk', label: 'Makkelijk' },
  { value: 'gemiddeld', label: 'Gemiddeld' },
  { value: 'moeilijk', label: 'Moeilijk' },
]

const MODE_LABEL: Record<DefenseMode, string> = {
  man: 'man-man, doelzijde',
  press: 'pressing, vóór de man',
  drop: 'terugzakken naar 2–5 m',
  M: 'M-zone (5 tegen 6)',
  '2-3': '2-3-zone (5 tegen 6)',
  box: 'box (4 tegen 5)',
}
export const modeLabel = (m: DefenseMode) => MODE_LABEL[m]

export interface TrainerState {
  kind: 'quiz' | 'scenario' | 'keeper' | null
  level: Level
  mode?: DefenseMode
  pieceId?: string
  ideal?: Vec
  result?: { score: number; dist: number }
  targets?: Record<string, Vec>
  shown?: boolean
  rounds: number
  total: number
}
export const trainer = signal<TrainerState>({ kind: null, level: 'makkelijk', rounds: 0, total: 0 })

const A: Team = 'white'
const f = () => ({ length: doc.board.field.length, width: doc.board.field.width })
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

function start(b: Board, opts: { play?: boolean; loop?: boolean; speed?: number } = {}) {
  autoDefense.value = { ...autoDefense.value, enabled: false }
  ghosts.value = []
  currentPlay.value = null
  getEngine()?.stop()
  playback.value = { playing: false, t: 0, speed: opts.speed ?? playback.value.speed, loop: !!opts.loop, scrubbing: false }
  replaceBoard(b)
  setView({ half: true })
  if (opts.play) setTimeout(() => getEngine()?.play(), 450)
}

/**
 * Caps zijn op het scherm groter dan een hoofd: schuif de verdedigers naar de
 * dichtstbijzijnde vrije plek (aanvallers en keepers blijven staan). Eerst de
 * weergave op half bad zetten, want daar hangt de cap-grootte van af.
 */
function spacing(): number {
  setView({ half: true })
  return getEngine()?.spacing() ?? 1.2
}

function separateInto(pos: Record<string, Vec>, fixed: string[], movers: string[], min: number) {
  const F = f()
  const bounds = { x0: 0.2, y0: 0.2, x1: F.length - 0.2, y1: F.width - 0.2 }
  const placed = fixed.filter((id) => pos[id]).map((id) => pos[id])
  const goal = attackGoal(A, F)
  const order = movers.filter((id) => pos[id]).sort((a, b) => dist(pos[a], goal) - dist(pos[b], goal))
  for (const id of order) {
    pos[id] = nearestFreeSpot(pos[id], placed, min, bounds)
    placed.push(pos[id])
  }
}

function emptyBoard(): Board {
  const b = freshBoard(doc.board.field)
  b.attacking = A
  b.strokes = []
  b.steps = []
  b.currentStep = 0
  return b
}

// ── Stappenreeksen bouwen ─────────────────────────────────────────────────

type P = [d: number, s: number]

interface SeqStep {
  /** posities van de aanvallers (wit), in aanvalscoördinaten */
  a: P[]
  /** vaste posities van de verdedigers; weglaten = automatisch volgens `mode` */
  d?: P[]
  /** index van de aanvaller met de bal, of een vrij punt (schot) */
  ball: number | P
}

interface SeqSpec {
  nA: number
  nD: number
  mode?: DefenseMode
  /** uitgesloten verdedigers (staan in de terugkeerzone) */
  exclD?: number
  withWhiteKeeper?: boolean
  steps: SeqStep[]
  /** zwemlijnen tekenen voor aanvallers die flink verplaatsen */
  swimLines?: boolean
  /** posities zijn bewust in het doelgebied, achter de lijn van de bal: niet corrigeren */
  allowBehindBall?: boolean
}

function makePieces(spec: SeqSpec): { white: Piece[]; blue: Piece[]; wk: Piece | null; bk: Piece; exclBlue: Piece[] } {
  const mk = (team: Team, num: number, keeper = false): Piece => ({ id: `${team}-${num}`, team, num, role: keeper ? 'keeper' : 'none', keeper, x: 0, y: 0 })
  const white = Array.from({ length: spec.nA }, (_, i) => mk('white', i + 2))
  const blue = Array.from({ length: spec.nD }, (_, i) => mk('blue', i + 2))
  const exclBlue = Array.from({ length: spec.exclD ?? 0 }, (_, i) => mk('blue', spec.nD + 2 + i))
  return { white, blue, wk: spec.withWhiteKeeper ? mk('white', 1, true) : null, bk: mk('blue', 1, true), exclBlue }
}

function buildSequence(spec: SeqSpec): Board {
  const min = spacing()
  const b = emptyBoard()
  const F = f()
  const ps = makePieces(spec)
  b.pieces = [...(ps.wk ? [ps.wk] : []), ...ps.white, ps.bk, ...ps.blue, ...ps.exclBlue]
  let marks: Record<string, string | null> = {}
  const frames: Frame[] = []
  for (const st of spec.steps) {
    const pos: Frame['pos'] = {}
    const excluded: Frame['excluded'] = {}
    const holder = typeof st.ball === 'number' ? ps.white[st.ball] : null
    // aanvallers zonder bal nooit in het doelgebied, tenzij achter de lijn van de bal (spec.allowBehindBall)
    ps.white.forEach((p, i) => {
      const [d, s2] = st.a[i]
      pos[p.id] = p === holder || spec.allowBehindBall ? fromAttack(A, F, d, s2) : legalAttackSpot(A, F, d, s2)
    })
    const ballPos = holder ? pos[holder.id] : fromAttack(A, F, (st.ball as P)[0], (st.ball as P)[1], false)
    if (st.d) ps.blue.forEach((p, i) => (pos[p.id] = fromAttack(A, F, st.d![i][0], st.d![i][1])))
    else {
      const r = defenseTargets(
        spec.mode ?? 'man',
        A,
        F,
        ps.white.map((p) => ({ id: p.id, pos: pos[p.id] })),
        ps.blue.map((p) => ({ id: p.id, pos: frames.length ? frames[frames.length - 1].pos[p.id] : fromAttack(A, F, 3, 0) })),
        ballPos,
        holder?.id ?? null,
        marks,
      )
      marks = r.marks
      Object.assign(pos, r.targets)
    }
    pos[ps.bk.id] = keeperTarget(A, F, ballPos)
    if (ps.wk) pos[ps.wk.id] = keeperHome(A, b)
    separateInto(
      pos,
      [...ps.white.map((p) => p.id), ...(ps.wk ? [ps.wk.id] : [])],
      [ps.bk.id, ...ps.blue.map((p) => p.id)],
      min,
    )
    ps.exclBlue.forEach((p, i) => {
      pos[p.id] = reentrySpot('blue', b, i)
      excluded[p.id] = true
    })
    for (const p of b.pieces) excluded[p.id] = excluded[p.id] ?? false
    const ball: BallState = holder ? { x: ballPos.x, y: ballPos.y, holder: holder.id } : { x: ballPos.x, y: ballPos.y, holder: null }
    frames.push({ pos, ball, excluded })
  }
  b.steps = frames
  b.strokes = strokesFor(frames, ps.white, spec.swimLines ?? false)
  loadFrameInto(b, frames[0])
  for (const p of ps.exclBlue) p.excludedUntil = 0
  return b
}

function loadFrameInto(b: Board, fr: Frame) {
  for (const p of b.pieces) {
    const q = fr.pos[p.id]
    if (q) {
      p.x = q.x
      p.y = q.y
    }
    p.excludedUntil = fr.excluded[p.id] ? 0 : null
  }
  b.ball = { ...fr.ball }
}

/** Passlijnen (geel), schotlijnen en eventueel zwemlijnen per stap. */
function strokesFor(frames: Frame[], attackers: Piece[], swim: boolean): Stroke[] {
  const out: Stroke[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    const from = a.ball.holder ? a.pos[a.ball.holder] : v(a.ball.x, a.ball.y)
    if (a.ball.holder && b.ball.holder && a.ball.holder !== b.ball.holder) {
      const to = b.pos[b.ball.holder]
      out.push({ id: newId('s'), kind: 'pass', color: '#ffd21f', points: [[from.x, from.y, 0.5], [to.x, to.y, 0.5]], step: i, pieceId: null })
    } else if (a.ball.holder && !b.ball.holder) {
      out.push({ id: newId('s'), kind: 'shot', color: '#ffd21f', points: [[from.x, from.y, 0.5], [b.ball.x, b.ball.y, 0.5]], step: i, pieceId: null })
    }
    if (swim) {
      for (const p of attackers) {
        const p0 = a.pos[p.id]
        const p1 = b.pos[p.id]
        if (p0 && p1 && dist(p0, p1) > 1.6)
          out.push({ id: newId('s'), kind: 'swim', color: '#ffffff', points: [[p0.x, p0.y, 0.5], [p1.x, p1.y, 0.5]], step: i, pieceId: p.id })
      }
    }
  }
  return out
}

// ── 1. Rotatietrainer 6-5 ─────────────────────────────────────────────────

// zelfde plekken als de opstellingen: vleugels diep naast het doelgebied
const PP42: P[] = [
  [1.3, -4.3],
  [2.4, -1.8],
  [2.4, 1.8],
  [1.3, 4.3],
  [5.3, -2.8],
  [5.3, 2.8],
]
const PP33: P[] = [
  [1.5, -4.2],
  [2.4, 0],
  [1.5, 4.2],
  [5.6, -4.2],
  [6.3, 0],
  [5.6, 4.2],
]

export const ROTATIONS = [
  {
    id: 'rot-42',
    label: '4-2 met kruispass',
    hint: 'Bal rond over de flats, kruispass naar de verre vleugel, de M-zone schuift mee.',
    spec: (): SeqSpec => ({
      nA: 6,
      nD: 5,
      exclD: 1,
      mode: 'M',
      withWhiteKeeper: false,
      steps: [4, 5, 0, 4, 3, 5, 4].map((ball) => ({ a: PP42, ball })),
    }),
  },
  {
    id: 'rot-33',
    label: '3-3 met wissel',
    hint: 'Aan de balkant wisselen flat en vleugel van plek; de bal gaat via de point terug.',
    spec: (): SeqSpec => {
      const swapR = PP33.slice() as P[]
      swapR[2] = PP33[5]
      swapR[5] = PP33[2]
      const swapL = PP33.slice() as P[]
      swapL[0] = PP33[3]
      swapL[3] = PP33[0]
      return {
        nA: 6,
        nD: 5,
        exclD: 1,
        mode: '2-3',
        swimLines: true,
        steps: [
          { a: PP33, ball: 4 },
          { a: PP33, ball: 5 },
          { a: swapR, ball: 4 },
          { a: swapR, ball: 3 },
          { a: swapL.map((p, i) => (i === 2 || i === 5 ? swapR[i] : p)), ball: 4 },
          { a: PP33, ball: 4 },
        ],
      }
    },
  },
]

export function startRotation(id: string, speed: number) {
  const r = ROTATIONS.find((x) => x.id === id)
  if (!r) return
  trainer.value = { ...trainer.value, kind: null }
  start(buildSequence(r.spec()), { play: true, loop: true, speed })
}

// ── 4. Overtal-trainer ────────────────────────────────────────────────────

export const OVERLOADS: { id: string; label: string; hint: string; spec: SeqSpec }[] = [
  {
    id: '2-1',
    label: '2 tegen 1',
    hint: 'Zwem breed, laat de verdediger kiezen, speel naar de vrije man en schiet in de verre hoek.',
    spec: {
      nA: 2,
      nD: 1,
      swimLines: true,
      steps: [
        { a: [[11, -2], [11, 3]], d: [[7, 0.5]], ball: 0 },
        { a: [[7.2, -2], [7, 3.6]], d: [[5.8, -0.9]], ball: 0 },
        { a: [[5.6, -1.8], [4.6, 3.6]], d: [[4.8, -1.3]], ball: 1 },
        { a: [[5.4, -1.8], [3.8, 3.2]], d: [[4.5, -0.4]], ball: [0.1, -1.1] },
      ],
    },
  },
  {
    id: '3-2',
    label: '3 tegen 2',
    hint: 'Bal door het midden, de verdedigers trekken naar de bal, dan breed en de kruispass.',
    spec: {
      nA: 3,
      nD: 2,
      swimLines: true,
      steps: [
        { a: [[11, 0], [10, -4.5], [10, 4.5]], d: [[7.5, -1.6], [7.5, 1.6]], ball: 0 },
        { a: [[7.5, 0], [6.6, -4.8], [6.6, 4.8]], d: [[5.6, -1.4], [5.6, 1.4]], ball: 0 },
        { a: [[6.4, 0], [5.4, -4.8], [5, 4.8]], d: [[5, -0.8], [4.3, 2.9]], ball: 2 },
        { a: [[6.2, 0.4], [4.2, -4.4], [4.5, 4.6]], d: [[4.4, -1.4], [3.8, 3.4]], ball: 1 },
        { a: [[6.2, 0.4], [3.6, -3.8], [4.4, 4.4]], d: [[3.5, -2.6], [3.6, 2.4]], ball: [0.1, 1.1] },
      ],
    },
  },
  {
    id: '4-3',
    label: '4 tegen 3',
    hint: 'Houd de breedte, trek de verdediging naar één kant en vind de vrije man aan de overkant.',
    spec: {
      nA: 4,
      nD: 3,
      swimLines: true,
      steps: [
        { a: [[11, -1], [10, -5.5], [10, 5], [12, 2]], d: [[7.5, -2.6], [7.5, 2.6], [9, 0]], ball: 0 },
        { a: [[7.6, -1], [6.6, -5.8], [6.6, 5.4], [8.4, 1.6]], d: [[5.6, -2.6], [5.6, 2.8], [6.4, -0.2]], ball: 0 },
        { a: [[7.2, -1.2], [6, -5.8], [6, 5.4], [6.6, 1.8]], d: [[5.2, -2.6], [5, 3.2], [5.6, 1.4]], ball: 3 },
        { a: [[7, -1.2], [5.2, -5.6], [4.6, 5.2], [6.2, 1.8]], d: [[4.8, -2.4], [3.9, 3.9], [5.2, 1.6]], ball: 2 },
        { a: [[7, -1.2], [3.8, -5], [4.4, 5], [6.2, 1.8]], d: [[3.7, -3.2], [3.8, 3.6], [5, 1.4]], ball: 1 },
        { a: [[7, -1.2], [3.6, -4.6], [4.4, 5], [6.2, 1.8]], d: [[3.3, -3.6], [3.8, 3.6], [5, 1.4]], ball: [0.1, 1.1] },
      ],
    },
  },
]

export function startOverload(id: string, speed: number) {
  const o = OVERLOADS.find((x) => x.id === id)
  if (!o) return
  trainer.value = { ...trainer.value, kind: null }
  start(buildSequence(o.spec), { play: true, loop: true, speed })
}

// ── Doelgebied benutten (regel 1.7 / 8.10 / 13.3) ─────────────────────────

export const GOAL_AREA_PLAYS: { id: string; label: string; point: string; spec: SeqSpec }[] = [
  {
    id: 'ga-deep-wing',
    label: 'Diepe vleugel (6 tegen 5)',
    point:
      'Binnen de 2 m mag, zolang je náást het doelgebied ligt. De vleugel zakt diep (± 1 m van de doellijn) en krijgt de kruispass: kortere afstand en een betere hoek op de verre paal. De M-zone moet daarvoor ver uitzakken, wat ruimte geeft aan de flats.',
    spec: {
      nA: 6,
      nD: 5,
      exclD: 1,
      mode: 'M',
      swimLines: true,
      steps: [
        { a: PP42, ball: 4 },
        { a: PP42.map((p, i) => (i === 0 ? ([0.9, -4.0] as P) : p)), ball: 5 },
        { a: PP42.map((p, i) => (i === 0 ? ([0.9, -4.0] as P) : p)), ball: 0 },
        { a: PP42.map((p, i) => (i === 0 ? ([0.9, -4.0] as P) : p)), ball: [0.3, 1.1] },
      ],
    },
  },
  {
    id: 'ga-behind-ball',
    label: 'Bal diep: het vak gaat open',
    point:
      'Met de bal mag je overal komen. Zwem de bal diep langs de rand van het doelgebied: wie dan verder van de doellijn ligt dan de bal (achter de lijn van de bal), mag het vak in. De center schuift in en krijgt de bal vlak voor het doel.',
    spec: {
      nA: 6,
      nD: 6,
      mode: 'man',
      swimLines: true,
      allowBehindBall: true,
      steps: [
        { a: [[1.8, -5], [2.3, 0], [1.8, 5], [6, -4.5], [7.5, 0], [6, 4.5]], ball: 2 },
        { a: [[1.8, -5], [2.3, 0], [0.8, 3.9], [6, -4.5], [7, 0.5], [5.4, 4.2]], ball: 2 },
        { a: [[1.8, -5], [1.4, 1.0], [0.8, 3.9], [6, -4.5], [7, 0.5], [5.4, 4.2]], ball: 2 },
        { a: [[1.8, -5], [1.4, 1.0], [0.8, 3.9], [6, -4.5], [7, 0.5], [5.4, 4.2]], ball: 1 },
        { a: [[1.8, -5], [1.4, 1.0], [0.8, 3.9], [6, -4.5], [7, 0.5], [5.4, 4.2]], ball: [0.3, -1.1] },
      ],
    },
  },
  {
    id: 'ga-corner',
    label: 'Hoekworp',
    point:
      'Bij een hoekworp mag geen aanvaller in het doelgebied liggen (13.3). Zet ze dus op de rand: de vleugel diep náást het vak, de center net vóór de 2 m-lijn. De snelle bal naar de diepe vleugel is meteen een kans.',
    spec: {
      nA: 6,
      nD: 6,
      mode: 'man',
      swimLines: true,
      steps: [
        { a: [[2, 9], [2.4, -0.6], [1.2, 4.3], [4.6, 2.2], [6.6, -1], [5, -4.6]], ball: 0 },
        { a: [[2, 9], [2.4, -0.6], [1.2, 4.3], [4.6, 2.2], [6.6, -1], [5, -4.6]], ball: 2 },
        { a: [[2.6, 7.5], [2.4, -0.6], [1.2, 4.3], [4.2, 2.2], [6.6, -1], [5, -4.6]], ball: [0.3, -1.1] },
      ],
    },
  },
]

export function startGoalAreaPlay(id: string, speed: number) {
  const g = GOAL_AREA_PLAYS.find((x) => x.id === id)
  if (!g) return
  trainer.value = { ...trainer.value, kind: null }
  start(buildSequence(g.spec), { play: true, loop: true, speed })
  showToast(g.point, undefined, 12000)
}

// ── 5. Strafworp en start ────────────────────────────────────────────────

function framesFromBoard(b: Board): Frame {
  const pos: Frame['pos'] = {}
  const excluded: Frame['excluded'] = {}
  for (const p of b.pieces) {
    pos[p.id] = { x: p.x, y: p.y }
    excluded[p.id] = isExcluded(p)
  }
  return { pos, ball: { ...b.ball }, excluded }
}

export function startPenalty(speed: number) {
  const b = emptyBoard()
  applyInstant(b, FORMATIONS.find((x) => x.id === 'penalty')!)
  const F = f()
  const f0 = framesFromBoard(b)
  const shooter = b.ball.holder!
  const keeper = b.pieces.find((p) => p.team === 'blue' && p.keeper)!
  // 1: schutter neemt de bal op, keeper gaat laag
  const f1: Frame = JSON.parse(JSON.stringify(f0))
  f1.pos[keeper.id] = fromAttack(A, F, 0.5, 0)
  // 2: schot in de hoek, keeper duikt de verkeerde kant op
  const f2: Frame = JSON.parse(JSON.stringify(f1))
  const corner = fromAttack(A, F, 0.05, 1.15, false)
  f2.ball = { x: corner.x, y: corner.y, holder: null }
  f2.pos[keeper.id] = fromAttack(A, F, 0.5, -0.9, false)
  b.steps = [f0, f1, f2]
  b.strokes = [{ id: newId('s'), kind: 'shot', color: '#ffd21f', points: [[f1.pos[shooter].x, f1.pos[shooter].y, 0.5], [corner.x, corner.y, 0.5]], step: 1, pieceId: null }]
  trainer.value = { ...trainer.value, kind: null }
  start(b, { play: true, loop: false, speed })
}

export function startSprint(speed: number) {
  const b = emptyBoard()
  const { length: L, width: W } = b.field
  applyInstant(b, FORMATIONS.find((x) => x.id === 'start')!)
  const f0 = framesFromBoard(b)
  const whites = b.pieces.filter((p) => p.team === 'white' && !p.keeper)
  const blues = b.pieces.filter((p) => p.team === 'blue' && !p.keeper)
  const ws = whites[0]
  const bs = blues[0]
  // 1: sprint: de sprinters naar de bal, de rest zwemt mee op
  const f1: Frame = JSON.parse(JSON.stringify(f0))
  f1.pos[ws.id] = v(L / 2 - 0.75, W / 2)
  f1.pos[bs.id] = v(L / 2 + 1.1, W / 2 + 0.4)
  whites.slice(1).forEach((p) => (f1.pos[p.id] = v(f0.pos[p.id].x + L * 0.22, f0.pos[p.id].y)))
  blues.slice(1).forEach((p) => (f1.pos[p.id] = v(f0.pos[p.id].x - L * 0.2, f0.pos[p.id].y)))
  // 2: wit wint de sprint en speelt terug; blauw zakt terug
  const f2: Frame = JSON.parse(JSON.stringify(f1))
  f2.ball = { x: f1.pos[ws.id].x, y: f1.pos[ws.id].y, holder: ws.id }
  // 3: opbouw: wit zet de aanval op, blauw verdedigt man-man
  const b3 = JSON.parse(JSON.stringify(b)) as Board
  for (const p of b3.pieces) {
    p.x = f2.pos[p.id].x
    p.y = f2.pos[p.id].y
  }
  b3.ball = { ...f2.ball }
  const r = computeFormation(b3, FORMATIONS.find((x) => x.id === '3-3')!)
  const f3: Frame = JSON.parse(JSON.stringify(f2))
  for (const [id, pos] of Object.entries(r.targets)) f3.pos[id] = pos
  f3.ball = r.ball
  b.steps = [f0, f1, f2, f3]
  b.strokes = strokesFor(b.steps, whites, true)
  trainer.value = { ...trainer.value, kind: null }
  start(b, { play: true, loop: false, speed })
}

// ── 2 en 3. Quiz en scenario-generator ────────────────────────────────────

const EV = ['3-3', '4-2', 'arc']
const PP = ['pp-42', 'pp-33']

/** Een willekeurige aanvalssituatie met de juiste verdediging erbij uitgerekend. */
function randomSituation(level: Level): { b: Board; mode: DefenseMode; targets: Record<string, Vec> } {
  const b = emptyBoard()
  const F = f()
  const pool = level === 'moeilijk' ? [...EV, ...PP] : level === 'gemiddeld' ? EV : ['3-3', '4-2']
  const fm = FORMATIONS.find((x) => x.id === pick(pool))!
  applyInstant(b, fm)
  const jitter = level === 'makkelijk' ? 0.7 : level === 'gemiddeld' ? 1.3 : 2
  const whites = b.pieces.filter((p) => p.team === 'white' && !p.keeper && !isExcluded(p))
  for (const p of whites) {
    for (let tries = 0; tries < 12; tries++) {
      const base = toAttack(A, F, p)
      const d = clamp(base.d + rnd(-jitter, jitter), 1.3, 9)
      const s = base.s + rnd(-jitter, jitter)
      const q = fromAttack(A, F, d, s, false)
      if (inGoalArea(A, F, q)) continue
      if (whites.every((o) => o === p || dist(o, q) > 2)) {
        p.x = q.x
        p.y = q.y
        break
      }
    }
  }
  const perimeter = whites.filter((p) => toAttack(A, F, p).d > 3.5)
  const holder = pick(perimeter.length && level !== 'moeilijk' ? perimeter : whites)
  b.ball = { x: holder.x, y: holder.y, holder: holder.id }
  let mode: DefenseMode = typeof fm.defense === 'string' ? fm.defense : 'man'
  if (fm.group === 'aanval') mode = level === 'makkelijk' ? 'man' : level === 'gemiddeld' ? pick<DefenseMode>(['man', 'press']) : pick<DefenseMode>(['man', 'press', 'drop'])
  const defenders = b.pieces.filter((p) => p.team === 'blue' && !p.keeper && !isExcluded(p))
  const r = defenseTargets(
    mode,
    A,
    F,
    whites.map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } })),
    defenders.map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } })),
    v(holder.x, holder.y),
    holder.id,
    {},
  )
  const targets: Record<string, Vec> = { ...r.targets }
  const k0 = b.pieces.find((p) => p.team === 'blue' && p.keeper)
  if (k0) targets[k0.id] = keeperTarget(A, F, v(holder.x, holder.y))
  for (const p of whites) targets[p.id] = { x: p.x, y: p.y }
  separateInto(targets, whites.map((p) => p.id), [...(k0 ? [k0.id] : []), ...defenders.map((p) => p.id)], spacing())
  for (const p of whites) delete targets[p.id]
  for (const d of defenders) {
    d.marks = r.marks[d.id]
    d.x = targets[d.id].x
    d.y = targets[d.id].y
  }
  const k = k0
  if (k) {
    k.x = targets[k.id].x
    k.y = targets[k.id].y
  }
  return { b, mode, targets }
}

/** Wachtplek voor verdedigers die nog geplaatst moeten worden: op de middenlijn. */
function waitingSpot(i: number, n: number): Vec {
  const { length: L, width: W } = doc.board.field
  return v(L / 2 + 0.9, 1.6 + ((W - 3.2) * i) / Math.max(1, n - 1))
}

export function newQuiz(level: Level) {
  const { b, mode, targets } = randomSituation(level)
  const candidates = b.pieces.filter((p) => p.team === 'blue' && !p.keeper && !isExcluded(p))
  const q = pick(candidates)
  const ideal = targets[q.id]
  const w = waitingSpot(0, 1)
  q.x = w.x
  q.y = doc.board.field.width / 2
  const prev = trainer.value
  start(b)
  trainer.value = { ...prev, kind: 'quiz', level, mode, pieceId: q.id, ideal, result: undefined }
  // hint op makkelijk: welke aanvaller hoort bij deze verdediger
  if (level === 'makkelijk' && q.marks && !q.marks.startsWith('zone')) {
    const m = b.pieces.find((p) => p.id === q.marks)
    if (m) ghosts.value = [{ pos: { x: m.x, y: m.y }, color: '#ffd21f' }]
  }
}

export function checkQuiz() {
  const t = trainer.value
  if ((t.kind !== 'quiz' && t.kind !== 'keeper') || !t.pieceId || !t.ideal || t.result) return
  const p = doc.board.pieces.find((x) => x.id === t.pieceId)
  if (!p) return
  const d = dist(p, t.ideal)
  // een keeper moet op decimeters goed liggen, een veldspeler op een halve meter
  const score =
    t.kind === 'keeper'
      ? d <= 0.15
        ? 100
        : Math.max(0, Math.round(100 - (d - 0.15) * 110))
      : d <= 0.5
        ? 100
        : Math.max(0, Math.round(100 - (d - 0.5) * 40))
  if (t.kind === 'keeper') {
    const b = doc.board
    const h = b.pieces.find((x) => x.id === b.ball.holder)
    if (h) keeperGuides(v(h.x, h.y), t.ideal)
  }
  trainer.value = { ...t, result: { score, dist: d }, rounds: t.rounds + 1, total: t.total + score }
  ghosts.value = [{ pos: t.ideal, label: '✓', color: score >= 60 ? '#2fe07a' : '#ffd21f' }]
  const msg = score >= 90 ? 'Precies goed!' : score >= 60 ? 'Bijna.' : 'Kijk waar hij had moeten liggen.'
  const off = t.kind === 'keeper' ? `${Math.round(d * 100)} cm` : `${d.toFixed(1).replace('.', ',')} m`
  showToast(`${msg} ${off} ernaast · ${score} punten`)
}

export function revealQuiz() {
  const t = trainer.value
  if ((t.kind !== 'quiz' && t.kind !== 'keeper') || !t.pieceId || !t.ideal) return
  const p = doc.board.pieces.find((x) => x.id === t.pieceId)
  if (!p) return
  if (!t.result) checkQuiz()
  p.x = t.ideal.x
  p.y = t.ideal.y
  getEngine()?.glide(700)
  commit()
}

export function newScenario(level: Level) {
  const { b, mode, targets } = randomSituation(level)
  const defenders = b.pieces.filter((p) => p.team === 'blue' && !isExcluded(p) && !p.keeper)
  defenders.forEach((p, i) => {
    const w = waitingSpot(i, defenders.length)
    p.x = w.x
    p.y = w.y
  })
  const k = b.pieces.find((p) => p.team === 'blue' && p.keeper)
  if (k) {
    const h = keeperHome('blue', b)
    k.x = h.x
    k.y = h.y
  }
  const prev = trainer.value
  start(b)
  trainer.value = { ...prev, kind: 'scenario', level, mode, targets, shown: false, result: undefined, pieceId: undefined, ideal: undefined }
}

export function showScenario() {
  const t = trainer.value
  if (t.kind !== 'scenario' || !t.targets) return
  for (const p of doc.board.pieces) {
    const q = t.targets[p.id]
    if (q) {
      p.x = q.x
      p.y = q.y
    }
  }
  getEngine()?.glide(1100)
  commit()
  trainer.value = { ...t, shown: true }
}

export function stopTrainer() {
  trainer.value = { ...trainer.value, kind: null }
  ghosts.value = []
  guides.value = []
}

// ── 9. Keepertrainer ──────────────────────────────────────────────────────

/**
 * Een schutter met de bal; de keeper ligt nog voor het doel. Sleep hem naar
 * de bissectrice van de doelhoek, ± 0,6 m voor de doellijn.
 */
export function newKeeperQuiz(level: Level) {
  const F = f()
  const b = emptyBoard()
  let d: number
  let s: number
  if (level === 'makkelijk') {
    d = rnd(5, 8)
    s = rnd(-3, 3)
  } else if (level === 'gemiddeld') {
    d = rnd(3.5, 8)
    s = rnd(-6.5, 6.5)
  } else {
    d = rnd(2.2, 5)
    s = pick([-1, 1]) * rnd(4, 7.5)
  }
  const shooterPos = fromAttack(A, F, d, s, false)
  const num = pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  const shooter: Piece = { id: `white-${num}`, team: 'white', num, role: 'none', keeper: false, x: shooterPos.x, y: shooterPos.y }
  const startPos = fromAttack(A, F, 1.8, 0)
  const keeper: Piece = { id: 'blue-1', team: 'blue', num: 1, role: 'keeper', keeper: true, x: startPos.x, y: startPos.y }
  b.pieces = [shooter, keeper]
  if (level !== 'makkelijk') {
    // een verdediger die doelzijde ligt: afleiding, de keeper kijkt naar de bal
    const dp = fromAttack(A, F, Math.max(1.2, d - 1.6), s * 0.85, false)
    b.pieces.push({ id: 'blue-4', team: 'blue', num: 4, role: 'none', keeper: false, x: dp.x, y: dp.y })
  }
  b.ball = { x: shooter.x, y: shooter.y, holder: shooter.id }
  const ideal = keeperPosition(shooterPos, attackGoal(A, F))
  const prev = trainer.value
  start(b)
  trainer.value = { ...prev, kind: 'keeper', level, pieceId: keeper.id, ideal, result: undefined, mode: undefined }
}

function keeperGuides(ball: Vec, ideal: Vec) {
  const F = f()
  const goal = attackGoal(A, F)
  const p1 = v(goal.x, goal.y - RULES.goal.width / 2)
  const p2 = v(goal.x, goal.y + RULES.goal.width / 2)
  // bissectrice doortrekken tot de doellijn
  const dir = { x: ideal.x - ball.x, y: ideal.y - ball.y }
  const t = dir.x === 0 ? 1 : (goal.x - ball.x) / dir.x
  const end = v(ball.x + dir.x * t, ball.y + dir.y * t)
  guides.value = [
    { a: ball, b: p1, color: '#ffffff' },
    { a: ball, b: p2, color: '#ffffff' },
    { a: ball, b: end, color: '#ffd21f', dash: true },
  ]
}

// ── Ingebouwde oefeningen (voor de trainingsplanner) ─────────────────────

export interface Builtin {
  id: string
  label: string
  group: string
  run: (speed: number) => void
}

const LEVEL_NAME: Record<Level, string> = { makkelijk: 'makkelijk', gemiddeld: 'gemiddeld', moeilijk: 'moeilijk' }

export const BUILTINS: Builtin[] = [
  ...ROTATIONS.map((r) => ({ id: r.id, label: `Rotatie 6-5: ${r.label}`, group: 'Rotatietrainer', run: (s: number) => startRotation(r.id, s) })),
  ...GOAL_AREA_PLAYS.map((g) => ({ id: g.id, label: `Doelgebied: ${g.label}`, group: 'Doelgebied', run: (s: number) => startGoalAreaPlay(g.id, s) })),
  ...OVERLOADS.map((o) => ({ id: `ov-${o.id}`, label: `Overtal ${o.label}`, group: 'Overtal', run: (s: number) => startOverload(o.id, s) })),
  { id: 'penalty', label: 'Strafworp', group: 'Spelhervatting', run: (s) => startPenalty(s) },
  { id: 'sprint', label: 'Start (sprint)', group: 'Spelhervatting', run: (s) => startSprint(s) },
  ...LEVELS.flatMap((l) => [
    { id: `quiz-${l.value}`, label: `Waar sta jij? (${LEVEL_NAME[l.value]})`, group: 'Quiz', run: () => newQuiz(l.value) },
    { id: `scenario-${l.value}`, label: `Scenario-generator (${LEVEL_NAME[l.value]})`, group: 'Quiz', run: () => newScenario(l.value) },
    { id: `keeper-${l.value}`, label: `Keepertrainer (${LEVEL_NAME[l.value]})`, group: 'Quiz', run: () => newKeeperQuiz(l.value) },
  ]),
]

/** Willekeurige "waar sta jij?"-vragen voor de spelersquiz. */
export function randomQuizQuestions(level: Level, n: number): { board: Board; pieceId: string }[] {
  const out: { board: Board; pieceId: string }[] = []
  for (let i = 0; i < n; i++) {
    const { b } = randomSituation(level)
    const candidates = b.pieces.filter((p) => p.team === 'blue' && !p.keeper && !isExcluded(p))
    const q = pick(candidates)
    out.push({ board: JSON.parse(JSON.stringify(b)), pieceId: q.id })
  }
  return out
}
