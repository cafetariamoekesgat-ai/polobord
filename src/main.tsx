import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './styles.css'
import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import './audio'
import './presentation'
import { hydrate } from './store'
import { App } from './ui/App'

// Safari: geen pinch-zoom, dubbeltik-zoom of stuiter-scroll
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
let lastTouchEnd = 0
document.addEventListener(
  'touchend',
  (e) => {
    const t = Date.now()
    if (t - lastTouchEnd < 300 && !(e.target as HTMLElement).closest('input, textarea, select')) e.preventDefault()
    lastTouchEnd = t
  },
  { passive: false },
)
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as HTMLElement).closest('.panel-body, .cap-menu, .toolbar, .tl-steps')) e.preventDefault()
  },
  { passive: false },
)

hydrate().then(() => {
  render(<App />, document.getElementById('app')!)
})

registerSW({ immediate: true })
