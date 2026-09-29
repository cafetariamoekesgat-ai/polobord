import { useSignal } from '@preact/signals'
import { Eraser, Hand, Redo2, Ruler, Trash2, Undo2 } from 'lucide'
import { canRedo, canUndo, clearStrokes, drawColor, DRAW_COLORS, lineKind, redo, tool, undo } from '../store'
import type { LineKind } from '../types'
import { Icon, LineIcons, type IconNode } from './Icon'

const LINES: { kind: LineKind; label: string }[] = [
  { kind: 'swim', label: 'Zwem' },
  { kind: 'pass', label: 'Pass' },
  { kind: 'shot', label: 'Schot' },
  { kind: 'screen', label: 'Blok' },
  { kind: 'free', label: 'Vrij' },
]

function ToolButton(props: { icon: IconNode; label: string; active?: boolean; disabled?: boolean; onClick: () => void; children?: preact.ComponentChildren }) {
  return (
    <button class={`tool${props.active ? ' active' : ''}`} disabled={props.disabled} onClick={props.onClick} aria-pressed={props.active} title={props.label}>
      <Icon icon={props.icon} />
      <span>{props.label}</span>
      {props.children}
    </button>
  )
}

export function Toolbar() {
  const colorsOpen = useSignal(false)
  const t = tool.value
  return (
    <nav class="toolbar" aria-label="Gereedschap">
      <ToolButton icon={Hand as IconNode} label="Schuif" active={t === 'move'} onClick={() => (tool.value = 'move')} />
      <div class="tool-sep" />
      {LINES.map((l) => (
        <ToolButton
          key={l.kind}
          icon={LineIcons[l.kind]}
          label={l.label}
          active={t === 'draw' && lineKind.value === l.kind}
          onClick={() => {
            lineKind.value = l.kind
            tool.value = 'draw'
          }}
        />
      ))}
      <div class="tool-color-wrap">
        <button class="tool" onClick={() => (colorsOpen.value = !colorsOpen.value)} title="Kleur">
          <span class="swatch" style={{ background: drawColor.value }} />
          <span>Kleur</span>
        </button>
        {colorsOpen.value && (
          <div class="color-pop" role="menu">
            {DRAW_COLORS.map((c) => (
              <button
                key={c.id}
                class={`swatch-btn${drawColor.value === c.value ? ' active' : ''}`}
                style={{ background: c.value }}
                aria-label={c.label}
                onClick={() => {
                  drawColor.value = c.value
                  colorsOpen.value = false
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div class="tool-sep" />
      <ToolButton icon={Eraser as IconNode} label="Gum" active={t === 'erase'} onClick={() => (tool.value = 'erase')} />
      <ToolButton icon={Ruler as IconNode} label="Meet" active={t === 'measure'} onClick={() => (tool.value = 'measure')} />
      <ToolButton icon={Trash2 as IconNode} label="Wis lijnen" onClick={clearStrokes} />
      <div class="tool-spacer" />
      <ToolButton icon={Undo2 as IconNode} label="Terug" disabled={!canUndo.value} onClick={undo} />
      <ToolButton icon={Redo2 as IconNode} label="Opnieuw" disabled={!canRedo.value} onClick={redo} />
    </nav>
  )
}
