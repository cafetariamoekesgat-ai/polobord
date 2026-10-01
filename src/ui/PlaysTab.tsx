import { useSignal } from '@preact/signals'
import { useRef } from 'preact/hooks'
import { shareCurrentBoard, sharePlay } from '../incoming'
import { currentPlay, deletePlay, exportJson, getEngine, importJson, loadPlay, plays, renamePlay, savePlay, showToast } from '../store'
import { PLAY_CATEGORIES } from '../types'
import { Section } from './controls'

export function PlaysTab() {
  const cur = currentPlay.value
  const name = useSignal(cur?.name ?? '')
  const category = useSignal<string>(cur?.category ?? 'Aanval')
  const editing = useSignal<string | null>(null)
  const confirmDelete = useSignal<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = useSignal(false)

  const grouped = PLAY_CATEGORIES.map((c) => ({
    c,
    items: plays.value.filter((p) => p.category === c).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length)
  const other = plays.value.filter((p) => !(PLAY_CATEGORIES as readonly string[]).includes(p.category))
  if (other.length) grouped.push({ c: 'Overig' as (typeof PLAY_CATEGORIES)[number], items: other })

  return (
    <div>
      <Section title={cur ? `Open: ${cur.name}` : 'Opslaan'}>
        <input class="text" placeholder="Naam van de play" value={name.value} onInput={(e) => (name.value = (e.target as HTMLInputElement).value)} />
        <div class="cat-row">
          {PLAY_CATEGORIES.map((c) => (
            <button key={c} class={`chip small${category.value === c ? ' on' : ''}`} onClick={() => (category.value = c)}>
              {c}
            </button>
          ))}
        </div>
        <div class="btn-grid">
          <button class="big-btn primary" onClick={() => savePlay(name.value || cur?.name || 'Naamloos', category.value, false)}>
            {cur ? 'Opslaan' : 'Opslaan in bibliotheek'}
          </button>
          {cur && (
            <button class="big-btn" onClick={() => savePlay(name.value || `${cur.name} (kopie)`, category.value, true)}>
              Opslaan als nieuw
            </button>
          )}
        </div>
      </Section>

      <Section title="Bibliotheek" hint={plays.value.length ? undefined : 'Nog niets opgeslagen. Plays blijven bewaard op dit apparaat, ook zonder internet.'}>
        {grouped.map((g) => (
          <div key={g.c} class="lib-group">
            <h4>{g.c}</h4>
            {g.items.map((p) =>
              editing.value === p.id ? (
                <RenameRow
                  key={p.id}
                  name={p.name}
                  category={p.category}
                  onDone={(n, c) => {
                    renamePlay(p.id, n, c)
                    editing.value = null
                  }}
                  onCancel={() => (editing.value = null)}
                />
              ) : (
                <div key={p.id} class={`lib-row${cur?.id === p.id ? ' current' : ''}`}>
                  <button
                    class="lib-name"
                    onClick={() => {
                      loadPlay(p.id)
                      name.value = p.name
                      category.value = p.category
                    }}
                  >
                    <span>{p.name}</span>
                    <small>{p.board.steps.length ? `${p.board.steps.length} stappen` : 'plaatje'}</small>
                  </button>
                  <button class="icon-btn" onClick={() => sharePlay(p.board, p.name, p.category)} aria-label="Delen als link" title="Delen als link">
                    ↗
                  </button>
                  <button class="icon-btn" onClick={() => (editing.value = p.id)} aria-label="Hernoemen">
                    ✎
                  </button>
                  <button
                    class={`icon-btn${confirmDelete.value === p.id ? ' danger' : ''}`}
                    onClick={() => {
                      if (confirmDelete.value === p.id) {
                        deletePlay(p.id)
                        confirmDelete.value = null
                      } else {
                        confirmDelete.value = p.id
                        setTimeout(() => {
                          if (confirmDelete.value === p.id) confirmDelete.value = null
                        }, 3000)
                      }
                    }}
                    aria-label="Verwijderen"
                  >
                    {confirmDelete.value === p.id ? 'Zeker?' : '🗑'}
                  </button>
                </div>
              ),
            )}
          </div>
        ))}
      </Section>

      <Section title="Delen en bewaren" hint="Een link bevat de hele play, met stappen. Spelers openen hem op hun telefoon en zien hem meteen afspelen; ze hebben niets te installeren.">
        <button class="big-btn wide primary" onClick={() => shareCurrentBoard()}>
          Deel dit bord als link
        </button>
        <div class="btn-grid">
          <button
            class="big-btn"
            disabled={busy.value}
            onClick={async () => {
              busy.value = true
              try {
                await getEngine()?.exportPng()
              } catch (e) {
                showToast('Afbeelding maken lukte niet.')
                console.error(e)
              } finally {
                busy.value = false
              }
            }}
          >
            Afbeelding (PNG)
          </button>
          <button class="big-btn" onClick={() => exportJson()}>
            Exporteer alles (JSON)
          </button>
          <button class="big-btn" onClick={() => fileRef.current?.click()}>
            Importeer JSON
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) importJson(f)
            ;(e.target as HTMLInputElement).value = ''
          }}
        />
      </Section>
    </div>
  )
}

function RenameRow({ name, category, onDone, onCancel }: { name: string; category: string; onDone: (n: string, c: string) => void; onCancel: () => void }) {
  const n = useSignal(name)
  const c = useSignal(category)
  return (
    <div class="rename">
      <input class="text" value={n.value} onInput={(e) => (n.value = (e.target as HTMLInputElement).value)} />
      <div class="cat-row">
        {PLAY_CATEGORIES.map((x) => (
          <button key={x} class={`chip small${c.value === x ? ' on' : ''}`} onClick={() => (c.value = x)}>
            {x}
          </button>
        ))}
      </div>
      <div class="btn-grid">
        <button class="big-btn primary" onClick={() => onDone(n.value.trim() || name, c.value)}>
          Bewaren
        </button>
        <button class="big-btn" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </div>
  )
}
