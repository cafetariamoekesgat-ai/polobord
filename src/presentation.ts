/** Presentatiemodus: volledig scherm en scherm blijft aan (Wake Lock). */
import { effect } from '@preact/signals'
import { capMenu, locked, presentation } from './store'

let lock: WakeLockSentinel | null = null

async function acquire() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
  } catch {
    /* niet ondersteund of geweigerd */
  }
}
function release() {
  lock?.release().catch(() => {})
  lock = null
}

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void }

function enterFullscreen() {
  const d = document as FsDoc
  if (d.fullscreenElement || d.webkitFullscreenElement) return
  const el = document.documentElement as FsEl
  try {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
    else el.webkitRequestFullscreen?.()
  } catch {
    /* standalone-app is al volledig scherm */
  }
}
function exitFullscreen() {
  const d = document as FsDoc
  try {
    if (d.fullscreenElement) d.exitFullscreen().catch(() => {})
    else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.()
  } catch {
    /* niets */
  }
}

export function startPresentation() {
  capMenu.value = null
  presentation.value = true
  enterFullscreen()
  acquire()
}

export function stopPresentation() {
  presentation.value = false
  locked.value = false
  exitFullscreen()
  release()
}

effect(() => {
  if (!presentation.value) release()
})

document.addEventListener('visibilitychange', () => {
  if (presentation.value && document.visibilityState === 'visible') acquire()
})
document.addEventListener('fullscreenchange', () => {
  // wie met de systeemknop uit volledig scherm gaat, blijft gewoon in de presentatie
})
