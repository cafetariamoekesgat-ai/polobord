import { beginQuestion, checkPlayer, closePlayerQuiz, nextQuestion, pq, resultText, sendResult, setPlayerName } from '../playerQuiz'
import { doc, version } from '../store'

/** Wat een speler ziet als hij een gedeelde quiz opent: bord + deze kaart. */
export function PlayerQuizCard() {
  version.value
  const s = pq.value
  if (!s) return null
  const n = s.set.questions.length

  if (s.phase === 'intro') {
    return (
      <div class="pq-card intro">
        <h2>{s.set.title}</h2>
        <p>
          {n} {n === 1 ? 'vraag' : 'vragen'}. Bij elke vraag ligt één speler nog op de middenlijn: sleep hem naar de plek waar hij hoort en tik op <b>Controleer</b>.
        </p>
        <input class="text" placeholder="Je naam" value={s.name} onInput={(e) => setPlayerName((e.target as HTMLInputElement).value)} />
        <button class="big-btn wide primary" disabled={!s.name.trim()} onClick={() => beginQuestion(0)}>
          Begin
        </button>
        <p class="hint portrait-hint">Tip: draai je telefoon een kwartslag, dan is het bad groter.</p>
      </div>
    )
  }

  if (s.phase === 'done') {
    const total = s.scores.reduce((a, b) => a + b, 0)
    return (
      <div class="pq-card intro">
        <h2>Klaar, {s.name}!</h2>
        <p class="train-score good">
          {total} van {n * 100} punten
        </p>
        <p class="hint">{resultText(s)}</p>
        <button class="big-btn wide primary" onClick={sendResult}>
          Stuur je uitslag naar de trainer
        </button>
        <button class="big-btn wide" onClick={closePlayerQuiz}>
          Sluiten
        </button>
      </div>
    )
  }

  const q = s.set.questions[s.index]
  const piece = doc.board.pieces.find((p) => p.id === s.pieceId)
  const who = piece ? `${piece.team === 'white' ? 'wit' : 'blauw'} ${piece.num}${piece.keeper ? ' (keeper)' : ''}` : 'de speler'
  return (
    <div class="pq-card">
      <div class="pq-top">
        <small>
          Vraag {s.index + 1} van {n}
        </small>
        <button class="link-btn" onClick={closePlayerQuiz}>
          stoppen
        </button>
      </div>
      <p>
        Sleep <b>{who}</b> naar zijn plek.
      </p>
      {q.note && <p class="pq-note">{q.note}</p>}
      {s.result ? (
        <>
          <p class={`train-score ${s.result.score >= 60 ? 'good' : 'bad'}`}>
            {s.result.score} punten · {s.result.dist.toFixed(1).replace('.', ',')} m ernaast
          </p>
          <button class="big-btn wide primary" onClick={nextQuestion}>
            {s.index + 1 < n ? 'Volgende vraag' : 'Naar je uitslag'}
          </button>
        </>
      ) : (
        <button class="big-btn wide primary" onClick={checkPlayer}>
          Controleer
        </button>
      )}
    </div>
  )
}
