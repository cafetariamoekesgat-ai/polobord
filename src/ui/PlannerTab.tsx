import { useSignal } from '@preact/signals'
import { deleteSession, itemLabel, newItem, newSession, runner, startSession, totalMinutes, upsertSession } from '../planner'
import { plays, sessions } from '../store'
import { BUILTINS } from '../training'
import type { Session } from '../types'
import { Section, Stepper } from './controls'

export function PlannerTab() {
  const editing = useSignal<Session | null>(null)
  if (editing.value) return <SessionEditor session={editing.value} onClose={() => (editing.value = null)} />

  const list = sessions.value.slice().sort((a, b) => b.updated - a.updated)
  return (
    <div>
      <Section title="Trainingen" hint="Stel een training samen uit plays en oefeningen, elk met een duur. Aan de badrand loop je erdoorheen met een timer per onderdeel.">
        {list.map((s) => (
          <div key={s.id} class={`lib-row${runner.value?.sessionId === s.id ? ' current' : ''}`}>
            <button class="lib-name" onClick={() => (editing.value = JSON.parse(JSON.stringify(s)))}>
              <span>{s.name}</span>
              <small>
                {s.items.length} onderdelen · {totalMinutes(s)} min
              </small>
            </button>
            <button class="icon-btn" onClick={() => startSession(s.id)} aria-label={`Start ${s.name}`} disabled={!s.items.length}>
              ▶
            </button>
          </div>
        ))}
        <button class="big-btn wide primary" onClick={() => (editing.value = newSession())}>
          + Nieuwe training
        </button>
      </Section>
    </div>
  )
}

function SessionEditor({ session, onClose }: { session: Session; onClose: () => void }) {
  const s = useSignal(session)
  const pickPlay = useSignal('')
  const pickBuiltin = useSignal('')
  const confirmDelete = useSignal(false)
  const exists = sessions.value.some((x) => x.id === session.id)
  const set = (patch: Partial<Session>) => (s.value = { ...s.value, ...patch })
  const items = s.value.items
  const move = (i: number, d: number) => {
    const next = items.slice()
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ items: next })
  }
  const groups = [...new Set(BUILTINS.map((b) => b.group))]

  return (
    <div>
      <Section title="Training bewerken">
        <input class="text" value={s.value.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} placeholder="Naam, bijv. Dinsdag 6-5 en overtal" />
        <p class="hint">Totaal {totalMinutes(s.value)} minuten</p>
        <div class="plan-list">
          {items.map((it, i) => (
            <div key={it.id} class="plan-item">
              <div class="plan-head">
                <span class="plan-no">{i + 1}</span>
                <strong>{itemLabel(it)}</strong>
              </div>
              <div class="plan-controls">
                <Stepper
                  value={it.minutes}
                  min={1}
                  max={45}
                  unit="min"
                  onChange={(m) => set({ items: items.map((x) => (x.id === it.id ? { ...x, minutes: m } : x)) })}
                />
                <button class="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Omhoog">
                  ↑
                </button>
                <button class="icon-btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Omlaag">
                  ↓
                </button>
                <button class="icon-btn" onClick={() => set({ items: items.filter((x) => x.id !== it.id) })} aria-label="Weghalen">
                  ✕
                </button>
              </div>
              <input
                class="text"
                value={it.note ?? ''}
                placeholder="Coachpunt (verschijnt bij de start)"
                onInput={(e) => set({ items: items.map((x) => (x.id === it.id ? { ...x, note: (e.target as HTMLInputElement).value || undefined } : x)) })}
              />
            </div>
          ))}
        </div>

        <h4>Onderdeel toevoegen</h4>
        <div class="add-row">
          <select
            class="select grow"
            value={pickPlay.value}
            onInput={(e) => (pickPlay.value = (e.target as HTMLSelectElement).value)}
            onChange={(e) => (pickPlay.value = (e.target as HTMLSelectElement).value)}
          >
            <option value="">Play uit de bibliotheek…</option>
            {plays.value
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.category} · {p.name}
                </option>
              ))}
          </select>
          <button
            class="chip"
            disabled={!pickPlay.value}
            onClick={() => {
              set({ items: [...items, newItem(`play:${pickPlay.value}`)] })
              pickPlay.value = ''
            }}
          >
            +
          </button>
        </div>
        <div class="add-row">
          <select
            class="select grow"
            value={pickBuiltin.value}
            onInput={(e) => (pickBuiltin.value = (e.target as HTMLSelectElement).value)}
            onChange={(e) => (pickBuiltin.value = (e.target as HTMLSelectElement).value)}
          >
            <option value="">Ingebouwde oefening…</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {BUILTINS.filter((b) => b.group === g).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            class="chip"
            disabled={!pickBuiltin.value}
            onClick={() => {
              set({ items: [...items, newItem(`builtin:${pickBuiltin.value}`)] })
              pickBuiltin.value = ''
            }}
          >
            +
          </button>
        </div>

        <div class="btn-grid">
          <button
            class="big-btn primary"
            onClick={() => {
              upsertSession({ ...s.value, name: s.value.name.trim() || 'Training' })
              onClose()
            }}
          >
            Bewaren
          </button>
          <button class="big-btn" onClick={onClose}>
            Annuleren
          </button>
        </div>
        <button
          class="big-btn wide"
          disabled={!items.length}
          onClick={() => {
            upsertSession({ ...s.value, name: s.value.name.trim() || 'Training' })
            startSession(s.value.id)
            onClose()
          }}
        >
          Bewaren en starten
        </button>
        {exists && (
          <button
            class={`chip wide${confirmDelete.value ? ' danger' : ' danger-soft'}`}
            onClick={() => {
              if (!confirmDelete.value) {
                confirmDelete.value = true
                return
              }
              deleteSession(session.id)
              onClose()
            }}
          >
            {confirmDelete.value ? 'Tik nogmaals om te verwijderen' : 'Training verwijderen'}
          </button>
        )}
      </Section>
    </div>
  )
}
