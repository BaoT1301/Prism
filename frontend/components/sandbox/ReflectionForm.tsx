import type { ReflectionAnswer, ReflectionQuestion } from "../../features/sandbox/sandbox-types";

/** The three multiple-choice stems, phrased around the formula's output noun. */
function choicesFor(outputNoun: string): string[] {
  return [`${outputNoun} increases`, `${outputNoun} decreases`, `${outputNoun} stays the same`];
}

export function ReflectionForm({
  questions,
  answers,
  onChange,
  outputNoun = "Force",
}: {
  questions: ReflectionQuestion[];
  answers: ReflectionAnswer[];
  onChange: (answers: ReflectionAnswer[]) => void;
  outputNoun?: string;
}) {
  const choices = choicesFor(outputNoun);
  const setAnswer = (questionId: string, answer: string) => onChange([...answers.filter((item) => item.question_id !== questionId), { question_id: questionId, answer }]);

  return (
    <section className="reflection-card">
      <p className="card-kicker">Make your discovery</p>
      <h2>Reflection</h2>
      {questions.map((question) => {
        const current = answers.find((answer) => answer.question_id === question.id)?.answer ?? "";
        const selected = choices.find((choice) => current.startsWith(choice));
        // Strip the "<choice>. " prefix to recover just the free-text explanation.
        const explanation = selected ? current.slice(selected.length).replace(/^\.\s*/, "") : current;
        const headingId = `reflection-question-${question.id}`;
        // Re-compose the stored answer as "<choice>. <explanation>", preserving
        // whichever side was not just edited so switching a choice never wipes text.
        const compose = (choice: string | undefined, text: string) => `${choice ? `${choice}.` : ""}${choice && text ? " " : ""}${text}`;
        return (
          <div className="reflection-question" key={question.id}>
            <h3 id={headingId}>{question.question}</h3>
            <div className="answer-choices" role="radiogroup" aria-labelledby={headingId}>
              {choices.map((choice, index) => (
                <label className={selected === choice ? "selected" : ""} key={choice}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={selected === choice}
                    data-testid={`reflection-${question.id}-choice-${index}`}
                    onChange={() => setAnswer(question.id, compose(choice, explanation))}
                  />
                  {choice}
                </label>
              ))}
            </div>
            <label className="explanation-label">
              Explain your thinking
              <textarea
                placeholder="Add a short explanation..."
                value={explanation}
                data-testid={`reflection-${question.id}-explanation`}
                onChange={(event) => setAnswer(question.id, compose(selected, event.target.value))}
              />
            </label>
          </div>
        );
      })}
    </section>
  );
}
