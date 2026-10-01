import { useSignal } from '@preact/signals'
import { Lock, LockOpen, MonitorPlay, PanelRightClose, PanelRightOpen, Timer, X } from 'lucide'
import { useEffect, useRef } from 'preact/hooks'
import { BoardEngine } from '../board/engine'
import { startPresentation, stopPresentation } from '../presentation'
import { appMode, clocksOpen, locked, panelOpen, presentation, settings, toast, tool } from '../store'
import { PlayerQuizCard } from './PlayerQuizCard'
import { RunnerBar } from './RunnerBar'
import { CapMenu } from './CapMenu'
import { Clocks } from './Clocks'
import { Icon, type IconNode } from './Icon'
import { Panel } from './Panel'
import { Timeline } from './Timeline'
import { Toolbar } from './Toolbar'

export function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (stageRef.current) new BoardEngine(stageRef.current)
  }, [])

  const quiz = appMode.value === 'quiz'
  // een speler die een gedeelde quiz doet, ziet alleen het bord en de quizkaart
  const pres = presentation.value || quiz
  const theme = settings.value.theme
  return (
    <div class={`app theme-${theme}${pres ? ' presenting' : ''}${quiz ? ' quiz-mode' : ''}${panelOpen.value && !pres ? ' with-panel' : ''} tool-${tool.value}`}>
      {!pres && <Toolbar />}
      <main class="stage-wrap">
        <div class="stage" ref={stageRef} />
        {pres && !quiz && <PresentationBar />}
        {quiz && <PlayerQuizCard />}
        {!quiz && <RunnerBar />}
        <Toast />
        {clocksOpen.value && !quiz && <Clocks />}
      </main>
      {!pres && (
        <div class="bottom-bar">
          <Timeline />
          <TopCluster />
        </div>
      )}
      {!pres && panelOpen.value && <Panel />}
      {!quiz && <CapMenu />}
    </div>
  )
}

function TopCluster() {
  return (
    <div class="view-cluster">
      <button class={`round-btn${clocksOpen.value ? ' on' : ''}`} onClick={() => (clocksOpen.value = !clocksOpen.value)} aria-label="Klokken" title="Klokken">
        <Icon icon={Timer as IconNode} />
      </button>
      <button class="round-btn" onClick={startPresentation} aria-label="Presentatiemodus" title="Presentatiemodus">
        <Icon icon={MonitorPlay as IconNode} />
      </button>
      <button class="round-btn" onClick={() => (panelOpen.value = !panelOpen.value)} aria-label={panelOpen.value ? 'Paneel sluiten' : 'Paneel openen'} title="Paneel">
        <Icon icon={(panelOpen.value ? PanelRightClose : PanelRightOpen) as IconNode} />
      </button>
    </div>
  )
}

/** In de presentatie: alleen afspelen, klok en vergrendelen. Ontgrendelen = vasthouden. */
function PresentationBar() {
  const holding = useSignal(false)
  const timer = useRef(0)
  const isLocked = locked.value

  const startHold = () => {
    holding.value = true
    timer.current = window.setTimeout(() => {
      locked.value = false
      holding.value = false
      navigator.vibrate?.(20)
    }, 800)
  }
  const endHold = () => {
    holding.value = false
    clearTimeout(timer.current)
  }

  return (
    <div class={`pres-bar${isLocked ? ' is-locked' : ''}`}>
      {!isLocked && <Timeline compact />}
      {!isLocked && (
        <button class={`round-btn${clocksOpen.value ? ' on' : ''}`} onClick={() => (clocksOpen.value = !clocksOpen.value)} aria-label="Klokken">
          <Icon icon={Timer as IconNode} />
        </button>
      )}
      {isLocked ? (
        <button
          class={`round-btn lock-btn${holding.value ? ' holding' : ''}`}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          aria-label="Ontgrendelen: vasthouden"
        >
          <Icon icon={Lock as IconNode} />
          <span class="lock-hint">houd vast</span>
        </button>
      ) : (
        <button class="round-btn" onClick={() => (locked.value = true)} aria-label="Vergrendelen">
          <Icon icon={LockOpen as IconNode} />
        </button>
      )}
      {!isLocked && (
        <button class="round-btn" onClick={stopPresentation} aria-label="Presentatie sluiten">
          <Icon icon={X as IconNode} />
        </button>
      )}
    </div>
  )
}

function Toast() {
  const t = toast.value
  if (!t) return null
  return (
    <div class="toast" role="status">
      <span>{t.text}</span>
      {t.actions?.map((a) => (
        <button
          key={a.label}
          class="chip small on"
          onClick={() => {
            toast.value = null
            a.run()
          }}
        >
          {a.label}
        </button>
      ))}
      {t.actions?.length ? (
        <button class="icon-btn" onClick={() => (toast.value = null)} aria-label="Sluiten">
          ✕
        </button>
      ) : null}
    </div>
  )
}
