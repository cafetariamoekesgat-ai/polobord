/**
 * Spelersquiz: de trainer stelt vragen samen ("waar hoort deze speler?") en
 * deelt ze als link. Een speler doet de quiz op zijn eigen telefoon en stuurt
 * aan het eind zijn uitslag terug via het deelmenu (WhatsApp, mail, ...).
 * Er is geen server: vragen zitten in de link, scores gaan via de speler zelf.
 */
import { signal } from '@preact/signals'
import * as db from './db'
import { dist, v } from './geometry'
import { shareLink } from './share'
import {
  appMode,
  doc,
  freshBoard,
  ghosts,
  guides,
  isExcluded,
  quizSet,
  replaceBoard,
  restrictTo,
  saveQuizSet,
  setView,
  showToast,
  snapshotFrame,
  suspendSave,
  autoDefense,
} from './store'
import type { Board, QuizQuestion, QuizSet, Vec } from './types'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Het bord zoals het nu op het scherm staat, als één losse situatie (zonder stappen). */
function flatBoard(): Board {
  const b = clone(doc.board)
  if (b.steps.length) {
    const fr = snapshotFrame(b)
    const step = b.currentStep
    b.strokes = b.strokes.filter((s) => s.step === step).map((s) => ({ ...s, step: 0, pieceId: null }))
    b.ball = fr.ball
  } else b.strokes = b.strokes.map((s) => ({ ...s, pieceId: null }))
  b.steps = []
  b.currentStep = 0
  return b
}

// ── Trainer: vragen samenstellen ───────────────────────────────────────────

export function addQuestionFromBoard(pieceId: string) {
  const p = doc.board.pieces.find((x) => x.id === pieceId)
  if (!p) return
  if (isExcluded(p)) {
    showToast('Een uitgesloten speler kan geen quizvraag zijn.')
    return
  }
  const q = quizSet.value
  saveQuizSet({ ...q, questions: [...q.questions, { board: flatBoard(), pieceId }] })
  showToast(`Vraag ${q.questions.length + 1} toegevoegd aan de spelersquiz (tabblad Training).`)
}

export function addQuestions(list: QuizQuestion[]) {
  const q = quizSet.value
  saveQuizSet({ ...q, questions: [...q.questions, ...list] })
}

export function removeQuestion(i: number) {
  const q = quizSet.value
  saveQuizSet({ ...q, questions: q.questions.filter((_, j) => j !== i) })
}

export function setQuestionNote(i: number, note: string) {
  const q = quizSet.value
  saveQuizSet({ ...q, questions: q.questions.map((x, j) => (j === i ? { ...x, note: note || undefined } : x)) })
}

export function shareQuiz() {
  const q = quizSet.value
  if (!q.questions.length) {
    showToast('Voeg eerst vragen toe.')
    return
  }
  return shareLink('q', { v: 1, title: q.title, questions: q.questions }, `Quiz: ${q.title}`)
}

// ── Speler: de quiz doen ────────────────────────────────────────────────────

export interface PlayerQuizState {
  set: QuizSet
  index: number
  name: string
  phase: 'intro' | 'play' | 'done'
  scores: number[]
  result?: { score: number; dist: number }
  ideal?: Vec
  pieceId?: string
}
export const pq = signal<PlayerQuizState | null>(null)

export function openPlayerQuiz(set: QuizSet) {
  if (!set?.questions?.length) return
  suspendSave.on = true
  autoDefense.value = { ...autoDefense.value, enabled: false }
  appMode.value = 'quiz'
  let name = ''
  try {
    name = localStorage.getItem('polobord-naam') ?? ''
  } catch {
    /* geen opslag */
  }
  pq.value = { set, index: 0, name, phase: 'intro', scores: [] }
}

export function setPlayerName(name: string) {
  if (!pq.value) return
  pq.value = { ...pq.value, name }
  try {
    localStorage.setItem('polobord-naam', name)
  } catch {
    /* geen opslag */
  }
}

export function beginQuestion(i: number) {
  const s = pq.value
  if (!s) return
  const q = s.set.questions[i]
  const b: Board = { ...freshBoard(q.board.field), ...clone(q.board), steps: [], currentStep: 0 }
  const p = b.pieces.find((x) => x.id === q.pieceId)
  if (!p) return
  const ideal = v(p.x, p.y)
  // naar de wachtplek op de middenlijn
  const { length: L, width: W } = b.field
  p.x = b.attacking === 'white' ? L / 2 + 0.9 : L / 2 - 0.9
  p.y = W / 2
  if (b.ball.holder === p.id) b.ball = { x: ideal.x, y: ideal.y, holder: null }
  replaceBoard(b)
  setView({ half: true })
  restrictTo.value = p.id
  ghosts.value = []
  guides.value = []
  pq.value = { ...s, index: i, phase: 'play', result: undefined, ideal, pieceId: p.id }
}

export function checkPlayer() {
  const s = pq.value
  if (!s || !s.ideal || !s.pieceId || s.result) return
  const p = doc.board.pieces.find((x) => x.id === s.pieceId)
  if (!p) return
  const d = dist(p, s.ideal)
  const score = p.keeper
    ? d <= 0.15
      ? 100
      : Math.max(0, Math.round(100 - (d - 0.15) * 110))
    : d <= 0.5
      ? 100
      : Math.max(0, Math.round(100 - (d - 0.5) * 40))
  ghosts.value = [{ pos: s.ideal, label: '✓', color: score >= 60 ? '#2fe07a' : '#ffd21f' }]
  restrictTo.value = '__none__'
  pq.value = { ...s, result: { score, dist: d }, scores: [...s.scores, score] }
}

export function nextQuestion() {
  const s = pq.value
  if (!s) return
  if (s.index + 1 < s.set.questions.length) beginQuestion(s.index + 1)
  else {
    restrictTo.value = '__none__'
    pq.value = { ...s, phase: 'done' }
  }
}

export function resultText(s: PlayerQuizState): string {
  const total = s.scores.reduce((a, b) => a + b, 0)
  const max = s.set.questions.length * 100
  return `${s.name || 'Speler'} · ${s.set.title}: ${total} van ${max} punten (${s.scores.join(' · ')})`
}

export async function sendResult() {
  const s = pq.value
  if (!s) return
  const text = resultText(s)
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    showToast('Uitslag gekopieerd: plak hem in de app van je trainer.')
  } catch {
    window.prompt('Kopieer je uitslag:', text)
  }
}

/** Terug naar de gewone app; het eigen bord van de speler komt terug. */
export async function closePlayerQuiz() {
  pq.value = null
  restrictTo.value = null
  appMode.value = 'normal'
  ghosts.value = []
  const saved = await db.kvGet<Board>('board').catch(() => undefined)
  replaceBoard(saved?.pieces ? { ...freshBoard(saved.field), ...saved } : freshBoard())
  suspendSave.on = false
}
