/**
 * Getekende lijnen: zwemlijn (doorgetrokken), pass (gestreept), schot (dik met
 * pijlpunt), blok/screen (T-lijn) en vrij tekenen (drukgevoelig).
 */
import { getStroke } from 'perfect-freehand'
import { alongPolyline, dist, polylineLength, sub, unit, v } from '../geometry'
import type { Stroke, Vec } from '../types'
import { el, f2, luminance } from './svg'

export const BASE_WIDTH = 0.11

/** Ramer–Douglas–Peucker. */
export function simplify(points: Vec[], eps: number): Vec[] {
  if (points.length < 3) return points
  const keep = new Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let maxD = 0
    let idx = -1
    const A = points[a]
    const B = points[b]
    const AB = sub(B, A)
    const l = Math.hypot(AB.x, AB.y) || 1e-9
    for (let i = a + 1; i < b; i++) {
      const P = points[i]
      const d = Math.abs(AB.x * (A.y - P.y) - AB.y * (A.x - P.x)) / l
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = true
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Catmull-Rom door de punten, als kubische Bézier-path. */
export function smoothPath(pts: Vec[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${f2(pts[0].x)} ${f2(pts[0].y)}`
  let d = `M${f2(pts[0].x)} ${f2(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = v(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6)
    const c2 = v(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6)
    d += ` C${f2(c1.x)} ${f2(c1.y)} ${f2(c2.x)} ${f2(c2.y)} ${f2(p2.x)} ${f2(p2.y)}`
  }
  return d
}

/** Punten die de lijn gebruikt (vereenvoudigd, behalve bij vrij tekenen). */
export function strokeVecs(s: Stroke): Vec[] {
  const pts = s.points.map(([x, y]) => v(x, y))
  return s.kind === 'free' ? pts : simplify(pts, 0.05)
}

function underlayColor(color: string) {
  return luminance(color) > 0.35 ? 'rgba(0,25,50,0.4)' : 'rgba(255,255,255,0.5)'
}

/** Tekent één lijn in `parent`. mul = lijndikte-factor (presentatiemodus). */
export function renderStroke(parent: SVGGElement, s: Stroke, mul: number, opacity = 1): SVGGElement {
  const g = el('g', { 'data-stroke': s.id, opacity: opacity < 1 ? opacity : undefined }, parent)
  const w = BASE_WIDTH * mul * (s.kind === 'shot' ? 1.9 : 1)
  const under = underlayColor(s.color)

  if (s.kind === 'free') {
    const hasPressure = s.points.some(([, , p]) => p > 0 && p !== 0.5)
    const outline = getStroke(
      s.points.map(([x, y, p]) => [x, y, p || 0.5]),
      { size: 0.24 * mul, thinning: 0.6, smoothing: 0.5, streamline: 0.35, simulatePressure: !hasPressure, last: true },
    )
    if (outline.length) {
      const d = 'M' + outline.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L') + ' Z'
      el('path', { d, fill: under, stroke: under, 'stroke-width': 0.06 * mul, 'stroke-linejoin': 'round' }, g)
      el('path', { d, fill: s.color }, g)
    }
    return g
  }

  let pts = strokeVecs(s)
  const total = polylineLength(pts)
  if (pts.length < 2 || total < 0.05) return g

  // pijlpunt / T-balk aan het eind
  const tip = pts[pts.length - 1]
  const back = alongPolyline(pts, Math.max(0, 1 - Math.min(0.6, total * 0.4) / total))
  const dir = unit(sub(tip, back))
  const nrm = v(-dir.y, dir.x)
  let head: string | null = null
  const headLen = w * (s.kind === 'shot' ? 3.4 : 4.2)
  const headW = w * (s.kind === 'shot' ? 2.6 : 2.9)
  if (s.kind !== 'screen') {
    // lijn inkorten zodat hij niet door de punt steekt
    const cut = (total - headLen * 0.7) / total
    const kept: Vec[] = []
    let acc = 0
    kept.push(pts[0])
    for (let i = 1; i < pts.length; i++) {
      const l = dist(pts[i - 1], pts[i])
      if ((acc + l) / total >= cut) break
      acc += l
      kept.push(pts[i])
    }
    kept.push(alongPolyline(pts, Math.max(0.01, cut)))
    pts = kept
    const b = v(tip.x - dir.x * headLen, tip.y - dir.y * headLen)
    head = `M${f2(tip.x)} ${f2(tip.y)} L${f2(b.x + nrm.x * headW)} ${f2(b.y + nrm.y * headW)} L${f2(b.x - nrm.x * headW)} ${f2(b.y - nrm.y * headW)} Z`
  }
  const d = smoothPath(pts)
  const dash = s.kind === 'pass' ? `${f2(w * 3.2)} ${f2(w * 2.4)}` : undefined
  const common = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  el('path', { ...common, stroke: under, 'stroke-width': w + 0.07 * mul, 'stroke-dasharray': dash }, g)
  el('path', { ...common, stroke: s.color, 'stroke-width': w, 'stroke-dasharray': dash }, g)
  if (head) {
    el('path', { d: head, fill: s.color, stroke: under, 'stroke-width': 0.04 * mul, 'stroke-linejoin': 'round' }, g)
  }
  if (s.kind === 'screen') {
    const half = 0.5 * Math.max(1, mul * 0.8)
    const a = v(tip.x + nrm.x * half, tip.y + nrm.y * half)
    const b = v(tip.x - nrm.x * half, tip.y - nrm.y * half)
    const bar = { x1: f2(a.x), y1: f2(a.y), x2: f2(b.x), y2: f2(b.y), 'stroke-linecap': 'round' }
    el('line', { ...bar, stroke: under, 'stroke-width': w * 1.8 + 0.07 * mul }, g)
    el('line', { ...bar, stroke: s.color, 'stroke-width': w * 1.8 }, g)
  }
  return g
}

/** Snelle weergave tijdens het tekenen. */
export function livePath(s: Stroke, mul: number): { d: string; width: number; dash?: string; fill: boolean } {
  if (s.kind === 'free') {
    const outline = getStroke(
      s.points.map(([x, y, p]) => [x, y, p || 0.5]),
      { size: 0.24 * mul, thinning: 0.6, smoothing: 0.5, streamline: 0.35, simulatePressure: !s.points.some(([, , p]) => p > 0 && p !== 0.5) },
    )
    return { d: outline.length ? 'M' + outline.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L') + ' Z' : '', width: 0, fill: true }
  }
  const w = BASE_WIDTH * mul * (s.kind === 'shot' ? 1.9 : 1)
  return {
    d: 'M' + s.points.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L'),
    width: w,
    dash: s.kind === 'pass' ? `${f2(w * 3.2)} ${f2(w * 2.4)}` : undefined,
    fill: false,
  }
}

/** Ligt punt p binnen `r` van de lijn? (voor de gum) */
export function strokeHit(s: Stroke, p: Vec, r: number): boolean {
  const pts = s.points
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    if (Math.hypot(a[0] - p.x, a[1] - p.y) < r) return true
    if (i > 0) {
      const b = pts[i - 1]
      const abx = a[0] - b[0]
      const aby = a[1] - b[1]
      const l2 = abx * abx + aby * aby || 1e-9
      const t = Math.max(0, Math.min(1, ((p.x - b[0]) * abx + (p.y - b[1]) * aby) / l2))
      if (Math.hypot(b[0] + abx * t - p.x, b[1] + aby * t - p.y) < r) return true
    }
  }
  return false
}
