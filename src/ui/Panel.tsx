import { BarChart3, BookOpen, ClipboardList, GraduationCap, LayoutGrid, Settings, Users } from 'lucide'
import { panelTab, type PanelTab } from '../store'
import { AnalysisTab } from './AnalysisTab'
import { FormationsTab } from './FormationsTab'
import { Icon, type IconNode } from './Icon'
import { PlannerTab } from './PlannerTab'
import { PlaysTab } from './PlaysTab'
import { SettingsTab } from './SettingsTab'
import { TeamTab } from './TeamTab'
import { TrainingTab } from './TrainingTab'

const TABS: { id: PanelTab; label: string; icon: IconNode }[] = [
  { id: 'opstellen', label: 'Opstellen', icon: LayoutGrid as IconNode },
  { id: 'plays', label: 'Plays', icon: BookOpen as IconNode },
  { id: 'plan', label: 'Plan', icon: ClipboardList as IconNode },
  { id: 'analyse', label: 'Analyse', icon: BarChart3 as IconNode },
  { id: 'training', label: 'Training', icon: GraduationCap as IconNode },
  { id: 'team', label: 'Team', icon: Users as IconNode },
  { id: 'instellingen', label: 'Instellen', icon: Settings as IconNode },
]

export function Panel() {
  const tab = panelTab.value
  return (
    <aside class="panel" aria-label="Paneel">
      <div class="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} class={tab === t.id ? 'on' : ''} onClick={() => (panelTab.value = t.id)}>
            <Icon icon={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div class="panel-body">
        {tab === 'opstellen' && <FormationsTab />}
        {tab === 'plays' && <PlaysTab />}
        {tab === 'plan' && <PlannerTab />}
        {tab === 'analyse' && <AnalysisTab />}
        {tab === 'training' && <TrainingTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'instellingen' && <SettingsTab />}
      </div>
    </aside>
  )
}
