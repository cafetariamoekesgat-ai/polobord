import { useSignal } from '@preact/signals'
import { Pause, Play, Plus, Repeat, SkipBack, SkipForward } from 'lucide'
import { addStep, clearSteps, deleteStep, doc, getEngine, gotoStep, playback, version } from '../store'
import { Icon, type IconNode } from './Icon'

const SPEEDS = [0.5, 1, 1.5, 2]

export function Timeline({ compact = false }: { compact?: boolean }) {
  version.value
  const b = doc.board
  const n = b.steps.length
  const pb = playback.value
  const confirmClear = useSignal(false)
  const eng = getEngine()

  const toggle = () => (pb.playing ? eng?.stop() : eng?.play())

  if (compact) {
    if (n < 2) return null
    return (
      <div class="pres-steps">
        <button class="round-btn" onClick={() => gotoStep(b.currentStep - 1)} aria-label="Vorige stap">
          <Icon icon={SkipBack as IconNode} />
        </button>
        <button class="round-btn primary" onClick={toggle} aria-label={pb.playing ? 'Pauze' : 'Afspelen'}>
          <Icon icon={(pb.playing ? Pause : Play) as IconNode} />
        </button>
        <button class="round-btn" onClick={() => gotoStep(b.currentStep + 1)} aria-label="Volgende stap">
          <Icon icon={SkipForward as IconNode} />
        </button>
        <span class="pres-step-label">
          {Math.min(n, Math.round(pb.playing ? pb.t : b.currentStep) + 1)} / {n}
        </span>
      </div>
    )
  }

  return (
    <div class="timeline">
      <button class="tl-add" onClick={addStep}>
        <Icon icon={Plus as IconNode} size={22} />
        <span>Stap</span>
      </button>
      {n === 0 ? (
        <p class="tl-hint">
          Zet de spelers neer en tik <b>+ Stap</b>. Teken zwemlijnen vanaf een speler en passes vanaf de balbezitter: bij de volgende stap zwemmen ze die route.
        </p>
      ) : (
        <>
          <div class="tl-steps">
            {b.steps.map((_, i) => (
              <button
                key={i}
                class={`tl-step${i === b.currentStep && !pb.playing ? ' on' : ''}${pb.playing && Math.round(pb.t) === i ? ' playing' : ''}`}
                onClick={() => gotoStep(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button class="round-btn primary" onClick={toggle} disabled={n < 2} aria-label={pb.playing ? 'Pauze' : 'Afspelen'}>
            <Icon icon={(pb.playing ? Pause : Play) as IconNode} />
          </button>
          <input
            class="tl-scrub"
            type="range"
            min={0}
            max={Math.max(1, n - 1)}
            step={0.01}
            value={pb.playing || pb.scrubbing ? pb.t : b.currentStep}
            disabled={n < 2}
            aria-label="Tijdlijn"
            onPointerDown={() => {
              eng?.stop()
              playback.value = { ...playback.value, scrubbing: true, t: b.currentStep }
            }}
            onInput={(e) => eng?.seek(parseFloat((e.target as HTMLInputElement).value))}
            onChange={(e) => {
              const t = parseFloat((e.target as HTMLInputElement).value)
              playback.value = { ...playback.value, scrubbing: false, t }
              gotoStep(Math.round(t))
            }}
          />
          <button
            class="chip small"
            onClick={() => {
              const i = SPEEDS.indexOf(pb.speed)
              playback.value = { ...pb, speed: SPEEDS[(i + 1) % SPEEDS.length] }
            }}
            aria-label="Snelheid"
          >
            {String(pb.speed).replace('.', ',')}×
          </button>
          <button class={`round-btn small${pb.loop ? ' on' : ''}`} onClick={() => (playback.value = { ...pb, loop: !pb.loop })} aria-label="Herhalen" aria-pressed={pb.loop}>
            <Icon icon={Repeat as IconNode} size={20} />
          </button>
          <button class="chip small" onClick={() => deleteStep(b.currentStep)} disabled={pb.playing}>
            Wis stap
          </button>
          <button
            class={`chip small${confirmClear.value ? ' danger' : ''}`}
            onClick={() => {
              if (!confirmClear.value) {
                confirmClear.value = true
                setTimeout(() => (confirmClear.value = false), 3000)
                return
              }
              confirmClear.value = false
              clearSteps()
            }}
          >
            {confirmClear.value ? 'Zeker?' : 'Wis alle'}
          </button>
        </>
      )}
    </div>
  )
}
