/**
 * Rustig lichtspel in het water (caustics). Eén keer een naadloze textuur
 * rekenen (Worley-ruis: F2 − F1 geeft de lichtlijnen) en die met CSS-transforms
 * laten drijven — dat draait op de GPU en kost tijdens het slepen niets.
 */
let cached: string | null = null

export function causticsTexture(size = 256, cells = 22, seed = 7): string {
  if (cached) return cached
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const pts: [number, number][] = []
  for (let i = 0; i < cells; i++) pts.push([rnd(), rnd()])
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const w = y / size
      let f1 = 9
      let f2 = 9
      for (const [px, py] of pts) {
        let dx = Math.abs(u - px)
        let dy = Math.abs(w - py)
        if (dx > 0.5) dx = 1 - dx
        if (dy > 0.5) dy = 1 - dy
        const d = dx * dx + dy * dy
        if (d < f1) {
          f2 = f1
          f1 = d
        } else if (d < f2) f2 = d
      }
      const edge = Math.sqrt(f2) - Math.sqrt(f1)
      const a = Math.exp(-edge / 0.02)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(Math.pow(a, 1.3) * 200)
    }
  }
  ctx.putImageData(img, 0, 0)
  cached = canvas.toDataURL('image/png')
  return cached
}

export function buildCaustics(host: HTMLElement): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'water-layer'
  const url = causticsTexture()
  for (const cls of ['caustic caustic-a', 'caustic caustic-b']) {
    const d = document.createElement('div')
    d.className = cls
    d.style.backgroundImage = `url(${url})`
    wrap.appendChild(d)
  }
  host.appendChild(wrap)
  return wrap
}
