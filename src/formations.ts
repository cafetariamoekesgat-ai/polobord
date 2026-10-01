/**
 * Opstellingen, uitgedrukt in aanvalscoördinaten (d = afstand tot het doel
 * waarop wordt aangevallen, s = zijwaarts, + = rechterhand van de aanvaller).
 * Zijwaartse maten gelden voor een 20 m breed bad en schalen mee.
 */
import { defenseTargets, keeperTarget, type DefenseMode } from './defense'
import { assignMarks, attackGoal, fromAttack, legalAttackSpot, otherTeam, ownGoal, v } from './geometry'
import { RULES } from './rules'
import type { BallState, Board, Piece, Role, Team, Vec } from './types'

type Spot = [d: number, s: number, role: Role]

export type FormationGroup = 'aanval' | 'verdediging' | 'overtal' | 'hervatting'

export interface Formation {
  id: string
  label: string
  short?: string
  group: FormationGroup
  /** veldspelers van het aanvallende team; weglaten = laten staan */
  attack?: Spot[]
  /** welke spot heeft de bal */
  ballSpot?: number
  /** verdediging: modus of vaste spots */
  defense?: DefenseMode | Spot[]
  /** bijzondere opstellingen die niet in aanvalscoördinaten passen */
  special?: 'start' | 'penalty' | 'counter'
}

// Doelgebied (sinds 2023): 2 m naast elke paal tot de 2 m-lijn. Aanvallers zonder
// bal liggen erbuiten: de center net vóór de lijn (2,3 m), vleugels mogen dieper
// dan 2 m zolang ze er naast liggen (|s| > 3,5 m).
const THREE_THREE: Spot[] = [
  [1.8, -5, 'wing'],
  [2.3, 0, 'center'],
  [1.8, 5, 'wing'],
  [6, -4.5, 'flat'],
  [7.5, 0, 'point'],
  [6, 4.5, 'flat'],
]

const FOUR_TWO: Spot[] = [
  [2.3, -0.8, 'center'],
  [2.4, 3.4, 'driver'],
  [5.2, -5.2, 'wing'],
  [7, -2, 'point'],
  [7, 2.2, 'flat'],
  [5.2, 5.4, 'wing'],
]

const ARC: Spot[] = [
  [2.3, 0, 'center'],
  [2, -6.6, 'wing'],
  [5.4, -4.4, 'flat'],
  [7, 0, 'point'],
  [5.4, 4.4, 'flat'],
  [2, 6.6, 'wing'],
]

// 4-2 met de doelgebied-regel: palen vóór de lijn, vleugels diep naast het vak
const PP_42: Spot[] = [
  [1.3, -4.3, 'wing'],
  [2.4, -1.8, 'center'],
  [2.4, 1.8, 'center'],
  [1.3, 4.3, 'wing'],
  [5.3, -2.8, 'flat'],
  [5.3, 2.8, 'flat'],
]

const PP_33: Spot[] = [
  [1.5, -4.2, 'wing'],
  [2.4, 0, 'center'],
  [1.5, 4.2, 'wing'],
  [5.6, -4.2, 'flat'],
  [6.3, 0, 'point'],
  [5.6, 4.2, 'flat'],
]

const FIVE_FOUR: Spot[] = [
  [1.4, -4.2, 'wing'],
  [1.4, 4.2, 'wing'],
  [5, -4.2, 'flat'],
  [6.5, 0, 'point'],
  [5, 4.2, 'flat'],
]

export const FORMATIONS: Formation[] = [
  { id: '3-3', label: '3-3', group: 'aanval', attack: THREE_THREE, ballSpot: 4, defense: 'man' },
  { id: '4-2', label: '4-2', group: 'aanval', attack: FOUR_TWO, ballSpot: 3, defense: 'man' },
  { id: 'arc', label: 'Arc / umbrella', group: 'aanval', attack: ARC, ballSpot: 3, defense: 'drop' },

  { id: 'def-man', label: 'Man-man', group: 'verdediging', defense: 'man' },
  { id: 'def-press', label: 'Pressing man-man', group: 'verdediging', defense: 'press' },
  { id: 'def-drop', label: 'Terugzakken (drop)', group: 'verdediging', defense: 'drop' },

  { id: 'pp-42', label: '6 tegen 5 · 4-2', group: 'overtal', attack: PP_42, ballSpot: 4, defense: 'M' },
  { id: 'pp-33', label: '6 tegen 5 · 3-3', group: 'overtal', attack: PP_33, ballSpot: 4, defense: '2-3' },
  { id: 'pk-m', label: '5 tegen 6 · M-zone', group: 'overtal', attack: PP_42, ballSpot: 5, defense: 'M' },
  { id: 'pk-23', label: '5 tegen 6 · 2-3-zone', group: 'overtal', attack: PP_33, ballSpot: 3, defense: '2-3' },
  { id: '5-4', label: '5 tegen 4', group: 'overtal', attack: FIVE_FOUR, ballSpot: 3, defense: 'box' },

  { id: 'counter', label: 'Counter / uitbraak', group: 'hervatting', special: 'counter' },
  { id: 'penalty', label: 'Strafworp', group: 'hervatting', special: 'penalty' },
  { id: 'start', label: 'Start (sprint)', group: 'hervatting', special: 'start' },
]

export const FORMATION_GROUP_LABELS: Record<FormationGroup, string> = {
  aanval: 'Aanval',
  verdediging: 'Verdediging',
  overtal: 'Over- en ondertal',
  hervatting: 'Spelhervatting',
}

export interface FormationResult {
  targets: Record<string, Vec>
  ball: BallState
  excluded: Record<string, boolean>
  roles: Record<string, Role>
  marks: Record<string, string | null>
  defense?: DefenseMode
}

const fieldOf = (b: Board) => ({ length: b.field.length, width: b.field.width })

/** Plek in de terugkeerzone van een team (hoek bij het eigen doel, bankkant). */
export function reentrySpot(team: Team, b: Board, index = 0): Vec {
  const { length: L, width: W } = b.field
  const into = RULES.reentry.intoField / 2
  const y = W - 0.5 - index * 0.9
  return team === 'white' ? v(into, y) : v(L - into, y)
}

/** Standaard thuispositie van een keeper. */
export function keeperHome(team: Team, b: Board): Vec {
  const g = ownGoal(team, fieldOf(b))
  return v(g.x === 0 ? RULES.defense.keeperDepth : g.x - RULES.defense.keeperDepth, g.y)
}

function split(b: Board, team: Team) {
  const ps = b.pieces.filter((p) => p.team === team)
  return { keeper: ps.find((p) => p.keeper) ?? null, field: ps.filter((p) => !p.keeper) }
}

/** Ken plekken toe met zo min mogelijk zwemwerk; wie over is, gaat eruit. */
/** Een linkshandige op een plek links van de aanvaller kost zoveel extra meters. */
export const LEFTY_PENALTY = 6

function fill(players: Piece[], spots: Vec[], lateral?: number[]): { at: Record<string, Vec>; spare: Piece[]; index: Record<string, number> } {
  // linkshandigen naar de rechterkant (s > 0): daar staat hun werparm aan de goede kant
  const extra = lateral ? (i: number, j: number) => (players[i].lefty && lateral[j] < -0.5 ? LEFTY_PENALTY : 0) : undefined
  const pick = assignMarks(
    players.map((p) => ({ id: p.id, pos: p })),
    spots.map((pos, i) => ({ id: String(i), pos })),
    extra,
  )
  const at: Record<string, Vec> = {}
  const index: Record<string, number> = {}
  const spare: Piece[] = []
  for (const p of players) {
    const i = pick[p.id]
    if (i == null) spare.push(p)
    else {
      at[p.id] = spots[Number(i)]
      index[p.id] = Number(i)
    }
  }
  return { at, spare, index }
}

export function computeFormation(b: Board, fm: Formation): FormationResult {
  const f = fieldOf(b)
  const A = b.attacking
  const D = otherTeam(A)
  const res: FormationResult = { targets: {}, ball: { ...b.ball }, excluded: {}, roles: {}, marks: {} }
  const att = split(b, A)
  const def = split(b, D)

  if (fm.special) return special(b, fm.special, res)

  // ── aanvallers
  let attackPos: { id: string; pos: Vec }[]
  if (fm.attack) {
    const spots = fm.attack.map(([d, s]) => legalAttackSpot(A, f, d, s))
    // wie al uitgesloten is, blijft eruit als er meer spelers dan plekken zijn
    const surplus = Math.max(0, att.field.length - spots.length)
    const keepOut = att.field.filter((p) => p.excludedUntil != null).slice(0, surplus)
    const { at, spare: spare0, index } = fill(
      att.field.filter((p) => !keepOut.includes(p)),
      spots,
      fm.attack.map(([, s]) => s),
    )
    const spare = [...keepOut, ...spare0]
    for (const [id, pos] of Object.entries(at)) {
      res.targets[id] = pos
      res.excluded[id] = false
      res.roles[id] = fm.attack[index[id]][2]
    }
    spare.forEach((p, i) => {
      res.targets[p.id] = reentrySpot(A, b, i)
      res.excluded[p.id] = true
    })
    attackPos = Object.entries(at).map(([id, pos]) => ({ id, pos }))
    if (fm.ballSpot != null) {
      const holder = Object.keys(index).find((id) => index[id] === fm.ballSpot) ?? null
      res.ball = holder ? { x: at[holder].x, y: at[holder].y, holder } : res.ball
    }
    if (att.keeper) {
      res.targets[att.keeper.id] = keeperHome(A, b)
      res.excluded[att.keeper.id] = false
    }
  } else {
    attackPos = att.field.filter((p) => p.excludedUntil == null).map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } }))
  }

  // ── verdedigers
  const ballPos = res.ball.holder ? res.targets[res.ball.holder] ?? b.pieces.find((p) => p.id === res.ball.holder)! : res.ball
  if (fm.defense) {
    const mode = typeof fm.defense === 'string' ? fm.defense : null
    let need = def.field.length
    if (mode === 'M' || mode === '2-3') need = 5
    if (mode === 'box') need = 4
    // wie mag blijven: dichtst bij de doelplekken
    const spotsForPick = mode
      ? defenseTargets(mode, A, f, attackPos, def.field.map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } })), ballPos, res.ball.holder, {}).targets
      : {}
    const players = def.field.slice()
    let stay = players
    let out: Piece[] = []
    if (players.length > need) {
      const goal = attackGoal(A, f)
      const ranked = players
        .map((p) => ({ p, d: Math.hypot((spotsForPick[p.id]?.x ?? p.x) - goal.x, (spotsForPick[p.id]?.y ?? p.y) - goal.y) }))
        .sort((a, b2) => b2.d - a.d)
      // al uitgesloten spelers eerst, dan wie het verst van een plek ligt
      ranked.sort((a, b2) => Number(b2.p.excludedUntil != null) - Number(a.p.excludedUntil != null))
      out = ranked.slice(0, players.length - need).map((r) => r.p)
      stay = players.filter((p) => !out.includes(p))
    }
    out.forEach((p, i) => {
      res.targets[p.id] = reentrySpot(D, b, i)
      res.excluded[p.id] = true
    })
    if (mode) {
      const r = defenseTargets(mode, A, f, attackPos, stay.map((p) => ({ id: p.id, pos: { x: p.x, y: p.y } })), ballPos, res.ball.holder, {})
      Object.assign(res.targets, r.targets)
      Object.assign(res.marks, r.marks)
      res.defense = mode
    }
    for (const p of stay) res.excluded[p.id] = false
    if (def.keeper) {
      res.targets[def.keeper.id] = keeperTarget(A, f, ballPos)
      res.excluded[def.keeper.id] = false
    }
  }
  return res
}

function special(b: Board, kind: 'start' | 'penalty' | 'counter', res: FormationResult): FormationResult {
  const f = fieldOf(b)
  const A = b.attacking
  const D = otherTeam(A)
  const { length: L, width: W } = b.field
  const k = Math.min(1, W / 20)
  const all = (t: Team) => split(b, t)
  for (const p of b.pieces) res.excluded[p.id] = false

  if (kind === 'start') {
    for (const team of ['white', 'blue'] as Team[]) {
      const { keeper, field } = all(team)
      const x = team === 'white' ? 0.5 : L - 0.5
      const offs = [-2.4, 2.4, -4.2, 4.2, -6, 6].map((s) => s * k)
      field.forEach((p, i) => (res.targets[p.id] = v(x, W / 2 + (offs[i] ?? (i - 5) * 1.2 * k))))
      if (keeper) res.targets[keeper.id] = v(team === 'white' ? 0.35 : L - 0.35, W / 2)
    }
    res.ball = { x: L / 2, y: W / 2, holder: null }
    return res
  }

  if (kind === 'penalty') {
    const a = all(A)
    const d = all(D)
    const shooter = a.field[0]
    if (shooter) res.targets[shooter.id] = fromAttack(A, f, RULES.penaltyMark, 0)
    // iedereen buiten de 5 m en minstens 2 m van de schutter
    const ring: [number, number][] = [
      [6.2, -3.2],
      [6.4, 3.2],
      [6.2, -5],
      [6.4, 5],
      [7.6, -2.2],
      [7.6, 2.2],
      [7.4, -6.4],
      [7.4, 6.4],
      [8.6, -4],
      [8.6, 4],
      [9.4, 0],
    ]
    // afwisselend aanvaller/verdediger over de ring
    const inter: Piece[] = []
    const aa = a.field.slice(1)
    const dd = d.field.slice()
    while (aa.length || dd.length) {
      if (dd.length) inter.push(dd.shift()!)
      if (aa.length) inter.push(aa.shift()!)
    }
    inter.forEach((p, i) => (res.targets[p.id] = fromAttack(A, f, ring[i % ring.length][0] + Math.floor(i / ring.length) * 1.2, ring[i % ring.length][1])))
    if (d.keeper) res.targets[d.keeper.id] = fromAttack(A, f, 0.3, 0)
    if (a.keeper) res.targets[a.keeper.id] = keeperHome(A, b)
    res.ball = shooter ? { ...res.targets[shooter.id], holder: shooter.id } : res.ball
    return res
  }

  // counter: aanvallers in de breedte op weg naar het doel, verdedigers erachter
  const a = all(A)
  const d = all(D)
  const mid = L / 2
  const atk: [number, number, Role][] = [
    [mid - 4.5, -3.5, 'driver'],
    [mid - 3.5, 3.5, 'driver'],
    [mid - 2, 0, 'point'],
    [mid - 0.5, -6.5, 'wing'],
    [mid - 0.5, 6.5, 'wing'],
    [mid + 1.5, -1, 'flat'],
  ]
  const chase: [number, number][] = [
    [mid - 2.5, -2.5],
    [mid - 1.5, 2.6],
    [mid + 0.2, 0.6],
    [mid + 1.6, -5.2],
    [mid + 1.6, 5.4],
    [mid + 3.2, -0.4],
  ]
  const at = fill(a.field, atk.map(([dd, s]) => fromAttack(A, f, dd, s)), atk.map(([, s]) => s))
  Object.assign(res.targets, at.at)
  for (const [id, i] of Object.entries(at.index)) res.roles[id] = atk[i][2]
  const dt = fill(d.field, chase.map(([dd, s]) => fromAttack(A, f, dd, s)))
  Object.assign(res.targets, dt.at)
  if (a.keeper) res.targets[a.keeper.id] = fromAttack(A, f, L - 3, 0)
  if (d.keeper) res.targets[d.keeper.id] = keeperHome(D, b)
  const holder = Object.keys(at.index).find((id) => at.index[id] === 2) ?? null
  res.ball = holder ? { ...at.at[holder], holder } : res.ball
  return res
}

// ── Standaardbord ─────────────────────────────────────────────────────────

let seq = 0
export const newId = (prefix = 'p') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function defaultPieces(): Piece[] {
  const pieces: Piece[] = []
  for (const team of ['white', 'blue'] as Team[]) {
    pieces.push({ id: `${team}-1`, team, num: 1, role: 'keeper', keeper: true, x: 0, y: 0 })
    for (let n = 2; n <= 7; n++) pieces.push({ id: `${team}-${n}`, team, num: n, role: 'none', keeper: false, x: 0, y: 0 })
  }
  return pieces
}

/** Zet een opstelling direct neer, zonder animatie. */
export function applyInstant(b: Board, fm: Formation) {
  const r = computeFormation(b, fm)
  for (const p of b.pieces) {
    const t = r.targets[p.id]
    if (t) {
      p.x = t.x
      p.y = t.y
    }
    if (r.excluded[p.id] != null) p.excludedUntil = r.excluded[p.id] ? 0 : null
    if (r.roles[p.id]) p.role = r.roles[p.id]
    if (r.marks[p.id] !== undefined) p.marks = r.marks[p.id]
  }
  b.ball = r.ball
}

export function seedLine(b: Board) {
  const { length: L, width: W } = b.field
  for (const p of b.pieces) {
    const i = p.num
    if (p.keeper) {
      const h = keeperHome(p.team, b)
      p.x = h.x
      p.y = h.y
    } else {
      p.x = p.team === 'white' ? L / 2 - 3 : L / 2 + 3
      p.y = (W / 8) * ((i - 1) % 7) + W / 8
    }
  }
}
