/**
 * Pure geometrie in meters. Assenstelsel: x van doellijn (0) naar doellijn (L),
 * y van zijkant (0, jurytafel) naar zijkant (W, banken/terugkeerzones).
 * Wit verdedigt het doel op x = 0 en valt aan op x = L; blauw andersom.
 */
import { RULES } from './rules'
import type { Team, Vec } from './types'

export const v = (x: number, y: number): Vec => ({ x, y })
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
export function unit(a: Vec): Vec {
  const l = len(a)
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

export interface FieldDims {
  length: number
  width: number
}

/** Het doel waarop een team aanvalt. */
export function attackGoal(team: Team, f: FieldDims): Vec {
  return team === 'white' ? v(f.length, f.width / 2) : v(0, f.width / 2)
}
/** Het doel dat een team verdedigt. */
export function ownGoal(team: Team, f: FieldDims): Vec {
  return team === 'white' ? v(0, f.width / 2) : v(f.length, f.width / 2)
}
export const otherTeam = (t: Team): Team => (t === 'white' ? 'blue' : 'white')

/**
 * Omrekenen van "aanvalscoördinaten" naar het veld.
 * d = afstand tot de doellijn waarop `team` aanvalt, s = zijwaarts vanaf het midden,
 * positief = rechterhand van de aanvaller. Zijwaartse maten zijn ontworpen voor
 * een 20 m breed bad en schalen mee bij smallere baden.
 */
export function fromAttack(team: Team, f: FieldDims, d: number, s: number, scaleLateral = true): Vec {
  const k = scaleLateral ? Math.min(1, f.width / 20) : 1
  const dd = clamp(d, 0.3, f.length - 0.3)
  const half = f.width / 2 - 0.6
  const ss = clamp(s * k, -half, half)
  return team === 'white' ? v(f.length - dd, f.width / 2 + ss) : v(dd, f.width / 2 - ss)
}

/** Omgekeerde van fromAttack (zonder schaalfactor). */
export function toAttack(team: Team, f: FieldDims, p: Vec): { d: number; s: number } {
  return team === 'white'
    ? { d: f.length - p.x, s: p.y - f.width / 2 }
    : { d: p.x, s: f.width / 2 - p.y }
}

/** Afstand van punt p tot lijnstuk ab, plus de projectie-parameter t ∈ [0, 1]. */
export function pointSegment(p: Vec, a: Vec, b: Vec): { dist: number; t: number; closest: Vec } {
  const ab = sub(b, a)
  const l2 = ab.x * ab.x + ab.y * ab.y
  const t = l2 < 1e-12 ? 0 : clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1)
  const closest = add(a, mul(ab, t))
  return { dist: dist(p, closest), t, closest }
}

// ── Verdediging ────────────────────────────────────────────────────────────

/** Man-man: doelzijde, `d` meter tussen aanvaller en doel. */
export function goalSidePosition(attacker: Vec, goal: Vec, d: number = RULES.defense.markDistance): Vec {
  const toGoal = sub(goal, attacker)
  const l = len(toGoal)
  const step = Math.min(d, l * 0.5)
  return add(attacker, mul(unit(toGoal), step))
}

/**
 * Pressing: vóór de man (tussen man en bal), iets naar het doel gedraaid.
 * Bij de balbezitter zelf: kort doelzijde.
 */
export function pressPosition(attacker: Vec, ball: Vec, goal: Vec, isHolder: boolean, d: number = RULES.defense.pressDistance): Vec {
  if (isHolder || dist(attacker, ball) < 0.3) return goalSidePosition(attacker, goal, d)
  const dir = unit(add(mul(unit(sub(ball, attacker)), 0.7), mul(unit(sub(goal, attacker)), 0.3)))
  return add(attacker, mul(dir, d))
}

/**
 * Terugzakken: verdediger laat zijn man los en zakt op de lijn man→doel naar
 * de band van 2–5 m, iets naar de balkant geschoven. Bij de balbezitter: druk.
 */
export function dropPosition(attacker: Vec, ball: Vec, goal: Vec, isHolder: boolean, band: readonly [number, number] = RULES.defense.dropBand): Vec {
  if (isHolder) return goalSidePosition(attacker, goal, RULES.defense.pressDistance)
  const toGoal = dist(attacker, goal)
  if (toGoal <= band[0] + RULES.defense.markDistance) return goalSidePosition(attacker, goal)
  const target = clamp(toGoal * 0.5, band[0], band[1])
  const p = add(goal, mul(unit(sub(attacker, goal)), target))
  // 20% richting de bal schuiven, maar niet voorbij de bal
  const shift = mul(sub(ball, p), 0.2)
  return add(p, { x: shift.x * 0.3, y: shift.y })
}

export type ZoneKind = 'M' | '2-3' | 'box'

/** Basisposities (d, s) van de zones, gezien vanaf de aanvaller. */
export const ZONE_BASE: Record<ZoneKind, [number, number][]> = {
  // M: benen op 2 m, pieken hoog, dip in het midden
  M: [
    [1.6, -3.2],
    [4.4, -2.4],
    [2.6, 0],
    [4.4, 2.4],
    [1.6, 3.2],
  ],
  '2-3': [
    [2.0, -3.2],
    [2.0, 0],
    [2.0, 3.2],
    [4.8, -1.8],
    [4.8, 1.8],
  ],
  // 4 tegen 5: box
  box: [
    [1.8, -1.8],
    [1.8, 1.8],
    [4.4, -2.2],
    [4.4, 2.2],
  ],
}

/**
 * Zoneposities voor de verdedigers van het doel waarop `attacking` aanvalt.
 * De zone schuift mee naar de bal (zijwaarts 30%, max 2 m; diepte licht).
 */
export function zonePositions(kind: ZoneKind, attacking: Team, f: FieldDims, ball: Vec): Vec[] {
  const b = toAttack(attacking, f, ball)
  const k = Math.min(1, f.width / 20)
  const shiftS = clamp((b.s / k) * 0.3, -2, 2)
  const shiftD = clamp((b.d - 6) * 0.08, -0.4, 0.8)
  return ZONE_BASE[kind].map(([d, s]) => fromAttack(attacking, f, Math.max(1, d + (d > 3 ? shiftD : 0)), s + shiftS))
}

/**
 * Keeper op de bissectrice van de doelhoek (hoek bal–paal–paal),
 * `depth` meter vóór de doellijn, binnen de palen.
 */
export function keeperPosition(ball: Vec, goal: Vec, depth: number = RULES.defense.keeperDepth, goalWidth: number = RULES.goal.width): Vec {
  const intoField = goal.x < 1e-6 ? 1 : -1 // doel op x=0 → veld ligt bij +x
  const keeperX = goal.x + intoField * depth
  const p1 = v(goal.x, goal.y - goalWidth / 2)
  const p2 = v(goal.x, goal.y + goalWidth / 2)
  const u = unit(add(unit(sub(p1, ball)), unit(sub(p2, ball))))
  const inFront = (ball.x - goal.x) * intoField > depth
  if (!inFront || Math.abs(u.x) < 1e-6) return v(keeperX, goal.y)
  const t = (keeperX - ball.x) / u.x
  const y = ball.y + u.y * t
  return v(keeperX, clamp(y, p1.y + 0.3, p2.y - 0.3))
}

/**
 * Koppel verdedigers aan aanvallers met de kleinste totale afstand
 * (exact, voor kleine aantallen). Surplus blijft ongekoppeld.
 */
export function assignMarks(defenders: { id: string; pos: Vec }[], attackers: { id: string; pos: Vec }[]): Record<string, string | null> {
  const n = defenders.length
  const m = attackers.length
  let best = Infinity
  let bestPick: number[] = []
  const pick: number[] = new Array(n).fill(-1)
  const used = new Array(m).fill(false)
  const slots = Math.min(n, m)
  const skipAllowed = n - slots // zoveel verdedigers mogen vrij blijven

  const rec = (i: number, cost: number, skipped: number) => {
    if (cost >= best) return
    if (i === n) {
      best = cost
      bestPick = pick.slice()
      return
    }
    for (let j = 0; j < m; j++) {
      if (used[j]) continue
      used[j] = true
      pick[i] = j
      rec(i + 1, cost + dist(defenders[i].pos, attackers[j].pos), skipped)
      used[j] = false
    }
    if (skipped < skipAllowed) {
      pick[i] = -1
      rec(i + 1, cost, skipped + 1)
    }
  }
  if (n <= 8 && m <= 8) rec(0, 0, 0)
  else {
    // groot aantal: gulzig
    const free = new Set(attackers.map((_, j) => j))
    bestPick = defenders.map((d) => {
      let bj = -1
      let bd = Infinity
      for (const j of free) {
        const dd = dist(d.pos, attackers[j].pos)
        if (dd < bd) {
          bd = dd
          bj = j
        }
      }
      if (bj >= 0) free.delete(bj)
      return bj
    })
  }
  const out: Record<string, string | null> = {}
  defenders.forEach((d, i) => (out[d.id] = bestPick[i] >= 0 ? attackers[bestPick[i]].id : null))
  return out
}

// ── Analyse ────────────────────────────────────────────────────────────────

export interface PassLane {
  to: string
  open: boolean
  /** kleinste afstand van een verdediger tot de lijn */
  clearance: number
  interceptor: string | null
}

/** Passlijnen van balbezitter naar medespelers; rood als een verdediger dichtbij de lijn ligt. */
export function passLanes(
  from: Vec,
  mates: { id: string; pos: Vec }[],
  opponents: { id: string; pos: Vec }[],
  threshold: number = RULES.analysis.interceptDistance,
): PassLane[] {
  return mates.map((m) => {
    let clearance = Infinity
    let interceptor: string | null = null
    for (const o of opponents) {
      const { dist: d, t } = pointSegment(o.pos, from, m.pos)
      // verdedigers achter de passer tellen niet (t = 0 én verder weg dan de lijn)
      if (t <= 0 && dist(o.pos, from) > threshold) continue
      if (d < clearance) {
        clearance = d
        interceptor = o.id
      }
    }
    return { to: m.id, open: clearance >= threshold, clearance, interceptor: clearance < threshold ? interceptor : null }
  })
}

export interface ShotWindow {
  /** open stukken van de doellijn (y-waarden) */
  open: [number, number][]
  /** schaduwen van blokkers op de doellijn */
  blocked: [number, number][]
  /** fractie van de doelbreedte die open is (0–1) */
  fraction: number
  posts: [Vec, Vec]
}

/**
 * Schothoek: kegel van bal naar beide palen. Blokkers (verdedigers, keeper)
 * tussen bal en doel werpen een schaduw op de doellijn.
 */
export function shotWindow(ball: Vec, goal: Vec, blockers: { pos: Vec; r: number }[], goalWidth: number = RULES.goal.width): ShotWindow {
  const lo = goal.y - goalWidth / 2
  const hi = goal.y + goalWidth / 2
  const posts: [Vec, Vec] = [v(goal.x, lo), v(goal.x, hi)]
  const dx = goal.x - ball.x
  if (Math.abs(dx) < 0.05) return { open: [], blocked: [], fraction: 0, posts }

  const shadows: [number, number][] = []
  for (const b of blockers) {
    const bdx = b.pos.x - ball.x
    // alleen blokkers tussen bal en doellijn
    if (bdx * dx <= 0 || Math.abs(bdx) >= Math.abs(dx)) continue
    const d = dist(b.pos, ball)
    if (d <= b.r) {
      // blokker vlak op de bal: alles dicht
      shadows.push([lo, hi])
      continue
    }
    const theta = Math.atan2(b.pos.y - ball.y, bdx)
    const delta = Math.asin(Math.min(1, b.r / d))
    const ys: number[] = []
    for (const a of [theta - delta, theta + delta]) {
      const c = Math.cos(a)
      if (c * dx <= 1e-9) {
        // straal loopt evenwijdig aan of weg van de doellijn: schaduw tot oneindig
        ys.push(Math.sin(a) > 0 ? Infinity : -Infinity)
      } else {
        ys.push(ball.y + (dx / c) * Math.sin(a))
      }
    }
    const a = Math.min(ys[0], ys[1])
    const bb = Math.max(ys[0], ys[1])
    if (bb < lo || a > hi) continue
    shadows.push([Math.max(a, lo), Math.min(bb, hi)])
  }

  shadows.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const s of shadows) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else merged.push([s[0], s[1]])
  }
  const open: [number, number][] = []
  let cur = lo
  for (const [a, b] of merged) {
    if (a > cur) open.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (cur < hi) open.push([cur, hi])
  const openLen = open.reduce((s, [a, b]) => s + (b - a), 0)
  return { open, blocked: merged, fraction: openLen / goalWidth, posts }
}

// ── Hulpjes voor animatie en botsing ───────────────────────────────────────

/** Punt op een polyline bij fractie t van de totale lengte. */
export function alongPolyline(points: Vec[], t: number): Vec {
  if (points.length === 0) return v(0, 0)
  if (points.length === 1) return points[0]
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const l = dist(points[i - 1], points[i])
    seg.push(l)
    total += l
  }
  if (total < 1e-9) return points[0]
  let target = clamp(t, 0, 1) * total
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) return lerp(points[i], points[i + 1], seg[i] < 1e-9 ? 0 : Math.min(1, target / seg[i]))
    target -= seg[i]
  }
  return points[points.length - 1]
}

export function polylineLength(points: Vec[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  return total
}

/**
 * Zachte botsing: duw overlappende caps uit elkaar. `fixed` bewegen niet
 * (bijv. de cap die de vinger vasthoudt). Muteert posities.
 */
export function resolveCollisions(items: { id: string; pos: Vec }[], minDist: number, fixed: Set<string>, bounds?: { x0: number; y0: number; x1: number; y1: number }, iterations = 4): boolean {
  let moved = false
  for (let it = 0; it < iterations; it++) {
    let any = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        const d = Math.hypot(dx, dy)
        if (d >= minDist) continue
        const fa = fixed.has(a.id)
        const fb = fixed.has(b.id)
        if (fa && fb) continue
        const nx = d < 1e-6 ? 1 : dx / d
        const ny = d < 1e-6 ? 0 : dy / d
        const overlap = minDist - d
        const wa = fa ? 0 : fb ? 1 : 0.5
        const wb = fb ? 0 : fa ? 1 : 0.5
        a.pos.x -= nx * overlap * wa
        a.pos.y -= ny * overlap * wa
        b.pos.x += nx * overlap * wb
        b.pos.y += ny * overlap * wb
        any = true
      }
    }
    if (bounds) {
      for (const it2 of items) {
        if (fixed.has(it2.id)) continue
        it2.pos.x = clamp(it2.pos.x, bounds.x0, bounds.x1)
        it2.pos.y = clamp(it2.pos.y, bounds.y0, bounds.y1)
      }
    }
    if (!any) break
    moved = true
  }
  return moved
}

/**
 * Dichtstbijzijnde vrije plek bij `target`: niet binnen `minDist` van een van
 * `taken`, en binnen `bounds`. Zoekt in ringen rond het doel.
 */
export function nearestFreeSpot(target: Vec, taken: Vec[], minDist: number, bounds: { x0: number; y0: number; x1: number; y1: number }): Vec {
  const inB = (p: Vec) => p.x >= bounds.x0 && p.x <= bounds.x1 && p.y >= bounds.y0 && p.y <= bounds.y1
  const free = (p: Vec) => inB(p) && taken.every((q) => dist(p, q) >= minDist)
  const start = v(clamp(target.x, bounds.x0, bounds.x1), clamp(target.y, bounds.y0, bounds.y1))
  if (free(start)) return start
  const step = minDist * 0.2
  for (let ring = 1; ring <= 40; ring++) {
    const rad = ring * step
    const n = Math.max(12, Math.round((2 * Math.PI * rad) / step))
    let best: Vec | null = null
    let bd = Infinity
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const p = v(start.x + Math.cos(a) * rad, start.y + Math.sin(a) * rad)
      if (!free(p)) continue
      const d = dist(p, target)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    if (best) return best
  }
  return start
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
