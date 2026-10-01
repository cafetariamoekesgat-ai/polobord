import { describe, expect, it, vi } from 'vitest'
import { computeFormation, defaultPieces, FORMATIONS } from './formations'
import { dist, toAttack } from './geometry'
import { RULES } from './rules'
import type { Board } from './types'

vi.mock('./store', () => ({ showToast: () => {} }))

function board(lefties: number[] = []): Board {
  return {
    field: { id: 't', label: 't', length: 25, width: 20 },
    pieces: defaultPieces().map((p, i) => ({ ...p, x: 8 + (i % 7), y: 4 + (i % 7) * 2, lefty: p.team === 'white' && lefties.includes(p.num) })),
    ball: { x: 12.5, y: 10, holder: null },
    strokes: [],
    attacking: 'white',
    steps: [],
    currentStep: 0,
  }
}

describe('linkshandigen', () => {
  for (const id of ['3-3', '4-2', 'pp-42', 'pp-33']) {
    it(`${id}: linkshandigen komen aan de rechterkant`, () => {
      const b = board([2, 3])
      const r = computeFormation(b, FORMATIONS.find((f) => f.id === id)!)
      for (const p of b.pieces.filter((x) => x.lefty)) {
        expect(toAttack('white', b.field, r.targets[p.id]).s, `${p.id}`).toBeGreaterThan(-0.5)
      }
    })
  }
})

describe('spacing in de opstellingen', () => {
  for (const fm of FORMATIONS.filter((f) => f.attack)) {
    it(`${fm.label}: aanvallers minstens ${RULES.spacingMin} m uit elkaar`, () => {
      const b = board()
      const r = computeFormation(b, fm)
      const ps = b.pieces.filter((p) => p.team === 'white' && !p.keeper && !r.excluded[p.id]).map((p) => r.targets[p.id])
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(dist(ps[i], ps[j])).toBeGreaterThanOrEqual(RULES.spacingMin)
    })
  }
})

describe('deellink', () => {
  it('codeert en decodeert een bord (met compressie)', async () => {
    const { encode, decode } = await import('./share')
    const b = board([4])
    const s = await encode({ v: 1, name: 'Test', board: b })
    expect(s[0]).toBe('z')
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = await decode<{ name: string; board: Board }>(s)
    expect(back.name).toBe('Test')
    expect(back.board.pieces.length).toBe(b.pieces.length)
    expect(back.board.pieces.find((p) => p.lefty)?.num).toBe(4)
  })
})
