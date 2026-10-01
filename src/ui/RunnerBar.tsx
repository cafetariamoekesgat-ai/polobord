import { Pause, Play, SkipBack, SkipForward, X } from 'lucide'
import { gotoItem, itemLabel, remainingMs, runner, runnerSession, runnerTick, stopRunner, togglePause } from '../planner'
import { Icon, type IconNode } from './Icon'

const fmt = (ms: number) => {
  const t = Math.ceil(ms / 1000)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** Loopt mee tijdens een training: onderdeel, resterende tijd, vorige/volgende. */
export function RunnerBar() {
  runnerTick.value
  const r = runner.value
  const s = runnerSession()
  if (!r || !s) return null
  const it = s.items[r.index]
  const left = remainingMs()
  const done = left <= 0
  const next = s.items[r.index + 1]
  return (
    <div class={`runner${done ? ' done' : ''}`} role="region" aria-label="Training">
      <div class="runner-info">
        <small>
          {s.name} · {r.index + 1}/{s.items.length}
        </small>
        <strong>{it ? itemLabel(it) : ''}</strong>
        {next && <small>daarna: {itemLabel(next)}</small>}
      </div>
      <span class="runner-time">{done ? 'tijd!' : fmt(left)}</span>
      <div class="runner-btns">
        <button class="round-btn small" onClick={() => gotoItem(-1)} disabled={r.index === 0} aria-label="Vorig onderdeel">
          <Icon icon={SkipBack as IconNode} size={20} />
        </button>
        <button class="round-btn small" onClick={togglePause} aria-label={r.endsAt ? 'Pauze' : 'Verder'}>
          <Icon icon={(r.endsAt ? Pause : Play) as IconNode} size={20} />
        </button>
        <button class={`round-btn small${done ? ' primary' : ''}`} onClick={() => gotoItem(1)} aria-label="Volgend onderdeel">
          <Icon icon={SkipForward as IconNode} size={20} />
        </button>
        <button class="round-btn small" onClick={stopRunner} aria-label="Training stoppen">
          <Icon icon={X as IconNode} size={20} />
        </button>
      </div>
    </div>
  )
}
