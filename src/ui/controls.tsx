import type { ComponentChildren } from 'preact'

export function Section({ title, children, hint }: { title: string; children: ComponentChildren; hint?: string }) {
  return (
    <section class="p-section">
      <h3>{title}</h3>
      {hint && <p class="hint">{hint}</p>}
      {children}
    </section>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} class={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ label, checked, onChange, sub }: { label: string; checked: boolean; onChange: (v: boolean) => void; sub?: string }) {
  return (
    <button class={`toggle${checked ? ' on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span class="toggle-text">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </span>
      <span class="knob" />
    </button>
  )
}

export function Stepper({ value, min, max, step = 1, onChange, unit }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div class="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} aria-label="Minder">
        −
      </button>
      <span class="num">
        {value}
        {unit && <small> {unit}</small>}
      </span>
      <button onClick={() => onChange(Math.min(max, value + step))} aria-label="Meer">
        +
      </button>
    </div>
  )
}
