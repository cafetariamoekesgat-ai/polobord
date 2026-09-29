/**
 * Automatische verdediging: waar horen de verdedigers te liggen, gegeven de
 * aanvallers en de bal. Gebruikt door de opstellingen, de live auto-dekking,
 * de quiz en de scenario-generator.
 */
import {
  assignMarks,
  attackGoal,
  dropPosition,
  fromAttack,
  goalSidePosition,
  keeperPosition,
  pressPosition,
  zonePositions,
  ZONE_BASE,
  type FieldDims,
  type ZoneKind,
} from './geometry'
import type { Team, Vec } from './types'

export type DefenseMode = 'man' | 'press' | 'drop' | 'M' | '2-3' | 'box'

export const DEFENSE_LABELS: Record<DefenseMode, string> = {
  man: 'Man-man (doelzijde)',
  press: 'Pressing (vóór de man)',
  drop: 'Terugzakken (drop)',
  M: 'M-zone (5 tegen 6)',
  '2-3': '2-3-zone (5 tegen 6)',
  box: 'Box (4 tegen 5)',
}

export const isZone = (m: DefenseMode): m is ZoneKind => m === 'M' || m === '2-3' || m === 'box'

export interface Placed {
  id: string
  pos: Vec
}

export interface DefenseResult {
  targets: Record<string, Vec>
  /** verdediger → aanvaller-id, of 'zone:<n>' bij zoneverdediging */
  marks: Record<string, string | null>
}

/**
 * Doelposities voor de veldverdedigers van het team dat níét aanvalt.
 * Bestaande koppelingen (`marks`) blijven staan zolang ze geldig zijn, zodat
 * verdedigers niet van man wisselen bij elke beweging.
 */
export function defenseTargets(
  mode: DefenseMode,
  attacking: Team,
  f: FieldDims,
  attackers: Placed[],
  defenders: Placed[],
  ball: Vec,
  holderId: string | null,
  marks: Record<string, string | null | undefined> = {},
): DefenseResult {
  const goal = attackGoal(attacking, f)
  const targets: Record<string, Vec> = {}
  const outMarks: Record<string, string | null> = {}

  if (isZone(mode)) {
    const spots = zonePositions(mode, attacking, f, ball)
    const spotIds = spots.map((_, i) => `zone:${i}`)
    const valid =
      defenders.every((d) => typeof marks[d.id] === 'string' && spotIds.includes(marks[d.id] as string)) &&
      new Set(defenders.map((d) => marks[d.id])).size === defenders.length
    const assign = valid
      ? Object.fromEntries(defenders.map((d) => [d.id, marks[d.id] as string]))
      : assignMarks(defenders, spots.map((pos, i) => ({ id: spotIds[i], pos })))
    for (const d of defenders) {
      const m = assign[d.id]
      outMarks[d.id] = m ?? null
      if (m) targets[d.id] = spots[Number(m.slice(5))]
      else targets[d.id] = fromAttack(attacking, f, 3, 0) // surplus: in het gat
    }
    return { targets, marks: outMarks }
  }

  const attackerIds = new Set(attackers.map((a) => a.id))
  const current = defenders.map((d) => marks[d.id])
  const valid =
    current.every((m) => m == null || attackerIds.has(m)) &&
    new Set(current.filter(Boolean)).size === current.filter(Boolean).length &&
    // iedere aanvaller gedekt zolang er genoeg verdedigers zijn
    current.filter(Boolean).length === Math.min(attackers.length, defenders.length)
  const assign = valid
    ? (Object.fromEntries(defenders.map((d) => [d.id, (marks[d.id] as string | null) ?? null])) as Record<string, string | null>)
    : assignMarks(defenders, attackers)

  const byId = new Map(attackers.map((a) => [a.id, a.pos]))
  for (const d of defenders) {
    const aid = assign[d.id]
    outMarks[d.id] = aid
    const a = aid ? byId.get(aid) : undefined
    if (!a) {
      // vrije verdediger: op 3 m, naar de balkant
      const b = fromAttack(attacking, f, 3, 0)
      targets[d.id] = { x: b.x, y: b.y + (ball.y - b.y) * 0.25 }
      continue
    }
    const isHolder = aid === holderId
    if (mode === 'press') targets[d.id] = pressPosition(a, ball, goal, isHolder)
    else if (mode === 'drop') targets[d.id] = dropPosition(a, ball, goal, isHolder)
    else targets[d.id] = goalSidePosition(a, goal)
  }
  return { targets, marks: outMarks }
}

/** Keeper van het verdedigende team: op de bissectrice van de doelhoek. */
export function keeperTarget(attacking: Team, f: FieldDims, ball: Vec): Vec {
  return keeperPosition(ball, attackGoal(attacking, f))
}

export const zoneSize = (m: DefenseMode) => (isZone(m) ? ZONE_BASE[m].length : Infinity)
