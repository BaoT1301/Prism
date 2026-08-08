import type { StudentSubmission } from "../../features/student/student-api";
import { formatDateTime } from "../../lib/format";
import { AsyncState, Skeleton } from "../AsyncState";

/**
 * Student-facing feedback list: every submission the student has made, newest
 * first, showing the submitted date and — once a teacher has reviewed it — the
 * score and written feedback. Unreviewed submissions read "Awaiting review".
 */
export function StudentFeedback({ submissions, loading, error }: { submissions: StudentSubmission[]; loading: boolean; error?: string }) {
  return (
    <section className="content-section" data-testid="student-feedback">
      <div className="section-title-row">
        <div><p className="eyebrow">Your results</p><h2>Feedback</h2></div>
        <p>Scores and notes from your teacher appear here as your work is reviewed.</p>
      </div>
      <AsyncState
        loading={loading}
        error={error}
        isEmpty={!submissions.length}
        skeleton={<Skeleton rows={2} className="assignment-skeleton" />}
        empty={<div className="empty-state"><span aria-hidden="true">—</span><div><h3>No submissions yet.</h3><p>Finish an assignment and your feedback will show up here.</p></div></div>}
      >
        <ul className="feedback-list">
          {submissions.map((item, index) => {
            const review = item.review;
            return (
              <li className="feedback-card" key={`${item.assignment_id}-${index}`}>
                <div className="feedback-card-head">
                  <div>
                    <p className="eyebrow">Submitted {formatDateTime(item.submitted_at)}</p>
                    <h3>{item.assignment_title}</h3>
                  </div>
                  {review ? (
                    <span className="feedback-score">
                      <strong>{review.score != null ? review.score : "✓"}</strong>
                      <small>{review.score != null ? "/100" : "reviewed"}</small>
                    </span>
                  ) : (
                    <span className="status-pill in_progress">Awaiting review</span>
                  )}
                </div>
                {review
                  ? (review.feedback
                      ? <p className="feedback-note">{review.feedback}</p>
                      : <p className="muted">Your teacher marked this reviewed without written feedback.</p>)
                  : <p className="muted">Your teacher hasn't reviewed this submission yet.</p>}
                {review && review.reviewed_at && <p className="feedback-meta">Reviewed {formatDateTime(review.reviewed_at)}</p>}
              </li>
            );
          })}
        </ul>
      </AsyncState>
    </section>
  );
}
