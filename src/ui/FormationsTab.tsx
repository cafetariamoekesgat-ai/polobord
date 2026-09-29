import { DEFENSE_LABELS, type DefenseMode } from '../defense'
import { FORMATION_GROUP_LABELS, FORMATIONS, type FormationGroup } from '../formations'
import { addPiece, applyFormation, autoDefense, doc, resetBoard, setAttacking, setView, version, view } from '../store'
import { Section, Segmented, Toggle } from './controls'

const GROUPS: FormationGroup[] = ['aanval', 'verdediging', 'overtal', 'hervatting']

export function FormationsTab() {
  version.value
  const b = doc.board
  const vw = view.value
  const ad = autoDefense.value
  const defending = b.attacking === 'white' ? 'blauw' : 'wit'
  return (
    <div>
      <Section title="Wie valt aan?">
        <Segmented
          value={b.attacking}
          options={[
            { value: 'white', label: 'Wit valt aan →' },
            { value: 'blue', label: '← Blauw valt aan' },
          ]}
          onChange={setAttacking}
        />
      </Section>

      <Section title="Weergave">
        <div class="btn-grid three">
          <button class={`chip${!vw.half ? ' on' : ''}`} onClick={() => setView({ half: false })}>
            Heel bad
          </button>
          <button class={`chip${vw.half ? ' on' : ''}`} onClick={() => setView({ half: true })}>
            Half bad
          </button>
          <button class={`chip${vw.rotated ? ' on' : ''}`} onClick={() => setView({ rotated: !vw.rotated })}>
            Draai 180°
          </button>
          <button class={`chip${vw.mirrored ? ' on' : ''}`} onClick={() => setView({ mirrored: !vw.mirrored })}>
            Spiegel
          </button>
        </div>
      </Section>

      {GROUPS.map((g) => (
        <Section key={g} title={FORMATION_GROUP_LABELS[g]} hint={g === 'verdediging' ? `Verdediging van ${defending}; de aanvallers blijven staan.` : undefined}>
          <div class="btn-grid">
            {FORMATIONS.filter((f) => f.group === g).map((f) => (
              <button key={f.id} class="big-btn" onClick={() => applyFormation(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Automatische verdediging" hint={`Verplaats een aanvaller of de bal: ${defending} schuift live mee.`}>
        <Toggle label="Auto-dekking aan" checked={ad.enabled} onChange={(v) => (autoDefense.value = { ...ad, enabled: v })} />
        <div class="btn-grid">
          {(Object.keys(DEFENSE_LABELS) as DefenseMode[]).map((m) => (
            <button key={m} class={`chip${ad.mode === m ? ' on' : ''}`} onClick={() => (autoDefense.value = { ...ad, mode: m, enabled: true })}>
              {DEFENSE_LABELS[m]}
            </button>
          ))}
        </div>
        <Toggle label="Keeper volgt de bal" sub="op de bissectrice van de doelhoek" checked={ad.keeper} onChange={(v) => (autoDefense.value = { ...ad, keeper: v })} />
      </Section>

      <Section title="Caps">
        <div class="btn-grid">
          <button class="chip" onClick={() => addPiece('white')}>
            + Witte cap
          </button>
          <button class="chip" onClick={() => addPiece('blue')}>
            + Blauwe cap
          </button>
        </div>
        <button class="chip wide danger-soft" onClick={resetBoard}>
          Bord terugzetten (3-3)
        </button>
      </Section>
    </div>
  )
}
