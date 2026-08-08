import { type FormEvent, useState } from "react";

import type { Review, ReviewInput, SubmissionDetail } from "../../features/teacher/teacher-api";
import { ensureArray } from "../../lib/guards";
import { formatDateTime } from "../../lib/format";
import { Notice } from "../AsyncState";

/** Renders a snapshot response value cleanly: integers as-is, decimals to 2 places. */
function formatResponseValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Parses the score field: blank is valid (null); otherwise a whole number 0–100. */
function parseScore(raw: string): { valid: boolean; value: number | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { valid: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return { valid: false, value: null };
  return { valid: true, value: parsed };
}

/**
 * Teacher review of a single submission: the student's variable responses and
 * reflection answers, plus a score (0–100, optional) + feedback form that PUTs
 * the review and reflects the saved state. An existing review is shown and
 * pre-fills the form.
 */
export function SubmissionReview({ detail, onSave }: { detail: SubmissionDetail; onSave: (body: ReviewInput) => Promise<Review> }) {
  const [review, setReview] = useState<Review | null>(detail.review);
  const [score, setScore] = useState(review?.score != null ? String(review.score) : "");
  const [feedback, setFeedback] = useState(review?.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const responses = Object.entries(detail.responses_snapshot ?? {});
  const reflections = ensureArray(detail.reflection_answers);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseScore(score);
    if (!parsed.valid) {
      setError("Score must be a whole number from 0 to 100, or left blank.");
      return;
    }
    setError(undefined);
    setSaved(false);
    setSaving(true);
    void onSave({ score: parsed.value, feedback })
      .then((result) => { setReview(result); setSaved(true); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not save the review."))
      .finally(() => setSaving(false));
  };

  return (
    <section className="submission-review" data-testid="submission-review">
      <div className="review-summary">
        <div>
          <p className="card-kicker">Submission</p>
          <h3>{detail.student_name}</h3>
          <p className="muted">Submitted {formatDateTime(detail.submitted_at, "date unavailable")}</p>
        </div>
        {review && (
          <span className="status-pill submitted review-status">
            Reviewed{review.score != null ? ` · ${review.score}/100` : ""}
          </span>
        )}
      </div>

      <div className="review-evidence">
        <div className="review-block">
          <p className="card-kicker">Variable responses</p>
          {responses.length > 0 ? (
            <dl className="review-responses">
              {responses.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{formatResponseValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted">No recorded responses.</p>
          )}
        </div>
        <div className="review-block">
          <p className="card-kicker">Reflection answers</p>
          {reflections.length > 0 ? (
            <ol className="review-reflections">
              {reflections.map((answer, index) => (
                <li key={answer.question_id || index}>
                  <span className="review-reflection-index">Reflection {index + 1}</span>
                  <p>{answer.answer || "No answer recorded."}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No reflection answers.</p>
          )}
        </div>
      </div>

      <form className="review-form form" onSubmit={submit}>
        <div className="form-section-heading">
          <span aria-hidden="true">★</span>
          <div>
            <h2>Grade &amp; feedback</h2>
            <p>Add an optional score and written feedback. The student sees this in their feedback view.</p>
          </div>
        </div>
        {error && <Notice error={error} />}
        <div className="review-form-grid">
          <label className="field">
            <span>Score</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={score}
              placeholder="0–100"
              aria-describedby="review-score-hint"
              data-testid="review-score"
              onChange={(event) => { setScore(event.target.value); setSaved(false); }}
            />
            <small id="review-score-hint">Optional whole number, 0–100. Leave blank for feedback-only.</small>
          </label>
          <label className="field">
            <span>Feedback</span>
            <textarea
              rows={5}
              value={feedback}
              placeholder="What did this student do well? What could they revisit?"
              data-testid="review-feedback"
              onChange={(event) => { setFeedback(event.target.value); setSaved(false); }}
            />
          </label>
        </div>
        <div className="form-submit-row">
          <p className={saved ? "success-note" : "muted"}>
            {saved
              ? "Feedback saved."
              : review
                ? `Last reviewed ${formatDateTime(review.reviewed_at)}${review.reviewer_name ? ` by ${review.reviewer_name}` : ""}`
                : "Not yet reviewed."}
          </p>
          <button type="submit" data-testid="save-review" disabled={saving}>
            {saving ? "Saving..." : review ? "Update review" : "Save review"}
          </button>
        </div>
      </form>
    </section>
  );
}
