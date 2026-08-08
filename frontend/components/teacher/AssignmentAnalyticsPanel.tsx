import type { AssignmentAnalytics } from "../../features/teacher/teacher-api";
import { ensureArray } from "../../lib/guards";
import { formatDuration } from "../../lib/format";

/** Percentage width for a bar, clamped to 0–100 and safe against a zero denominator. */
function widthPct(part: number, whole: number): string {
  if (!(whole > 0)) return "0%";
  return `${Math.min(100, Math.max(0, (part / whole) * 100))}%`;
}

/**
 * Hand-built, chart-library-free analytics for a single assignment: a completion
 * funnel, headline figures (completion rate, hints, median time-to-submit), and a
 * per-reflection choice breakdown — all as proportioned CSS bars in the editorial
 * design system, with tabular-nums figures.
 */
export function AssignmentAnalyticsPanel({ analytics }: { analytics: AssignmentAnalytics }) {
  const { roster_total, funnel, completion_rate, hints } = analytics;
  const reflections = ensureArray(analytics.reflection_breakdown);
  const completionPct = Math.round(Math.min(1, Math.max(0, completion_rate)) * 100);
  const avgHints = hints.average.toFixed(1);

  // Ordered most-progressed first so the "good" outcome reads at the top.
  const stages: { key: "submitted" | "in_progress" | "not_started"; label: string; count: number }[] = [
    { key: "submitted", label: "Submitted", count: funnel.submitted },
    { key: "in_progress", label: "In progress", count: funnel.in_progress },
    { key: "not_started", label: "Not started", count: funnel.not_started },
  ];

  return (
    <section className="analytics-panel" data-testid="assignment-analytics" aria-label="Assignment analytics">
      <div className="analytics-figures">
        <div className="analytics-figure analytics-figure-lead">
          <span className="analytics-figure-value">{completionPct}%</span>
          <span className="analytics-figure-label">Completion rate</span>
        </div>
        <div className="analytics-figure">
          <span className="analytics-figure-value">{avgHints}</span>
          <span className="analytics-figure-label">Avg hints used</span>
        </div>
        <div className="analytics-figure">
          <span className="analytics-figure-value">{hints.max}</span>
          <span className="analytics-figure-label">Most hints used</span>
        </div>
        <div className="analytics-figure">
          <span className="analytics-figure-value">{formatDuration(analytics.median_seconds_to_submit)}</span>
          <span className="analytics-figure-label">Median time to submit</span>
        </div>
      </div>

      <div className="analytics-funnel">
        <div className="analytics-subhead">
          <p className="card-kicker">Progress funnel</p>
          <span>{roster_total} {roster_total === 1 ? "student" : "students"}</span>
        </div>
        <ul className="funnel-bars">
          {stages.map((stage) => (
            <li className={`funnel-row funnel-${stage.key}`} key={stage.key}>
              <span className="funnel-label">{stage.label}</span>
              <div className="funnel-track"><span style={{ width: widthPct(stage.count, roster_total) }} aria-hidden="true" /></div>
              <span className="funnel-count">{stage.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {reflections.length > 0 && (
        <div className="analytics-reflections">
          <div className="analytics-subhead"><p className="card-kicker">Reflection responses</p></div>
          {reflections.map((reflection, index) => {
            const choices = ensureArray(reflection.choices);
            return (
              <div className="reflection-breakdown" key={reflection.question_id || index}>
                <div className="reflection-breakdown-head">
                  <h4>{reflection.prompt || `Reflection ${index + 1}`}</h4>
                  <span>{reflection.responses} {reflection.responses === 1 ? "response" : "responses"}</span>
                </div>
                <ul className="choice-bars">
                  {choices.map((choice, choiceIndex) => (
                    <li className="choice-row" key={`${choice.label}-${choiceIndex}`}>
                      <span className="choice-label">{choice.label || "—"}</span>
                      <div className="choice-track"><span style={{ width: widthPct(choice.count, reflection.responses) }} aria-hidden="true" /></div>
                      <span className="choice-count">{choice.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
