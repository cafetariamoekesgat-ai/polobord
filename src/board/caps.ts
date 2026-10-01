/**
 * Waterpolo-caps van bovenaf (met oorbeschermers en nummer) en de bal.
 * Alles wordt getekend in eenheden van de cap-straal en daarna geschaald,
 * zodat de caps op elk scherm minstens 56 pt groot zijn.
 */
import type { Piece } from '../types'
import { el, f2, FONT_NUM, luminance, setAttrs, shade } from './svg'

export interface CapColors {
  white: string
  blue: string
}

const KEEPER_RED = '#d42a2f'

export function capPalette(p: Piece, colors: CapColors) {
  const team = p.team === 'white' ? colors.white : colors.blue
  const base = p.keeper ? KEEPER_RED : team
  const dark = luminance(base) > 0.5
  return {
    base,
    edge: shade(base, dark ? -0.28 : -0.35),
    ear: shade(base, dark ? -0.1 : 0.12),
    num: dark ? '#0e2a66' : '#ffffff',
    ring: team,
  }
}

export class PieceView {
  g: SVGGElement
  private rot: SVGGElement
  private numText: SVGTextElement
  private nameText: SVGTextElement
  private exclRing: SVGCircleElement
  private exclText: SVGTextElement
  private exclGroup: SVGGElement
  private hilite: SVGCircleElement
  private warnRing: SVGCircleElement
  private warnOn = false
  private gloss: SVGEllipseElement
  private textGroup: SVGGElement
  private leftyBadge: SVGGElement
  private lastKey = ''
  private lastTransform = ''
  private lastAngle = NaN
  private lastExcl = ''

  constructor(
    parent: SVGGElement,
    public id: string,
  ) {
    this.g = el('g', { 'data-id': id }, parent)
    // schaduw
    el('circle', { cx: 0.08, cy: 0.12, r: 1.04, fill: 'rgba(0,18,36,0.3)' }, this.g)
    this.hilite = el('circle', { r: 1.36, fill: 'none', stroke: '#ffd21f', 'stroke-width': 0.16, opacity: 0 }, this.g)
    this.warnRing = el(
      'circle',
      { r: 1.32, fill: 'rgba(255,120,0,0.18)', stroke: '#ff7a00', 'stroke-width': 0.2, 'stroke-dasharray': '0.35 0.2', opacity: 0 },
      this.g,
    )
    this.rot = el('g', {}, this.g)
    this.gloss = el('ellipse', { cx: -0.28, cy: -0.34, rx: 0.42, ry: 0.26, fill: '#ffffff', transform: 'rotate(-30)' }, this.g)
    this.exclGroup = el('g', { opacity: 0 }, this.g)
    this.exclRing = el(
      'circle',
      { r: 1.24, fill: 'none', stroke: '#ff3b30', 'stroke-width': 0.16, transform: 'rotate(-90)', 'stroke-linecap': 'round' },
      this.exclGroup,
    )
    const tg = el('g', {}, this.g)
    this.numText = el(
      'text',
      { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': FONT_NUM, 'font-weight': 700, y: 0.04 },
      tg,
    )
    this.nameText = el(
      'text',
      {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': FONT_NUM,
        'font-weight': 600,
        'font-size': 0.6,
        y: 1.72,
        fill: '#ffffff',
        stroke: 'rgba(0,20,40,0.75)',
        'stroke-width': 0.16,
        'paint-order': 'stroke',
        'stroke-linejoin': 'round',
      },
      tg,
    )
    this.exclText = el(
      'text',
      {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': FONT_NUM,
        'font-weight': 700,
        'font-size': 0.78,
        y: -1.85,
        fill: '#ff3b30',
        stroke: '#ffffff',
        'stroke-width': 0.2,
        'paint-order': 'stroke',
      },
      this.exclGroup,
    )
    this.textGroup = tg
    this.leftyBadge = el('g', {}, tg)
  }

  /** Opnieuw opbouwen als kleur, nummer, rol of naam verandert. */
  style(p: Piece, colors: CapColors, textFix: string, showNames: boolean) {
    const key = `${p.team}|${p.keeper}|${p.num}|${p.name ?? ''}|${!!p.lefty}|${colors.white}|${colors.blue}|${textFix}|${showNames}`
    if (key === this.lastKey) return
    this.lastKey = key
    const c = capPalette(p, colors)
    this.rot.replaceChildren()
    // oorbeschermers
    for (const s of [-1, 1]) {
      el('ellipse', { cx: -0.05, cy: s * 0.86, rx: 0.4, ry: 0.3, fill: c.ear, stroke: c.edge, 'stroke-width': 0.06 }, this.rot)
      for (const dx of [-0.16, 0, 0.16]) el('circle', { cx: dx - 0.05, cy: s * 0.86, r: 0.045, fill: c.edge, opacity: 0.8 }, this.rot)
    }
    el('circle', { r: 1, fill: c.base, stroke: c.edge, 'stroke-width': 0.07 }, this.rot)
    // naad van voor naar achter
    el('path', { d: 'M-0.94 0 L0.94 0', stroke: c.edge, 'stroke-width': 0.05, opacity: 0.45 }, this.rot)
    // neus/voorkant: klein streepje zodat je ziet waar de speler naar kijkt
    el('path', { d: 'M0.72 -0.18 Q0.9 0 0.72 0.18', fill: 'none', stroke: c.edge, 'stroke-width': 0.07, opacity: 0.55 }, this.rot)
    if (p.keeper) el('circle', { r: 1.1, fill: 'none', stroke: c.ring, 'stroke-width': 0.16 }, this.rot)
    // glans draait niet mee: het licht komt altijd van linksboven
    this.gloss.setAttribute('opacity', luminance(c.base) > 0.5 ? '0.35' : '0.16')
    this.textGroup.setAttribute('transform', textFix)
    this.exclGroup.setAttribute('transform', textFix)
    this.numText.textContent = String(p.num)
    setAttrs(this.numText, { fill: c.num, 'font-size': p.num >= 10 ? 0.98 : 1.1 })
    this.nameText.textContent = showNames && p.name ? p.name : ''
    // linkshandig: geel "L"-plaatje rechtsboven op de cap
    this.leftyBadge.replaceChildren()
    if (p.lefty) {
      el('circle', { cx: 0.78, cy: -0.78, r: 0.38, fill: '#ffd21f', stroke: '#1b2a38', 'stroke-width': 0.06 }, this.leftyBadge)
      el(
        'text',
        { x: 0.78, y: -0.75, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': FONT_NUM, 'font-weight': 700, 'font-size': 0.52, fill: '#1b2a38' },
        this.leftyBadge,
      ).textContent = 'L'
    }
    this.lastAngle = NaN
  }

  place(x: number, y: number, r: number) {
    const t = `translate(${f2(x)} ${f2(y)}) scale(${f2(r)})`
    if (t !== this.lastTransform) {
      this.g.setAttribute('transform', t)
      this.lastTransform = t
    }
  }

  face(angleDeg: number) {
    if (Math.abs(angleDeg - this.lastAngle) < 1.5) return
    this.lastAngle = angleDeg
    this.rot.setAttribute('transform', `rotate(${Math.round(angleDeg)})`)
  }

  /** Oranje ring: deze speler ligt zonder bal in het doelgebied (regel 8.10). */
  warn(on: boolean) {
    if (on === this.warnOn) return
    this.warnOn = on
    this.warnRing.setAttribute('opacity', on ? '1' : '0')
  }

  highlight(on: boolean) {
    this.hilite.setAttribute('opacity', on ? '1' : '0')
  }

  /** Uitsluitingsring: remaining in seconden, total = volledige tijd; null = niet uitgesloten, 0-timer = "UIT". */
  exclusion(remaining: number | null, total: number) {
    const key = remaining == null ? 'none' : String(Math.ceil(remaining * 10))
    if (key === this.lastExcl) return
    this.lastExcl = key
    if (remaining == null) {
      this.exclGroup.setAttribute('opacity', '0')
      this.g.setAttribute('opacity', '1')
      return
    }
    this.exclGroup.setAttribute('opacity', '1')
    this.g.setAttribute('opacity', '0.92')
    const circ = 2 * Math.PI * 1.24
    const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 1
    this.exclRing.setAttribute('stroke-dasharray', `${f2(circ * frac)} ${f2(circ)}`)
    this.exclRing.setAttribute('stroke', remaining <= 0 && total > 0 ? '#2fcf72' : '#ff3b30')
    this.exclText.textContent = total <= 0 ? 'UIT' : remaining > 0 ? String(Math.ceil(remaining)) : 'IN'
    this.exclText.setAttribute('fill', remaining <= 0 && total > 0 ? '#1e9e55' : '#ff3b30')
  }

  remove() {
    this.g.remove()
  }
}

export class BallView {
  g: SVGGElement
  private body: SVGGElement
  private shadow: SVGCircleElement
  private last = ''
  constructor(parent: SVGGElement) {
    this.g = el('g', { 'data-ball': '1' }, parent)
    this.shadow = el('circle', { cx: 0.12, cy: 0.18, r: 1, fill: 'rgba(0,18,36,0.32)' }, this.g)
    this.body = el('g', {}, this.g)
    el('circle', { r: 1, fill: '#ffd21f', stroke: '#b48600', 'stroke-width': 0.09 }, this.body)
    const seam = { fill: 'none', stroke: '#1d3f8f', 'stroke-width': 0.13, 'stroke-linecap': 'round' as const }
    el('path', { d: 'M-0.97 -0.1 C-0.4 -0.62 0.4 -0.62 0.97 -0.1', ...seam }, this.body)
    el('path', { d: 'M-0.9 0.4 C-0.3 0.05 0.35 0.2 0.8 0.6', ...seam }, this.body)
    el('path', { d: 'M-0.1 -0.98 C0.12 -0.3 0.1 0.35 -0.2 0.97', ...seam, opacity: 0.8 }, this.body)
    el('ellipse', { cx: -0.34, cy: -0.4, rx: 0.34, ry: 0.2, fill: '#ffffff', opacity: 0.45, transform: 'rotate(-30)' }, this.body)
  }
  place(x: number, y: number, r: number, lift = 0) {
    const s = r * (1 + lift * 0.5)
    const t = `translate(${f2(x)} ${f2(y)}) scale(${f2(s)})|${f2(lift)}`
    if (t === this.last) return
    this.last = t
    this.g.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) scale(${f2(s)})`)
    this.shadow.setAttribute('cx', String(f2(0.12 + lift * 0.9)))
    this.shadow.setAttribute('cy', String(f2(0.18 + lift * 1.3)))
    this.shadow.setAttribute('opacity', String(f2(1 - lift * 0.5)))
  }
}
