/**
 * Het bad van bovenaf: water, doellijnen, gekleurde zones (langs beide
 * zijkanten én als dunne lijnen over het water), strafworpmarkering,
 * doelen met net, terugkeerzones en de jurytafel.
 */
import { RULES, type FieldSize } from '../rules'
import { el, FONT_UI } from './svg'

export const MARGIN = { left: 1.4, right: 1.4, top: 2.4, bottom: 1.5 }

export interface FieldTheme {
  deck: string
  deckLine: string
  deckText: string
  water: string
  table: string
}

export const FIELD_THEMES: Record<'bad' | 'tribune', FieldTheme> = {
  bad: { deck: '#e6ecf1', deckLine: '#c5d0d9', deckText: '#44576a', water: '#1d8fd6', table: '#23384b' },
  tribune: { deck: '#0e1a25', deckLine: '#1f3142', deckText: '#8fa6ba', water: '#0f639d', table: '#2b4257' },
}

export const LINE = {
  white: '#ffffff',
  red: '#ea3a36',
  yellow: '#ffd23f',
  green: '#2fcf72',
}

/**
 * Tekent het veld in `g`. `textFix` is de tegen-transformatie voor tekst,
 * zodat labels leesbaar blijven bij draaien/spiegelen.
 */
export function drawField(g: SVGGElement, f: FieldSize, theme: FieldTheme, textFix: string, waterFill: string | null, tableX = f.length / 2) {
  g.replaceChildren()
  const L = f.length
  const W = f.width
  const big = 60

  // defs: net-patroon
  const defs = el('defs', {}, g)
  const pat = el('pattern', { id: 'net', width: 0.18, height: 0.18, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs)
  el('rect', { width: 0.18, height: 0.18, fill: 'rgba(255,255,255,0.08)' }, pat)
  el('path', { d: 'M0 0 L0 0.18 M0 0 L0.18 0', stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 0.025 }, pat)

  // dek rondom het water (met een gat voor het water)
  el(
    'path',
    {
      d: `M${-big} ${-big} H${L + big} V${W + big} H${-big} Z M0 0 V${W} H${L} V0 Z`,
      fill: theme.deck,
      'fill-rule': 'evenodd',
    },
    g,
  )
  // tegelvoegen op het dek
  const tiles = el('g', { stroke: theme.deckLine, 'stroke-width': 0.02, opacity: 0.8 }, g)
  for (let x = -MARGIN.left; x <= L + MARGIN.right; x += 1) {
    el('line', { x1: x, y1: -MARGIN.top, x2: x, y2: -0.02 }, tiles)
    el('line', { x1: x, y1: W + 0.02, x2: x, y2: W + MARGIN.bottom }, tiles)
  }

  // water: in de live weergave transparant (het water + lichtspel ligt eronder)
  el('rect', { class: 'water', x: 0, y: 0, width: L, height: W, fill: waterFill ?? 'transparent' }, g)

  // lijnen over het water
  const lines = el('g', { 'stroke-width': 0.07, opacity: 0.9 }, g)
  const vline = (x: number, color: string, extra: Record<string, string | number> = {}) =>
    el('line', { x1: x, y1: 0, x2: x, y2: W, stroke: color, ...extra }, lines)
  const { red, yellow } = RULES.zones
  for (const side of [0, 1]) {
    const at = (d: number) => (side === 0 ? d : L - d)
    vline(at(red), LINE.red)
    vline(at(yellow), LINE.yellow)
    vline(at(RULES.penaltyMark), LINE.white, { 'stroke-dasharray': '0.25 0.35', 'stroke-width': 0.04, opacity: 0.7 })
  }
  vline(L / 2, LINE.white, { 'stroke-width': 0.09 })
  // doellijnen
  vline(0, LINE.white, { 'stroke-width': 0.1 })
  vline(L, LINE.white, { 'stroke-width': 0.1 })

  // zijmarkeringen langs beide zijkanten
  const bars = el('g', {}, g)
  const barH = 0.38
  for (const [y0] of [[-barH - 0.08], [W + 0.08]]) {
    const seg = (x0: number, x1: number, color: string) =>
      el('rect', { x: Math.min(x0, x1), y: y0, width: Math.abs(x1 - x0), height: barH, fill: color }, bars)
    for (const side of [0, 1]) {
      const at = (d: number) => (side === 0 ? d : L - d)
      seg(at(0), at(red), LINE.red)
      seg(at(red), at(yellow), LINE.yellow)
      seg(at(yellow), L / 2, LINE.green)
      // goal line en middenlijn: wit blokje
      el('rect', { x: at(0) - 0.12, y: y0 - 0.06, width: 0.24, height: barH + 0.12, fill: LINE.white, stroke: theme.deckLine, 'stroke-width': 0.02 }, bars)
      // strafworp: wit streepje op 5 m
      el('rect', { x: at(RULES.penaltyMark) - 0.08, y: y0 - 0.06, width: 0.16, height: barH + 0.12, fill: LINE.white, stroke: theme.deckLine, 'stroke-width': 0.02 }, bars)
    }
    el('rect', { x: L / 2 - 0.12, y: y0 - 0.06, width: 0.24, height: barH + 0.12, fill: LINE.white, stroke: theme.deckLine, 'stroke-width': 0.02 }, bars)
  }

  // maatcijfers op het dek (bankkant)
  const labels = el('g', { fill: theme.deckText, 'font-family': FONT_UI, 'font-size': 0.42, 'font-weight': 600 }, g)
  const label = (x: number, y: number, text: string, size?: number) => {
    const t = el('g', { transform: `translate(${x} ${y}) ${textFix}` }, labels)
    el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size }, t).textContent = text
  }
  for (const side of [0, 1]) {
    const at = (d: number) => (side === 0 ? d : L - d)
    for (const d of [red, RULES.penaltyMark, yellow]) label(at(d), W + 0.95, `${d}`)
  }
  label(L / 2, W + 0.95, String(L / 2).replace('.', ','))

  // strafworpstip
  for (const side of [0, 1]) {
    const x = side === 0 ? RULES.penaltyMark : L - RULES.penaltyMark
    el('circle', { cx: x, cy: W / 2, r: 0.09, fill: LINE.white, opacity: 0.85 }, g)
  }

  // terugkeerzones: hoeken bij de doellijn, tegenover de jurytafel (bankkant, y = W)
  const re = RULES.reentry
  for (const side of [0, 1]) {
    const x = side === 0 ? 0 : L - re.intoField
    el(
      'rect',
      {
        x,
        y: W - re.alongGoalLine,
        width: re.intoField,
        height: re.alongGoalLine,
        fill: 'rgba(234,58,54,0.16)',
        stroke: LINE.red,
        'stroke-width': 0.05,
        'stroke-dasharray': '0.18 0.12',
      },
      g,
    )
  }

  // doelgebied (regel 1.7): gestippelde rechthoek, 2 m naast elke paal tot de 2 m-lijn;
  // de grenslijnen zijn officieel rood gemarkeerd
  const ga = RULES.goalArea
  const gaLo = Math.max(0, W / 2 - RULES.goal.width / 2 - ga.besidePost)
  const gaHi = Math.min(W, W / 2 + RULES.goal.width / 2 + ga.besidePost)
  for (const side of [0, 1]) {
    const gx = side === 0 ? 0 : L
    const fx = side === 0 ? ga.depth : L - ga.depth
    el(
      'path',
      {
        d: `M${gx} ${gaLo} L${fx} ${gaLo} L${fx} ${gaHi} L${gx} ${gaHi}`,
        fill: 'none',
        stroke: LINE.red,
        'stroke-width': 0.08,
        'stroke-dasharray': '0.24 0.18',
        opacity: 0.95,
      },
      g,
    )
  }

  // doelen
  const gw = RULES.goal.width
  const nd = RULES.goal.netDepth
  const lo = W / 2 - gw / 2
  const hi = W / 2 + gw / 2
  for (const side of [0, 1]) {
    const gx = side === 0 ? 0 : L
    const back = side === 0 ? -nd : L + nd
    el('rect', { x: Math.min(gx, back), y: lo, width: nd, height: gw, fill: 'url(#net)' }, g)
    el(
      'path',
      { d: `M${gx} ${lo} L${back} ${lo + 0.12} L${back} ${hi - 0.12} L${gx} ${hi}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.05, opacity: 0.8 },
      g,
    )
    el('line', { x1: gx, y1: lo, x2: gx, y2: hi, stroke: '#ffffff', 'stroke-width': 0.14, 'stroke-linecap': 'round' }, g)
    for (const y of [lo, hi]) el('circle', { cx: gx, cy: y, r: 0.13, fill: '#ffffff', stroke: '#9fb3c4', 'stroke-width': 0.03 }, g)
  }

  // jurytafel aan de overkant (y < 0)
  const tw = Math.min(6, L * 0.24)
  el('rect', { x: tableX - tw / 2, y: -2.1, width: tw, height: 0.95, rx: 0.12, fill: theme.table }, g)
  const tt = el('g', { transform: `translate(${tableX} ${-1.62}) ${textFix}` }, g)
  el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#ffffff', 'font-family': FONT_UI, 'font-size': 0.46, 'font-weight': 700, 'letter-spacing': 0.08 }, tt).textContent =
    'JURYTAFEL'
}
