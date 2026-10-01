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
import { handleIncoming } from './incoming'
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
    if (!(e.target as HTMLElement).closest('.panel-body, .cap-menu, .toolbar, .tl-steps, .timeline')) e.preventDefault()
  },
  { passive: false },
)

// Chrome op iOS: de pagina kan onder de adresbalk schuiven. Houd de app precies
// zo hoog als het zichtbare deel en zet een verschoven pagina terug op 0.
function fitViewport() {
  const vv = window.visualViewport
  const h = vv ? vv.height : window.innerHeight
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`)
  const typing = (document.activeElement as HTMLElement | null)?.closest?.('input, textarea, select')
  if (!typing && (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop)) window.scrollTo(0, 0)
}
fitViewport()
window.addEventListener('resize', fitViewport)
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 300))
window.visualViewport?.addEventListener('resize', fitViewport)
window.visualViewport?.addEventListener('scroll', fitViewport)
document.addEventListener('focusout', () => setTimeout(fitViewport, 50))

hydrate().then(() => {
  render(<App />, document.getElementById('app')!)
  // gedeelde play of quiz in de link? (na de eerste weergave, als het bord er staat)
  setTimeout(handleIncoming, 50)
})
window.addEventListener('hashchange', () => handleIncoming())

registerSW({ immediate: true })
