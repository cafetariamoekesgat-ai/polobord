import { useSignal } from '@preact/signals'
import { doc, playback, version } from '../store'
import {
  checkQuiz,
  newKeeperQuiz,
  LEVELS,
  modeLabel,
  newQuiz,
  newScenario,
  OVERLOADS,
  revealQuiz,
  ROTATIONS,
  GOAL_AREA_PLAYS,
  startGoalAreaPlay,
  showScenario,
  startOverload,
  startPenalty,
  startRotation,
  startSprint,
  stopTrainer,
  trainer,
  type Level,
} from '../training'
import { addQuestions, removeQuestion, setQuestionNote, shareQuiz } from '../playerQuiz'
import { quizSet, saveQuizSet } from '../store'
import { randomQuizQuestions } from '../training'
import { Section, Segmented } from './controls'

/** Trainer stelt de quiz samen die spelers thuis via een link doen. */
function PlayerQuizSection({ level }: { level: Level }) {
  const q = quizSet.value
  const confirmClear = useSignal(false)
  return (
    <Section
      title="Quiz voor spelers"
      hint="Maak vragen en deel de quiz als link. Spelers doen hem op hun telefoon en sturen hun uitslag terug via WhatsApp. Vraag maken: lang indrukken op een cap → Quizvraag."
    >
      <input class="text" value={q.title} onInput={(e) => saveQuizSet({ ...q, title: (e.target as HTMLInputElement).value })} placeholder="Titel van de quiz" />
      {q.questions.map((qq, i) => {
        const p = qq.board.pieces.find((x) => x.id === qq.pieceId)
        return (
          <div key={i} class="pq-row">
            <span class="plan-no">{i + 1}</span>
            <div class="pq-row-main">
              <small>
                {p ? `${p.team === 'white' ? 'Wit' : 'Blauw'} ${p.num}${p.keeper ? ' (keeper)' : ''}` : 'speler'} op zijn plek
              </small>
              <input class="text" value={qq.note ?? ''} placeholder="Toelichting (optioneel)" onChange={(e) => setQuestionNote(i, (e.target as HTMLInputElement).value)} />
            </div>
            <button class="icon-btn" onClick={() => removeQuestion(i)} aria-label={`Vraag ${i + 1} weghalen`}>
              ✕
            </button>
          </div>
        )
      })}
      <div class="btn-grid">
        <button class="big-btn" onClick={() => addQuestions(randomQuizQuestions(level, 3))}>
          + 3 willekeurige ({level})
        </button>
        <button class="big-btn primary" disabled={!q.questions.length} onClick={() => shareQuiz()}>
          Deel quiz ({q.questions.length})
        </button>
      </div>
      {q.questions.length > 0 && (
        <button
          class={`chip wide${confirmClear.value ? ' danger' : ' danger-soft'}`}
          onClick={() => {
            if (!confirmClear.value) {
              confirmClear.value = true
              setTimeout(() => (confirmClear.value = false), 3000)
              return
            }
            saveQuizSet({ ...q, questions: [] })
            confirmClear.value = false
          }}
        >
          {confirmClear.value ? 'Tik nogmaals: alle vragen weg' : 'Alle vragen weghalen'}
        </button>
      )}
    </Section>
  )
}

const TEMPOS = [
  { value: '0.5', label: 'Rustig' },
  { value: '1', label: 'Normaal' },
  { value: '1.5', label: 'Snel' },
]

export function TrainingTab() {
  version.value
  const t = trainer.value
  const tempo = useSignal('1')
  const speed = () => parseFloat(tempo.value)
  const setLevel = (level: Level) => (trainer.value = { ...trainer.value, level })

  const piece = t.pieceId ? doc.board.pieces.find((p) => p.id === t.pieceId) : undefined

  return (
    <div>
      <Section title="Tempo" hint="Geldt voor de rotaties, de overtal-trainer en de vaste scenario's. Alles speelt af als stappen: in de presentatiemodus zie je het groot.">
        <Segmented
          value={tempo.value}
          options={TEMPOS}
          onChange={(v) => {
            tempo.value = v
            playback.value = { ...playback.value, speed: parseFloat(v) }
          }}
        />
      </Section>

      <Section title="Rotatietrainer 6 tegen 5" hint="Doorschuifpatronen in een lus; de zone schuift automatisch mee met de bal.">
        {ROTATIONS.map((r) => (
          <button key={r.id} class="big-btn wide train-btn" onClick={() => startRotation(r.id, speed())}>
            <strong>{r.label}</strong>
            <small>{r.hint}</small>
          </button>
        ))}
      </Section>

      <Section
        title="Doelgebied benutten"
        hint="Sinds 2023 geldt de 2 m-regel alleen nog in het doelgebied (2 m naast elke paal tot de 2 m-lijn). Zo gebruik je de ruimte eromheen."
      >
        {GOAL_AREA_PLAYS.map((g) => (
          <button key={g.id} class="big-btn wide train-btn" onClick={() => startGoalAreaPlay(g.id, speed())}>
            <strong>{g.label}</strong>
            <small>{g.point}</small>
          </button>
        ))}
      </Section>

      <Section title="Waar sta jij?" hint="Eén verdediger ligt nog op de middenlijn. Laat een speler hem naar de juiste plek slepen en controleer.">
        <Segmented value={t.level} options={LEVELS} onChange={setLevel} />
        {t.kind === 'quiz' && piece ? (
          <div class="train-card">
            <p>
              Verdediging: <b>{t.mode ? modeLabel(t.mode) : ''}</b>. Sleep <b>blauw {piece.num}</b> naar zijn plek.
              {t.level === 'makkelijk' && !t.result ? ' De gele ring is zijn man.' : ''}
            </p>
            {t.result && (
              <p class={`train-score ${t.result.score >= 60 ? 'good' : 'bad'}`}>
                {t.result.score} punten · {t.result.dist.toFixed(1).replace('.', ',')} m ernaast
              </p>
            )}
            <div class="btn-grid">
              {!t.result ? (
                <button class="big-btn primary" onClick={checkQuiz}>
                  Controleer
                </button>
              ) : (
                <button class="big-btn primary" onClick={() => newQuiz(t.level)}>
                  Volgende
                </button>
              )}
              <button class="big-btn" onClick={revealQuiz}>
                Laat zien
              </button>
            </div>
            {t.rounds > 0 && (
              <p class="hint">
                {t.rounds} {t.rounds === 1 ? 'ronde' : 'rondes'} · gemiddeld {Math.round(t.total / t.rounds)} punten
                <button class="link-btn" onClick={() => (trainer.value = { ...trainer.value, rounds: 0, total: 0 })}>
                  opnieuw tellen
                </button>
              </p>
            )}
          </div>
        ) : (
          <button class="big-btn wide primary" onClick={() => newQuiz(t.level)}>
            Start de quiz
          </button>
        )}
      </Section>

      <PlayerQuizSection level={t.level} />

      <Section title="Keepertrainer" hint="Een schutter met de bal. Sleep de keeper naar zijn plek: op de bissectrice van de doelhoek, ± 0,6 m voor de doellijn.">
        <Segmented value={t.level} options={LEVELS} onChange={setLevel} />
        {t.kind === 'keeper' ? (
          <div class="train-card">
            <p>
              Sleep de <b>keeper</b> naar de plek waar hij de meeste doel afdekt.
            </p>
            {t.result && (
              <p class={`train-score ${t.result.score >= 60 ? 'good' : 'bad'}`}>
                {t.result.score} punten · {Math.round(t.result.dist * 100)} cm ernaast
              </p>
            )}
            {t.result && <p class="hint">Witte lijnen: de doelhoek naar beide palen. Gele stippellijn: de bissectrice, daar hoort hij op.</p>}
            <div class="btn-grid">
              {!t.result ? (
                <button class="big-btn primary" onClick={checkQuiz}>
                  Controleer
                </button>
              ) : (
                <button class="big-btn primary" onClick={() => newKeeperQuiz(t.level)}>
                  Volgende
                </button>
              )}
              <button class="big-btn" onClick={revealQuiz}>
                Laat zien
              </button>
            </div>
            {t.rounds > 0 && (
              <p class="hint">
                {t.rounds} {t.rounds === 1 ? 'ronde' : 'rondes'} · gemiddeld {Math.round(t.total / t.rounds)} punten
              </p>
            )}
          </div>
        ) : (
          <button class="big-btn wide primary" onClick={() => newKeeperQuiz(t.level)}>
            Start de keepertrainer
          </button>
        )}
      </Section>

      <Section title="Scenario-generator" hint="Willekeurige bal en aanvallers. De spelers wijzen aan waar de verdediging hoort; tik daarna op Toon.">
        <Segmented value={t.level} options={LEVELS} onChange={setLevel} />
        {t.kind === 'scenario' && (
          <div class="train-card">
            <p>
              Verdediging: <b>{t.mode ? modeLabel(t.mode) : ''}</b>
            </p>
            <div class="btn-grid">
              <button class="big-btn primary" disabled={t.shown} onClick={showScenario}>
                Toon
              </button>
              <button class="big-btn" onClick={() => newScenario(t.level)}>
                Nieuw scenario
              </button>
            </div>
          </div>
        )}
        {t.kind !== 'scenario' && (
          <button class="big-btn wide primary" onClick={() => newScenario(t.level)}>
            Nieuw scenario
          </button>
        )}
      </Section>

      <Section title="Overtal-trainer" hint="Uitbraak met de beste oplossing, stap voor stap en in een lus.">
        <div class="btn-grid three-col">
          {OVERLOADS.map((o) => (
            <button key={o.id} class="big-btn" onClick={() => startOverload(o.id, speed())} title={o.hint}>
              {o.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Strafworp en start">
        <div class="btn-grid">
          <button class="big-btn" onClick={() => startPenalty(speed())}>
            Strafworp
          </button>
          <button class="big-btn" onClick={() => startSprint(speed())}>
            Start (sprint)
          </button>
        </div>
      </Section>

      {t.kind && (
        <button class="chip wide" onClick={stopTrainer}>
          Stoppen met {t.kind === 'quiz' ? 'de quiz' : t.kind === 'keeper' ? 'de keepertrainer' : 'de scenario-generator'}
        </button>
      )}
    </div>
  )
}
