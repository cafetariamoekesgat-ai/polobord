import { describe, expect, it } from 'vitest'
import { computeFormation, defaultPieces, FORMATIONS } from './formations'
import { goalAreaFoul, inGoalArea, v } from './geometry'
import type { Board } from './types'

const F = { length: 25, width: 20 }

describe('doelgebied (regel 1.7 / 8.10)', () => {
  it('is 2 m naast elke paal tot de 2 m-lijn', () => {
    // wit valt aan op x = 25; palen op y = 8,5 en 11,5
    expect(inGoalArea('white', F, v(24, 10))).toBe(true)
    expect(inGoalArea('white', F, v(24, 6.6))).toBe(true) // 1,9 m naast de paal
    expect(inGoalArea('white', F, v(24, 6.4))).toBe(false) // 2,1 m naast de paal
    expect(inGoalArea('white', F, v(22.9, 10))).toBe(false) // vóór de 2 m-lijn
  })
  it('zonder bal in het vak is een fout, behalve achter de lijn van de bal', () => {
    const p = v(23.6, 10.5) // 1,4 m van de doellijn
    expect(goalAreaFoul('white', F, p, v(18, 10), false)).toBe(true)
    // bal dieper (0,8 m van de doellijn): speler ligt achter de lijn van de bal
    expect(goalAreaFoul('white', F, p, v(24.2, 13.9), false)).toBe(false)
    // met de bal mag het altijd
    expect(goalAreaFoul('white', F, p, p, true)).toBe(false)
  })
  it('binnen de 2 m maar naast het vak mag', () => {
    expect(goalAreaFoul('white', F, v(24, 5.5), v(18, 10), false)).toBe(false)
  })
  it('geldt ook voor blauw (aanval op x = 0)', () => {
    expect(goalAreaFoul('blue', F, v(1, 10), v(7, 10), false)).toBe(true)
  })
})

describe('opstellingen houden zich aan het doelgebied', () => {
  for (const width of [20, 15]) {
    for (const fm of FORMATIONS.filter((x) => x.attack)) {
      it(`${fm.label} (${width} m breed)`, () => {
        const b: Board = {
          field: { id: 't', label: 't', length: 25, width },
          pieces: defaultPieces().map((p, i) => ({ ...p, x: 5 + i, y: 5 + (i % 7) })),
          ball: { x: 12.5, y: width / 2, holder: null },
          strokes: [],
          attacking: 'white',
          steps: [],
          currentStep: 0,
        }
        const r = computeFormation(b, fm)
        const f = { length: 25, width }
        const ball = r.ball.holder ? r.targets[r.ball.holder] : v(r.ball.x, r.ball.y)
        for (const p of b.pieces.filter((q) => q.team === 'white' && !q.keeper && !r.excluded[q.id])) {
          expect(goalAreaFoul('white', f, r.targets[p.id], ball, r.ball.holder === p.id), `${p.id}`).toBe(false)
        }
      })
    }
  }
})
