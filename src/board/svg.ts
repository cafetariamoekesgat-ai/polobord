export const SVGNS = 'http://www.w3.org/2000/svg'

type Attrs = Record<string, string | number | undefined | null>

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag)
  for (const [k, val] of Object.entries(attrs)) if (val != null) e.setAttribute(k, String(val))
  if (parent) parent.appendChild(e)
  return e
}

export function setAttrs(e: Element, attrs: Attrs) {
  for (const [k, val] of Object.entries(attrs)) {
    if (val == null) e.removeAttribute(k)
    else e.setAttribute(k, String(val))
  }
}

export const f2 = (n: number) => Math.round(n * 1000) / 1000

/** Donkerder/lichter maken van een hex-kleur (amount -1..1). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const t = amount < 0 ? 0 : 255
  const p = Math.abs(amount)
  r = Math.round((t - r) * p + r)
  g = Math.round((t - g) * p + g)
  b = Math.round((t - b) * p + b)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export const FONT_NUM = "'Barlow Condensed', 'Barlow', system-ui, -apple-system, sans-serif"
export const FONT_UI = "'Barlow', system-ui, -apple-system, sans-serif"
