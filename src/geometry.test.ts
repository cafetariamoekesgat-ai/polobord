import { describe, expect, it } from 'vitest'
import {
  assignMarks,
  dist,
  fromAttack,
  goalSidePosition,
  keeperPosition,
  passLanes,
  pointSegment,
  resolveCollisions,
  shotWindow,
  toAttack,
  v,
} from './geometry'
import { defenseTargets, keeperTarget } from './defense'

const F = { length: 25, width: 20 }
const GOAL_R = v(25, 10) // doel waarop wit aanvalt

describe('auto-dekking (man-man)', () => {
  it('ligt doelzijde, 1 m van de aanvaller, op de lijn naar het doel', () => {
    const a = v(20, 10)
    const p = goalSidePosition(a, GOAL_R, 1)
    expect(p.x).toBeCloseTo(21)
    expect(p.y).toBeCloseTo(10)
    expect(dist(p, a)).toBeCloseTo(1)
  })

  it('volgt de hoek als de aanvaller op de zijkant ligt', () => {
    const a = v(22, 4)
    const p = goalSidePosition(a, GOAL_R, 1)
    expect(dist(p, a)).toBeCloseTo(1)
    // dichter bij het doel dan de aanvaller
    expect(dist(p, GOAL_R)).toBeLessThan(dist(a, GOAL_R))
    // op de verbindingslijn
    expect(pointSegment(p, a, GOAL_R).dist).toBeLessThan(1e-9)
  })

  it('schiet niet voorbij het doel bij een aanvaller vlak voor de doellijn', () => {
    const a = v(24.6, 10)
    const p = goalSidePosition(a, GOAL_R, 1)
    expect(p.x).toBeLessThanOrEqual(25)
    expect(dist(p, a)).toBeCloseTo(0.2)
  })

  it('koppelt verdedigers met de kleinste totale afstand', () => {
    const attackers = [
      { id: 'a1', pos: v(20, 4) },
      { id: 'a2', pos: v(20, 16) },
      { id: 'a3', pos: v(23, 10) },
    ]
    const defenders = [
      { id: 'd1', pos: v(24, 10) },
      { id: 'd2', pos: v(21, 15) },
      { id: 'd3', pos: v(21, 5) },
    ]
    expect(assignMarks(defenders, attackers)).toEqual({ d1: 'a3', d2: 'a2', d3: 'a1' })
  })

  it('laat bij 6 tegen 5 één aanvaller vrij, en elke verdediger heeft een man', () => {
    const attackers = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, pos: v(18 + i * 0.5, 2 + i * 3) }))
    const defenders = [0, 1, 2, 3, 4].map((i) => ({ id: `d${i}`, pos: v(22, 3 + i * 3) }))
    const m = assignMarks(defenders, attackers)
    const marked = Object.values(m)
    expect(marked.every(Boolean)).toBe(true)
    expect(new Set(marked).size).toBe(5)
  })

  it('defenseTargets geeft elke verdediger een plek doelzijde van zijn man', () => {
    const attackers = [
      { id: 'a1', pos: v(19, 6) },
      { id: 'a2', pos: v(19, 14) },
    ]
    const defenders = [
      { id: 'd1', pos: v(22, 6) },
      { id: 'd2', pos: v(22, 14) },
    ]
    const r = defenseTargets('man', 'white', F, attackers, defenders, attackers[0].pos, 'a1')
    expect(r.marks).toEqual({ d1: 'a1', d2: 'a2' })
    for (const d of defenders) {
      const a = attackers.find((x) => x.id === r.marks[d.id])!.pos
      expect(dist(r.targets[d.id], a)).toBeCloseTo(1)
      expect(dist(r.targets[d.id], GOAL_R)).toBeLessThan(dist(a, GOAL_R))
    }
  })

  it('houdt bestaande koppelingen vast', () => {
    const attackers = [
      { id: 'a1', pos: v(19, 6) },
      { id: 'a2', pos: v(19, 14) },
    ]
    const defenders = [
      { id: 'd1', pos: v(22, 6) },
      { id: 'd2', pos: v(22, 14) },
    ]
    // bewust "gekruist": blijft staan
    const r = defenseTargets('man', 'white', F, attackers, defenders, v(19, 6), null, { d1: 'a2', d2: 'a1' })
    expect(r.marks).toEqual({ d1: 'a2', d2: 'a1' })
  })

  it('keeper ligt op de bissectrice van de doelhoek, binnen de palen', () => {
    // bal recht voor het doel: keeper in het midden
    expect(keeperPosition(v(18, 10), GOAL_R, 0.6).y).toBeCloseTo(10)
    // bal links: keeper schuift naar links, maar blijft binnen de palen
    const k = keeperPosition(v(20, 2), GOAL_R, 0.6)
    expect(k.x).toBeCloseTo(24.4)
    expect(k.y).toBeLessThan(10)
    expect(k.y).toBeGreaterThanOrEqual(8.5)
    // en is gelijk aan keeperTarget voor wit als aanvaller
    expect(keeperTarget('white', F, v(20, 2))).toEqual(k)
  })

  it('keeper blijft in het midden als de bal achter hem ligt', () => {
    expect(keeperPosition(v(24.8, 3), GOAL_R, 0.6)).toEqual(v(24.4, 10))
  })
})

describe('passlijnen', () => {
  const holder = v(15, 10)
  const mates = [
    { id: 'm1', pos: v(20, 4) },
    { id: 'm2', pos: v(20, 16) },
  ]
  it('is vrij zonder verdediger in de buurt', () => {
    const lanes = passLanes(holder, mates, [{ id: 'd', pos: v(10, 10) }], 1.2)
    expect(lanes.every((l) => l.open)).toBe(true)
  })
  it('is onderschepbaar als een verdediger op de lijn ligt', () => {
    const mid = v(17.5, 7) // precies halverwege holder→m1
    const lanes = passLanes(holder, mates, [{ id: 'd', pos: v(mid.x + 0.3, mid.y + 0.3) }], 1.2)
    expect(lanes.find((l) => l.to === 'm1')).toMatchObject({ open: false, interceptor: 'd' })
    expect(lanes.find((l) => l.to === 'm2')!.open).toBe(true)
  })
  it('telt een verdediger ver achter de passer niet mee', () => {
    const lanes = passLanes(holder, mates, [{ id: 'd', pos: v(12, 12) }], 1.2)
    expect(lanes.every((l) => l.open)).toBe(true)
  })
})

describe('schothoek', () => {
  it('is helemaal open zonder blokkers', () => {
    const w = shotWindow(v(19, 10), GOAL_R, [])
    expect(w.fraction).toBeCloseTo(1)
    expect(w.open).toEqual([[8.5, 11.5]])
  })
  it('een blokker recht voor de bal dekt het midden af, symmetrisch', () => {
    const w = shotWindow(v(19, 10), GOAL_R, [{ pos: v(21, 10), r: 0.45 }])
    expect(w.fraction).toBeGreaterThan(0)
    expect(w.fraction).toBeLessThan(1)
    expect(w.open.length).toBe(2)
    const [left, right] = w.open
    expect(left[1] - left[0]).toBeCloseTo(right[1] - right[0])
    // schaduw op de doellijn (6 m verderop): 2 × 6 × tan(asin(0.45 / 2)) ≈ 2,77 m
    expect(w.blocked[0][1] - w.blocked[0][0]).toBeCloseTo(2 * 6 * Math.tan(Math.asin(0.225)), 5)
  })
  it('een blokker achter de bal of voorbij de doellijn telt niet', () => {
    const w = shotWindow(v(19, 10), GOAL_R, [
      { pos: v(17, 10), r: 1 },
      { pos: v(26, 10), r: 1 },
    ])
    expect(w.fraction).toBeCloseTo(1)
  })
  it('een blokker vlak op de bal sluit alles', () => {
    expect(shotWindow(v(19, 10), GOAL_R, [{ pos: v(19.2, 10), r: 0.45 }]).fraction).toBe(0)
  })
  it('overlappende schaduwen tellen niet dubbel', () => {
    const one = shotWindow(v(19, 10), GOAL_R, [{ pos: v(21, 10), r: 0.45 }])
    const two = shotWindow(v(19, 10), GOAL_R, [
      { pos: v(21, 10), r: 0.45 },
      { pos: v(21.1, 10), r: 0.45 },
    ])
    expect(two.fraction).toBeCloseTo(one.fraction, 1)
  })
})

describe('coördinaten en botsing', () => {
  it('fromAttack en toAttack zijn elkaars inverse (ook voor blauw)', () => {
    for (const team of ['white', 'blue'] as const) {
      const p = fromAttack(team, F, 5, 3)
      expect(toAttack(team, F, p)).toEqual({ d: 5, s: 3 })
    }
  })
  it('duwt overlappende caps uit elkaar, de vastgehouden cap blijft staan', () => {
    const items = [
      { id: 'a', pos: v(10, 10) },
      { id: 'b', pos: v(10.3, 10) },
    ]
    resolveCollisions(items, 1, new Set(['a']))
    expect(items[0].pos).toEqual(v(10, 10))
    expect(dist(items[0].pos, items[1].pos)).toBeCloseTo(1)
  })
})

describe('vrije plek', () => {
  it('schuift een cap naar de dichtstbijzijnde plek zonder overlap', async () => {
    const { nearestFreeSpot } = await import('./geometry')
    const taken = [v(23, 10), v(24.4, 10)]
    const p = nearestFreeSpot(v(24, 10), taken, 1.5, { x0: 0.2, y0: 0.2, x1: 24.8, y1: 19.8 })
    for (const q of taken) expect(dist(p, q)).toBeGreaterThanOrEqual(1.5 - 1e-9)
    expect(p.x).toBeLessThanOrEqual(24.8)
    expect(dist(p, v(24, 10))).toBeLessThan(2)
  })
})
