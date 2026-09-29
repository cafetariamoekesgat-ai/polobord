import { RULES } from '../rules'
import { layers, tool } from '../store'
import { Section, Toggle } from './controls'

export function AnalysisTab() {
  const l = layers.value
  const set = (patch: Partial<typeof l>) => (layers.value = { ...l, ...patch })
  return (
    <div>
      <Section title="Analyse-lagen" hint="Lagen rekenen live mee terwijl je caps of de bal verschuift.">
        <Toggle
          label="Passlijnen"
          sub={`groen = vrij, rood = verdediger binnen ${String(RULES.analysis.interceptDistance).replace('.', ',')} m van de lijn`}
          checked={l.passes}
          onChange={(v) => set({ passes: v })}
        />
        <Toggle label="Schothoek" sub="kegel naar beide palen, met schaduw van keeper en verdedigers" checked={l.shot} onChange={(v) => set({ shot: v })} />
        <Toggle label="Ruimtekaart" sub="wie is waar het eerst bij (Voronoi)" checked={l.voronoi} onChange={(v) => set({ voronoi: v })} />
      </Section>
      <Section title="Meetlint">
        <button class={`big-btn wide${tool.value === 'measure' ? ' primary' : ''}`} onClick={() => (tool.value = tool.value === 'measure' ? 'move' : 'measure')}>
          {tool.value === 'measure' ? 'Meetlint uitzetten' : 'Meetlint: sleep tussen twee punten'}
        </button>
        <p class="hint">Begin of eindig op een cap om precies vanaf het midden te meten.</p>
      </Section>
    </div>
  )
}
