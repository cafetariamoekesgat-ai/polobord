/**
 * Piepjes voor de klokken. iOS laat pas geluid toe na een aanraking; de eerste
 * tik op het bord of een knop ontgrendelt de AudioContext.
 */
let ctx: AudioContext | null = null

function ensure(): AudioContext | null {
  if (ctx) return ctx
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  return ctx
}

export function unlock() {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  // stil tikje zodat iOS de uitvoer echt openzet
  const o = c.createOscillator()
  const g = c.createGain()
  g.gain.value = 0
  o.connect(g).connect(c.destination)
  o.start()
  o.stop(c.currentTime + 0.01)
}

window.addEventListener('polobord:user-gesture', unlock)
document.addEventListener('pointerdown', unlock, { once: true, capture: true })

export function beep(kind: 'warn' | 'end') {
  const c = ensure()
  if (!c) return
  const now = c.currentTime
  const tones = kind === 'warn' ? [[880, 0, 0.12]] : [[660, 0, 0.35], [520, 0.38, 0.6]]
  for (const [f, start, dur] of tones) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = kind === 'end' ? 'square' : 'sine'
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, now + start)
    g.gain.exponentialRampToValueAtTime(kind === 'end' ? 0.35 : 0.5, now + start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
    o.connect(g).connect(c.destination)
    o.start(now + start)
    o.stop(now + start + dur + 0.05)
  }
  navigator.vibrate?.(kind === 'end' ? [120, 60, 120] : 40)
}
