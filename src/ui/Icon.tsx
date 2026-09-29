import { h } from 'preact'

export type IconNode = [string, Record<string, string | number | undefined>][]

export function Icon({ icon, size = 26, stroke = 2 }: { icon: IconNode; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {icon.map(([tag, attrs], i) => h(tag, { key: i, ...attrs }))}
    </svg>
  )
}

/** Eigen iconen voor de lijnsoorten. */
export const LineIcons: Record<string, IconNode> = {
  swim: [
    ['path', { d: 'M3 17 C7 17 7 8 12 8 S16 12 20 7' }],
    ['path', { d: 'M16 6.5 L20.5 6.8 L19.4 11' }],
  ],
  pass: [
    ['path', { d: 'M3 18 L17 7', 'stroke-dasharray': '3 3' }],
    ['path', { d: 'M13 6 L18.5 6.2 L18 11.5' }],
  ],
  shot: [
    ['path', { d: 'M3 19 L16 8', 'stroke-width': 3.6 }],
    ['path', { d: 'M12 5.5 L19.5 5 L18.5 12.5 Z', fill: 'currentColor' }],
  ],
  screen: [
    ['path', { d: 'M4 19 L15 8' }],
    ['path', { d: 'M11 4.5 L19 12.5', 'stroke-width': 3 }],
  ],
  free: [
    ['path', { d: 'M4 18 C6 12 9 20 12 14 S17 8 20 11' }],
    ['circle', { cx: 20, cy: 11, r: 1.2, fill: 'currentColor' }],
  ],
}
