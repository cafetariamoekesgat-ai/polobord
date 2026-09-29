import { useSignal } from '@preact/signals'
import { FIELD_PRESETS, RULES } from '../rules'
import { doc, setField, settings, updateSettings, version } from '../store'
import { Section, Segmented, Stepper, Toggle } from './controls'

export function SettingsTab() {
  version.value
  const s = settings.value
  const f = doc.board.field
  const customL = useSignal(String(f.length))
  const customW = useSignal(String(f.width))
  return (
    <div>
      <Section title="Veldmaat" hint="Posities en lijnen schalen mee met de nieuwe maat.">
        <div class="btn-grid">
          {FIELD_PRESETS.map((p) => (
            <button key={p.id} class={`chip${f.id === p.id ? ' on' : ''}`} onClick={() => setField(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div class="custom-field">
          <span>Eigen bad</span>
          <input class="text num" inputMode="decimal" value={customL.value} onInput={(e) => (customL.value = (e.target as HTMLInputElement).value)} aria-label="Lengte in meters" />
          <span>×</span>
          <input class="text num" inputMode="decimal" value={customW.value} onInput={(e) => (customW.value = (e.target as HTMLInputElement).value)} aria-label="Breedte in meters" />
          <span>m</span>
          <button
            class="chip"
            onClick={() => {
              const L = parseFloat(customL.value.replace(',', '.'))
              const W = parseFloat(customW.value.replace(',', '.'))
              if (L >= 12 && L <= 40 && W >= 8 && W <= 30) setField({ id: 'custom', label: `${L} × ${W} m (eigen)`, length: L, width: W })
            }}
          >
            Toepassen
          </button>
        </div>
      </Section>

      <Section title="Thema">
        <Segmented
          value={s.theme}
          options={[
            { value: 'bad', label: 'Bad (licht)' },
            { value: 'tribune', label: 'Tribune (donker)' },
          ]}
          onChange={(v) => updateSettings({ theme: v })}
        />
        <Toggle label="Lichtspel in het water" sub="staat vanzelf uit in de presentatiemodus" checked={s.caustics} onChange={(v) => updateSettings({ caustics: v })} />
        <Toggle label="Alleen de Pencil tekent" sub="de vinger schuift dan altijd caps, ook met een lijn-gereedschap" checked={s.penOnlyDraws} onChange={(v) => updateSettings({ penOnlyDraws: v })} />
      </Section>

      <Section title="Spelregels" hint="Standaard volgens World Aquatics 2025/26. KNZB-competities en jeugd wijken soms af.">
        <div class="row-label">
          <span>Uitsluiting</span>
          <Segmented
            value={String(s.exclusionSeconds)}
            options={[
              { value: '18', label: '18 s' },
              { value: '20', label: '20 s' },
            ]}
            onChange={(v) => updateSettings({ exclusionSeconds: Number(v) })}
          />
        </div>
        <div class="row-label">
          <span>Schotklok</span>
          <Stepper value={s.shotClockFull} min={15} max={35} onChange={(v) => updateSettings({ shotClockFull: v })} unit="s" />
        </div>
        <div class="row-label">
          <span>Na rebound</span>
          <Stepper value={s.shotClockReset} min={10} max={30} onChange={(v) => updateSettings({ shotClockReset: v })} unit="s" />
        </div>
        <div class="row-label">
          <span>Periodes</span>
          <Stepper value={s.periods} min={1} max={4} onChange={(v) => updateSettings({ periods: v })} />
        </div>
        <div class="row-label">
          <span>Periodeduur</span>
          <Stepper value={s.periodMinutes} min={2} max={10} onChange={(v) => updateSettings({ periodMinutes: v })} unit="min" />
        </div>
        <div class="row-label">
          <span>Time-outs</span>
          <Stepper value={s.timeouts} min={0} max={4} onChange={(v) => updateSettings({ timeouts: v })} />
        </div>
        <button
          class="chip wide"
          onClick={() =>
            updateSettings({
              exclusionSeconds: RULES.exclusion,
              shotClockFull: RULES.shotClock.full,
              shotClockReset: RULES.shotClock.reset,
              periods: RULES.periods.count,
              periodMinutes: RULES.periods.minutes,
              timeouts: RULES.timeouts,
            })
          }
        >
          Terug naar World Aquatics
        </button>
      </Section>

      <Section title="Over">
        <p class="hint">
          Polobord {__APP_VERSION__} · werkt offline · alles blijft op dit apparaat. Maak af en toe een export (Plays → Exporteer alles) als reservekopie.
        </p>
      </Section>
    </div>
  )
}
