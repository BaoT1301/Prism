export function CompletionScreen({
  title,
  completedSteps,
  totalSteps,
  hintsUsed,
  submittedAt,
  onExit,
}: {
  title: string;
  completedSteps: number;
  totalSteps: number;
  hintsUsed: number;
  submittedAt: string;
  onExit?: () => void;
}) {
  const submittedLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(submittedAt));

  return (
    <main className="completion-screen">
      <section className="completion-card">
        <div className="completion-orbit" aria-hidden="true"><span /><span /><i>✦</i></div>
        <p className="eyebrow">Mission complete</p>
        <h1>You made<br /><em>the connection.</em></h1>
        <p className="completion-summary">You completed <strong>{title}</strong>, explored the model, and captured what you discovered.</p>
        <div className="completion-metrics" aria-label="Mission summary">
          <div><strong>{completedSteps}/{totalSteps}</strong><span>Steps completed</span></div>
          <div><strong>{hintsUsed}</strong><span>{hintsUsed === 1 ? "Hint used" : "Hints used"}</span></div>
          <div><strong>✓</strong><span>Work submitted</span></div>
        </div>
        <p className="submission-note">Submitted {submittedLabel}. Your teacher can now see that this mission is complete.</p>
        {onExit && <button type="button" onClick={onExit}>Back to learning <span aria-hidden="true">→</span></button>}
      </section>
    </main>
  );
}
