/**
 * Trainingsplanner: een training is een rij onderdelen (play uit de bibliotheek
 * of ingebouwde oefening) met een duur. Aan de badrand loop je erdoorheen met
 * een timer per onderdeel; bij nul klinkt een signaal, doorgaan doe je zelf.
 */
import { signal } from '@preact/signals'
import { beep } from './audio'
import { newId } from './formations'
import { getEngine, loadPlay, playback, plays, saveSessions, sessions, showToast } from './store'
import { BUILTINS } from './training'
import type { Session, SessionItem } from './types'

export function itemLabel(it: SessionItem): string {
  if (it.ref.startsWith('play:')) {
    const p = plays.value.find((x) => x.id === it.ref.slice(5))
    return p ? p.name : '(verwijderde play)'
  }
  return BUILTINS.find((b) => b.id === it.ref.slice(8))?.label ?? '(onbekend)'
}

export const totalMinutes = (s: Session) => s.items.reduce((a, b) => a + b.minutes, 0)

export function newSession(): Session {
  return { id: newId('ses'), name: 'Training', items: [], updated: Date.now() }
}

export function upsertSession(s: Session) {
  const next = { ...s, updated: Date.now() }
  const list = sessions.value.some((x) => x.id === s.id) ? sessions.value.map((x) => (x.id === s.id ? next : x)) : [...sessions.value, next]
  saveSessions(list)
}

export function deleteSession(id: string) {
  saveSessions(sessions.value.filter((x) => x.id !== id))
  if (runner.value?.sessionId === id) stopRunner()
}

export const newItem = (ref: string, minutes = 5): SessionItem => ({ id: newId('it'), ref, minutes })

// ── Uitvoeren ─────────────────────────────────────────────────────────────

export interface RunnerState {
  sessionId: string
  index: number
  /** einde van het onderdeel (Date.now()); null als gepauzeerd */
  endsAt: number | null
  /** resterende ms bij pauze */
  left: number
  beeped: boolean
}
export const runner = signal<RunnerState | null>(null)
export const runnerTick = signal(0)

let timer = 0
function ensureTimer() {
  if (timer) return
  timer = window.setInterval(() => {
    const r = runner.value
    if (!r) {
      clearInterval(timer)
      timer = 0
      return
    }
    runnerTick.value++
    if (r.endsAt && !r.beeped && Date.now() >= r.endsAt) {
      beep('end')
      runner.value = { ...r, beeped: true }
    } else if (r.endsAt && !r.beeped && r.endsAt - Date.now() <= 30000 && r.endsAt - Date.now() > 29750) {
      beep('warn')
    }
  }, 250)
}

export const runnerSession = () => sessions.value.find((s) => s.id === runner.value?.sessionId)

export function remainingMs(): number {
  const r = runner.value
  if (!r) return 0
  return r.endsAt ? Math.max(0, r.endsAt - Date.now()) : r.left
}

function runItem(s: Session, index: number) {
  const it = s.items[index]
  if (!it) return
  runner.value = { sessionId: s.id, index, endsAt: Date.now() + it.minutes * 60000, left: it.minutes * 60000, beeped: false }
  ensureTimer()
  if (it.ref.startsWith('play:')) {
    const id = it.ref.slice(5)
    if (!plays.value.some((p) => p.id === id)) {
      showToast('Deze play staat niet meer in de bibliotheek.')
      return
    }
    getEngine()?.stop()
    loadPlay(id)
    playback.value = { ...playback.value, t: 0, loop: true }
    setTimeout(() => getEngine()?.play(), 450)
  } else {
    BUILTINS.find((b) => b.id === it.ref.slice(8))?.run(playback.value.speed)
  }
  if (it.note) showToast(it.note, undefined, 8000)
}

export function startSession(id: string) {
  const s = sessions.value.find((x) => x.id === id)
  if (!s?.items.length) {
    showToast('Deze training heeft nog geen onderdelen.')
    return
  }
  runItem(s, 0)
}

export function gotoItem(delta: number) {
  const r = runner.value
  const s = runnerSession()
  if (!r || !s) return
  const i = r.index + delta
  if (i < 0) return
  if (i >= s.items.length) {
    showToast(`Training "${s.name}" is klaar.`)
    stopRunner()
    return
  }
  runItem(s, i)
}

export function togglePause() {
  const r = runner.value
  if (!r) return
  runner.value = r.endsAt ? { ...r, endsAt: null, left: Math.max(0, r.endsAt - Date.now()) } : { ...r, endsAt: Date.now() + r.left }
}

export function stopRunner() {
  runner.value = null
}
