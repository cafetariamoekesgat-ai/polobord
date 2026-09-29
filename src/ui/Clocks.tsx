/**
 * Schotklok (28/18) en periodeklok met time-out-teller, bedienbaar met één
 * duim. Tik op een groot getal = start/stop. Piep bij 5 s en bij 0.
 */
import { signal, useSignal } from '@preact/signals'
import { X } from 'lucide'
import { useEffect } from 'preact/hooks'
import { beep } from '../audio'
import { RULES } from '../rules'
import { clocksOpen, settings } from '../store'
import { Icon, type IconNode } from './Icon'

interface Countdown {
  /** resterend in ms op het moment van `since` */
  left: number
  running: boolean
  since: number
}

const now = () => performance.now()
const remaining = (c: Countdown) => Math.max(0, c.running ? c.left - (now() - c.since) : c.left)

// klokstand buiten de component, zodat hij doorloopt als je het paneel sluit
const shot = signal<Countdown>({ left: RULES.shotClock.full * 1000, running: false, since: 0 })
const period = signal<Countdown>({ left: RULES.periods.minutes * 60000, running: false, since: 0 })
const periodNo = signal(1)
const timeouts = signal({ white: 0, blue: 0 })
const tickSig = signal(0)
let warned = { shot5: false, shot0: false, per5: false, per0: false }
let looping = false

function loop() {
  const s = remaining(shot.value)
  const p = remaining(period.value)
  if (shot.value.running) {
    if (s <= 5000 && !warned.shot5) {
      warned.shot5 = true
      beep('warn')
    }
    if (s <= 0 && !warned.shot0) {
      warned.shot0 = true
      beep('end')
      shot.value = { left: 0, running: false, since: now() }
    }
  }
  if (period.value.running) {
    if (p <= 5000 && !warned.per5) {
      warned.per5 = true
      beep('warn')
    }
    if (p <= 0 && !warned.per0) {
      warned.per0 = true
      beep('end')
      period.value = { left: 0, running: false, since: now() }
      shot.value = { ...shot.value, left: remaining(shot.value), running: false, since: now() }
    }
  }
  tickSig.value = (tickSig.value + 1) % 1e6
  if (shot.value.running || period.value.running) requestAnimationFrame(loop)
  else looping = false
}

function startLoop() {
  if (looping) return
  looping = true
  requestAnimationFrame(loop)
}

function toggle(sig: typeof shot) {
  const c = sig.value
  sig.value = c.running ? { left: remaining(c), running: false, since: now() } : { left: c.left, running: true, since: now() }
  startLoop()
}

function resetShot(sec: number) {
  const running = shot.value.running
  shot.value = { left: sec * 1000, running, since: now() }
  warned.shot5 = sec <= 5
  warned.shot0 = false
  tickSig.value++
  startLoop()
}

const fmtShot = (ms: number) => (ms >= 5000 ? String(Math.ceil(ms / 1000)) : (Math.ceil(ms / 100) / 10).toFixed(1).replace('.', ','))
const fmtClock = (ms: number) => {
  if (ms < 60000 && ms > 0) return `${Math.floor(ms / 1000)},${Math.floor((ms % 1000) / 100)}`
  const t = Math.ceil(ms / 1000)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export function Clocks() {
  tickSig.value
  const s = settings.value
  const compact = useSignal(false)
  useEffect(() => {
    // bij gewijzigde instellingen: stilstaande, nog niet gebruikte klokken meenemen
    if (!period.value.running && !period.value.since) period.value = { ...period.value, left: s.periodMinutes * 60000 }
    if (!shot.value.running && !shot.value.since) shot.value = { ...shot.value, left: s.shotClockFull * 1000 }
  }, [s.periodMinutes, s.shotClockFull])

  const sr = remaining(shot.value)
  const pr = remaining(period.value)
  const to = timeouts.value

  return (
    <div class={`clocks${compact.value ? ' compact' : ''}`} role="region" aria-label="Klokken">
      <div class="clk-head">
        <button class="chip small" onClick={() => (compact.value = !compact.value)}>
          {compact.value ? 'Groter' : 'Kleiner'}
        </button>
        <button class="icon-btn" onClick={() => (clocksOpen.value = false)} aria-label="Klokken sluiten">
          <Icon icon={X as IconNode} size={20} />
        </button>
      </div>

      <button class={`clk-shot${sr <= 5000 ? ' low' : ''}${shot.value.running ? ' running' : ''}`} onClick={() => toggle(shot)} aria-label="Schotklok starten of stoppen">
        <span class="clk-label">schotklok {shot.value.running ? '' : '· tik om te starten'}</span>
        <span class="clk-big">{fmtShot(sr)}</span>
      </button>
      <div class="clk-row">
        <button class="big-btn primary" onClick={() => resetShot(s.shotClockFull)}>
          {s.shotClockFull}
        </button>
        <button class="big-btn" onClick={() => resetShot(s.shotClockReset)}>
          {s.shotClockReset}
        </button>
      </div>

      <button class={`clk-period${period.value.running ? ' running' : ''}`} onClick={() => toggle(period)} aria-label="Periodeklok starten of stoppen">
        <span class="clk-label">
          periode {periodNo.value}/{s.periods}
        </span>
        <span class="clk-mid">{fmtClock(pr)}</span>
      </button>
      <div class="clk-row">
        <button
          class="chip small"
          onClick={() => {
            periodNo.value = periodNo.value >= s.periods ? 1 : periodNo.value + 1
            period.value = { left: s.periodMinutes * 60000, running: false, since: now() }
            shot.value = { left: s.shotClockFull * 1000, running: false, since: now() }
            warned = { shot5: false, shot0: false, per5: false, per0: false }
            if (periodNo.value === 1) timeouts.value = { white: 0, blue: 0 }
          }}
        >
          Volgende periode
        </button>
        <button
          class="chip small"
          onClick={() => {
            period.value = { left: s.periodMinutes * 60000, running: false, since: now() }
            warned.per5 = warned.per0 = false
          }}
        >
          Reset
        </button>
      </div>

      <div class="clk-to">
        {(['white', 'blue'] as const).map((t) => (
          <button
            key={t}
            class={`to-btn ${t}`}
            onClick={() => {
              const used = to[t]
              timeouts.value = { ...to, [t]: used >= s.timeouts ? 0 : used + 1 }
            }}
            aria-label={`Time-out ${t === 'white' ? 'wit' : 'blauw'}`}
          >
            <span>Time-out {t === 'white' ? 'wit' : 'blauw'}</span>
            <span class="dots">
              {Array.from({ length: s.timeouts }, (_, i) => (
                <i key={i} class={i < to[t] ? 'used' : ''} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
