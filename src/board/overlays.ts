/**
 * Analyse-lagen: passlijnen, schothoek en ruimtekaart (Voronoi).
 */
import { Delaunay } from 'd3-delaunay'
import { attackGoal, dist, passLanes, shotWindow, v } from '../geometry'
import { RULES } from '../rules'
import type { Board, Team, Vec } from '../types'
import { el, f2, FONT_NUM } from './svg'

export interface OverlayInput {
  board: Board
  pos: (id: string) => Vec
  ball: Vec
  holder: string | null
  r: number
  textFix: string
  mul: number
  colors: { white: string; blue: string }
  inPlay: (id: string) => boolean
}

export function drawVoronoi(g: SVGGElement, o: OverlayInput) {
  g.replaceChildren()
  const { length: L, width: W } = o.board.field
  const ps = o.board.pieces.filter((p) => o.inPlay(p.id))
  if (ps.length < 2) return
  const pts = ps.map((p) => {
    const q = o.pos(p.id)
    return [Math.min(L, Math.max(0, q.x)), Math.min(W, Math.max(0, q.y))] as [number, number]
  })
  const vor = Delaunay.from(pts).voronoi([0, 0, L, W])
  ps.forEach((p, i) => {
    const poly = vor.cellPolygon(i)
    if (!poly) return
    const d = 'M' + poly.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L') + ' Z'
    const fill = p.team === 'white' ? '#ffffff' : o.colors.blue
    el('path', { d, fill, 'fill-opacity': p.team === 'white' ? 0.16 : 0.26, stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 0.03 }, g)
  })
}

export function drawPassLanes(g: SVGGElement, o: OverlayInput) {
  g.replaceChildren()
  const holder = o.holder ? o.board.pieces.find((p) => p.id === o.holder) : null
  if (!holder) return
  const from = o.pos(holder.id)
  const mates = o.board.pieces.filter((p) => p.team === holder.team && p.id !== holder.id && !p.keeper && o.inPlay(p.id)).map((p) => ({ id: p.id, pos: o.pos(p.id) }))
  const opps = o.board.pieces.filter((p) => p.team !== holder.team && o.inPlay(p.id)).map((p) => ({ id: p.id, pos: o.pos(p.id) }))
  const lanes = passLanes(from, mates, opps)
  const w = 0.09 * o.mul
  for (const l of lanes) {
    const to = mates.find((m) => m.id === l.to)!.pos
    const color = l.open ? '#2fe07a' : '#ff4d4d'
    // lijn tot de rand van de cap
    const d = dist(from, to)
    const k0 = Math.min(0.45, (o.r * 1.1) / d)
    const a = v(from.x + (to.x - from.x) * k0, from.y + (to.y - from.y) * k0)
    const b = v(to.x - (to.x - from.x) * k0, to.y - (to.y - from.y) * k0)
    el('line', { x1: f2(a.x), y1: f2(a.y), x2: f2(b.x), y2: f2(b.y), stroke: 'rgba(0,20,40,0.45)', 'stroke-width': w + 0.06, 'stroke-linecap': 'round' }, g)
    el(
      'line',
      {
        x1: f2(a.x),
        y1: f2(a.y),
        x2: f2(b.x),
        y2: f2(b.y),
        stroke: color,
        'stroke-width': w,
        'stroke-linecap': 'round',
        'stroke-dasharray': l.open ? undefined : `${f2(w * 2)} ${f2(w * 1.6)}`,
      },
      g,
    )
    if (!l.open && l.interceptor) {
      const ip = o.pos(l.interceptor)
      el('circle', { cx: f2(ip.x), cy: f2(ip.y), r: o.r * 1.18, fill: 'none', stroke: '#ff4d4d', 'stroke-width': 0.08 * o.mul, 'stroke-dasharray': '0.18 0.12' }, g)
    }
  }
}

export function drawShotWindow(g: SVGGElement, o: OverlayInput) {
  g.replaceChildren()
  const holder = o.holder ? o.board.pieces.find((p) => p.id === o.holder) : null
  const f = { length: o.board.field.length, width: o.board.field.width }
  let team: Team
  if (holder) team = holder.team
  else team = o.ball.x > f.length / 2 ? 'white' : 'blue'
  const goal = attackGoal(team, f)
  const ball = o.ball
  const blockers = o.board.pieces
    .filter((p) => p.team !== team && o.inPlay(p.id))
    .map((p) => ({ pos: o.pos(p.id), r: p.keeper ? RULES.analysis.blockRadiusKeeper : RULES.analysis.blockRadiusField }))
  const w = shotWindow(ball, goal, blockers)
  const [p1, p2] = w.posts
  el('path', { d: `M${f2(ball.x)} ${f2(ball.y)} L${f2(p1.x)} ${f2(p1.y)} L${f2(p2.x)} ${f2(p2.y)} Z`, fill: '#ffffff', 'fill-opacity': 0.14, stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 0.04 }, g)
  for (const [a, b] of w.blocked) {
    el('path', { d: `M${f2(ball.x)} ${f2(ball.y)} L${f2(goal.x)} ${f2(a)} L${f2(goal.x)} ${f2(b)} Z`, fill: '#001526', 'fill-opacity': 0.32 }, g)
  }
  for (const [a, b] of w.open) {
    el('path', { d: `M${f2(ball.x)} ${f2(ball.y)} L${f2(goal.x)} ${f2(a)} L${f2(goal.x)} ${f2(b)} Z`, fill: '#2fe07a', 'fill-opacity': 0.2 }, g)
    el('line', { x1: goal.x, y1: f2(a), x2: goal.x, y2: f2(b), stroke: '#2fe07a', 'stroke-width': 0.22, 'stroke-linecap': 'butt' }, g)
  }
  // label met % open doel, net vóór het doel
  const lx = goal.x === 0 ? 1.4 : goal.x - 1.4
  const ly = goal.y - RULES.goal.width / 2 - 0.9
  const tg = el('g', { transform: `translate(${f2(lx)} ${f2(ly)}) ${o.textFix}` }, g)
  el('rect', { x: -1.25, y: -0.42, width: 2.5, height: 0.84, rx: 0.2, fill: 'rgba(0,21,38,0.78)' }, tg)
  el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#ffffff', 'font-family': FONT_NUM, 'font-weight': 700, 'font-size': 0.56 }, tg).textContent =
    `${Math.round(w.fraction * 100)}% open`
}
