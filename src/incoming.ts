/** Gedeelde links openen: een play (#p=) of een spelersquiz (#q=). */
import { openPlayerQuiz } from './playerQuiz'
import { startPresentation } from './presentation'
import { readHash, shareLink } from './share'
import { currentPlay, doc, freshBoard, getEngine, playback, replaceBoard, savePlay, showToast, snapshotFrame } from './store'
import type { Board, QuizSet } from './types'

interface SharedPlay {
  v: 1
  name: string
  category: string
  board: Board
}

/** Deel een bord (met stappen en lijnen) als link. */
export function sharePlay(board: Board, name: string, category: string) {
  const b: Board = JSON.parse(JSON.stringify(board))
  b.currentStep = 0
  if (b.steps.length) {
    // begin bij stap 1, zodat de ontvanger het filmpje vanaf het begin ziet
    const first = b.steps[0]
    for (const p of b.pieces) {
      const q = first.pos[p.id]
      if (q) {
        p.x = q.x
        p.y = q.y
      }
    }
    b.ball = { ...first.ball }
  }
  const data: SharedPlay = { v: 1, name, category, board: b }
  return shareLink('p', data, `Polobord: ${name}`)
}

export function shareCurrentBoard() {
  const cur = currentPlay.value
  const b: Board = JSON.parse(JSON.stringify(doc.board))
  if (b.steps.length) b.steps[b.currentStep] = snapshotFrame(b)
  return sharePlay(b, cur?.name ?? 'Play', cur?.category ?? 'Overig')
}

export async function handleIncoming() {
  const got = await readHash()
  if (!got) return
  if (got.kind === 'q') {
    const set = got.data as QuizSet
    if (!set?.questions?.length) {
      showToast('Deze quiz bevat geen vragen.')
      return
    }
    openPlayerQuiz(set)
    return
  }
  const sp = got.data as SharedPlay
  if (!sp?.board?.pieces) {
    showToast('Deze link bevat geen play.')
    return
  }
  replaceBoard({ ...freshBoard(sp.board.field), ...sp.board })
  currentPlay.value = null
  startPresentation()
  if (sp.board.steps.length > 1) {
    playback.value = { ...playback.value, t: 0, loop: true, playing: false }
    setTimeout(() => getEngine()?.play(), 600)
  }
  showToast(`Gedeelde play: ${sp.name}`, [{ label: 'Bewaar in mijn bibliotheek', run: () => savePlay(sp.name, sp.category, true) }], 10000)
}
