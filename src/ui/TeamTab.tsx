import { useSignal } from '@preact/signals'
import { newId } from '../formations'
import { RULES } from '../rules'
import { deleteSquad, saveSquad, settings, setTeamSquad, squads, teamSquad, updateSettings } from '../store'
import type { Squad, Team } from '../types'
import { Section, Toggle } from './controls'

const CAP_COLORS: Record<Team, { label: string; value: string }[]> = {
  white: [
    { label: 'Wit', value: '#f3f5f7' },
    { label: 'Geel', value: '#ffd84a' },
    { label: 'Lichtblauw', value: '#9fd3ff' },
    { label: 'Oranje', value: '#ff9f3a' },
  ],
  blue: [
    { label: 'Blauw', value: '#173a86' },
    { label: 'Zwart', value: '#1b1f24' },
    { label: 'Groen', value: '#12704a' },
    { label: 'Paars', value: '#5b2b8c' },
    { label: 'Donkerrood', value: '#7c1c24' },
  ],
}

function emptySquad(): Squad {
  const players = Array.from({ length: RULES.players.squad }, (_, i) => ({ num: i + 1, name: '' }))
  return { id: newId('sq'), name: 'Nieuwe selectie', players }
}

export function TeamTab() {
  const s = settings.value
  const editing = useSignal<Squad | null>(null)
  const map = teamSquad.value

  if (editing.value) return <SquadEditor squad={editing.value} onClose={() => (editing.value = null)} />

  return (
    <div>
      <Section title="Namen">
        <Toggle label="Namen onder de caps" checked={s.showNames} onChange={(v) => updateSettings({ showNames: v })} />
      </Section>

      <Section title="Selecties" hint="14 spelers met nummer en naam, bijvoorbeeld Heren 1 of Jeugd O16. Koppel ze aan wit of blauw.">
        {(['white', 'blue'] as Team[]).map((team) => (
          <div key={team} class="row-label">
            <span>{team === 'white' ? 'Wit' : 'Blauw'}</span>
            <select
              class="select"
              value={map[team] ?? ''}
              onChange={(e) => setTeamSquad({ ...map, [team]: (e.target as HTMLSelectElement).value || null })}
            >
              <option value="">— geen —</option>
              {squads.value.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div class="lib-group">
          {squads.value.map((q) => (
            <div key={q.id} class="lib-row">
              <button class="lib-name" onClick={() => (editing.value = JSON.parse(JSON.stringify(q)))}>
                <span>{q.name}</span>
                <small>{q.players.filter((p) => p.name).length} namen</small>
              </button>
            </div>
          ))}
        </div>
        <button class="big-btn wide" onClick={() => (editing.value = emptySquad())}>
          + Nieuwe selectie
        </button>
      </Section>

      <Section title="Capkleuren" hint="Keepers dragen altijd rood, met een rand in de teamkleur.">
        {(['white', 'blue'] as Team[]).map((team) => (
          <div key={team} class="row-label">
            <span>{team === 'white' ? 'Lichte caps' : 'Donkere caps'}</span>
            <div class="swatches">
              {CAP_COLORS[team].map((c) => (
                <button
                  key={c.value}
                  class={`swatch-btn${s.teamColors[team] === c.value ? ' active' : ''}`}
                  style={{ background: c.value }}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => updateSettings({ teamColors: { ...s.teamColors, [team]: c.value } })}
                />
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}

function SquadEditor({ squad, onClose }: { squad: Squad; onClose: () => void }) {
  const q = useSignal(squad)
  const confirm = useSignal(false)
  const exists = squads.value.some((x) => x.id === squad.id)
  const set = (patch: Partial<Squad>) => (q.value = { ...q.value, ...patch })
  return (
    <div>
      <Section title="Selectie bewerken">
        <input class="text" value={q.value.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} placeholder="Naam, bijv. Heren 1" />
        <div class="squad-list">
          {q.value.players.map((p, i) => (
            <div key={i} class="squad-row">
              <input
                class="text num"
                inputMode="numeric"
                value={p.num}
                onInput={(e) => {
                  const players = q.value.players.slice()
                  players[i] = { ...p, num: parseInt((e.target as HTMLInputElement).value) || 0 }
                  set({ players })
                }}
              />
              <input
                class="text"
                value={p.name}
                placeholder={(RULES.players.keeperNumbers as readonly number[]).includes(p.num) ? 'keeper' : 'naam'}
                onInput={(e) => {
                  const players = q.value.players.slice()
                  players[i] = { ...p, name: (e.target as HTMLInputElement).value }
                  set({ players })
                }}
              />
            </div>
          ))}
        </div>
        <div class="btn-grid">
          <button
            class="big-btn primary"
            onClick={async () => {
              await saveSquad({ ...q.value, name: q.value.name.trim() || 'Selectie' })
              onClose()
            }}
          >
            Bewaren
          </button>
          <button class="big-btn" onClick={onClose}>
            Annuleren
          </button>
        </div>
        {exists && (
          <button
            class={`chip wide${confirm.value ? ' danger' : ' danger-soft'}`}
            onClick={async () => {
              if (!confirm.value) {
                confirm.value = true
                return
              }
              await deleteSquad(squad.id)
              onClose()
            }}
          >
            {confirm.value ? 'Tik nogmaals om te verwijderen' : 'Selectie verwijderen'}
          </button>
        )}
      </Section>
    </div>
  )
}
