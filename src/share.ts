/**
 * Delen zonder server: de hele play (of quiz) zit gecomprimeerd in de link,
 * achter het #-teken. Dat deel van een URL gaat nooit naar de server; GitHub
 * Pages ziet dus niets, en de link werkt ook offline zodra de app geladen is.
 *
 *   #p=<data>  een play (bord met stappen en lijnen)
 *   #q=<data>  een quiz voor spelers
 *
 * <data> = 'z' + base64url(deflate-raw(JSON)), of 'j' + base64url(JSON) als de
 * browser geen CompressionStream kent.
 */
import { showToast } from './store'

const round = (_k: string, val: unknown) => (typeof val === 'number' ? Math.round(val * 100) / 100 : val)

function toB64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function encode(data: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data, round))
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')))
    } catch {
      /* val terug op ongecomprimeerd */
    }
  }
  return 'j' + toB64url(json)
}

export async function decode<T>(s: string): Promise<T> {
  const kind = s[0]
  const bytes = fromB64url(s.slice(1))
  const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
  return JSON.parse(new TextDecoder().decode(json)) as T
}

export async function shareLink(kind: 'p' | 'q', data: unknown, title: string) {
  const url = `${location.origin}${import.meta.env.BASE_URL}#${kind}=${await encode(data)}`
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && 'ontouchend' in document) {
    try {
      await nav.share({ title, text: title, url })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    showToast('Link gekopieerd. Plak hem in WhatsApp of een mail.')
  } catch {
    window.prompt('Kopieer deze link:', url)
  }
}

/** Lees een gedeelde play/quiz uit de URL en haal hem daarna uit de adresbalk. */
export async function readHash(): Promise<{ kind: 'p' | 'q'; data: unknown } | null> {
  const m = location.hash.match(/^#([pq])=(.+)$/)
  if (!m) return null
  history.replaceState(null, '', location.pathname + location.search)
  try {
    return { kind: m[1] as 'p' | 'q', data: await decode(m[2]) }
  } catch (e) {
    console.warn('Gedeelde link onleesbaar', e)
    showToast('Deze link is beschadigd of onvolledig. Vraag de trainer om hem opnieuw te sturen.')
    return null
  }
}
