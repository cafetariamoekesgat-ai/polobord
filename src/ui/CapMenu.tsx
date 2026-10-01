import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { addQuestionFromBoard } from '../playerQuiz'
import {
  capMenu,
  doc,
  excludePiece,
  giveBall,
  isExcluded,
  pieceById,
  removePiece,
  returnPiece,
  squads,
  teamSquad,
  updatePiece,
  version,
} from '../store'
import type { Role } from '../types'

const ROLES: { value: Role; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'wing', label: 'Vleugel' },
  { value: 'point', label: 'Point' },
  { value: 'driver', label: 'Driver' },
  { value: 'flat', label: 'Flat' },
  { value: 'keeper', label: 'Keeper' },
]

export function CapMenu() {
  version.value
  const m = capMenu.value
  const ref = useRef<HTMLDivElement>(null)
  const pos = useSignal({ left: 0, top: 0 })
  const confirmDelete = useSignal(false)

  useEffect(() => {
    confirmDelete.value = false
    if (!m || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = m.x + 24
    if (left + r.width > vw - 12) left = m.x - r.width - 24
    left = Math.max(12, Math.min(vw - r.width - 12, left))
    const top = Math.max(12, Math.min(vh - r.height - 12, m.y - r.height / 2))
    pos.value = { left, top }
  }, [m?.id, m?.x, m?.y])

  if (!m) return null
  const p = pieceById(m.id)
  if (!p) return null
  const close = () => (capMenu.value = null)
  const used = new Set(doc.board.pieces.filter((q) => q.team === p.team && q.id !== p.id).map((q) => q.num))
  const squad = squads.value.find((s) => s.id === teamSquad.value[p.team])
  const excluded = isExcluded(p)

  return (
    <div class="cap-menu" ref={ref} style={{ left: `${pos.value.left}px`, top: `${pos.value.top}px` }} role="dialog" aria-label="Cap bewerken">
      <header>
        <span class={`cap-dot ${p.keeper ? 'keeper' : p.team}`}>{p.num}</span>
        <strong>
          {p.team === 'white' ? 'Wit' : 'Blauw'} {p.num}
          {p.name ? ` · ${p.name}` : ''}
        </strong>
        <button class="icon-btn" onClick={close} aria-label="Sluiten">
          ✕
        </button>
      </header>

      <div class="menu-actions">
        <button class="big-btn primary" onClick={() => (giveBall(p.id), close())} disabled={excluded}>
          Bal geven
        </button>
        {excluded ? (
          <button class="big-btn" onClick={() => (returnPiece(p.id), close())}>
            Terug in het spel
          </button>
        ) : (
          <button class="big-btn warn" onClick={() => (excludePiece(p.id), close())}>
            Uitsluiten
          </button>
        )}
      </div>

      <h4>Nummer</h4>
      <div class="num-grid">
        {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            class={`num-btn${p.num === n ? ' on' : ''}${used.has(n) ? ' used' : ''}`}
            onClick={() => updatePiece(p.id, { num: n, name: squad?.players.find((x) => x.num === n)?.name || undefined })}
          >
            {n}
          </button>
        ))}
      </div>

      <h4>Naam</h4>
      <input
        class="text"
        value={p.name ?? ''}
        placeholder={squad ? 'uit de selectie' : 'optioneel'}
        onChange={(e) => updatePiece(p.id, { name: (e.target as HTMLInputElement).value.trim() || undefined })}
      />

      <h4>Rol</h4>
      <div class="cat-row">
        {ROLES.map((r) => (
          <button
            key={r.value}
            class={`chip small${(r.value === 'keeper' ? p.keeper : p.role === r.value && !p.keeper) ? ' on' : ''}`}
            onClick={() =>
              r.value === 'keeper'
                ? updatePiece(p.id, { keeper: !p.keeper, role: p.keeper ? 'none' : 'keeper' })
                : updatePiece(p.id, { role: r.value, keeper: false })
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <button class="chip wide" onClick={() => (addQuestionFromBoard(p.id), close())} disabled={excluded}>
        Quizvraag: waar hoort {p.team === 'white' ? 'wit' : 'blauw'} {p.num}?
      </button>
      <button class={`chip wide${p.lefty ? ' on' : ''}`} onClick={() => updatePiece(p.id, { lefty: !p.lefty })}>
        {p.lefty ? 'Linkshandig ✓' : 'Linkshandig'}
      </button>

      <button
        class={`chip wide${confirmDelete.value ? ' danger' : ' danger-soft'}`}
        onClick={() => {
          if (!confirmDelete.value) {
            confirmDelete.value = true
            return
          }
          removePiece(p.id)
          close()
        }}
      >
        {confirmDelete.value ? 'Tik nogmaals om te verwijderen' : 'Cap verwijderen'}
      </button>
    </div>
  )
}
