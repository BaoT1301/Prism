// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SubmissionReview } from "./SubmissionReview";
import type { Review, SubmissionDetail } from "../../features/teacher/teacher-api";

const baseDetail: SubmissionDetail = {
  submission_id: "s1",
  assignment_id: "a1",
  student_id: "st1",
  student_name: "Ada Lovelace",
  status: "submitted",
  submitted_at: "2026-01-03T10:00:00Z",
  responses_snapshot: { mass: 0.6, acceleration: 3 },
  reflection_answers: [{ question_id: "q1", answer: "Force increases. because mass grew" }],
  review: null,
};

const savedReview: Review = {
  id: "r1",
  submission_id: "s1",
  score: 88,
  feedback: "Great work",
  reviewer_name: "Mr. Byron",
  reviewed_at: "2026-01-04T10:00:00Z",
};

describe("SubmissionReview", () => {
  it("shows the student's responses and reflection answers", () => {
    render(<SubmissionReview detail={baseDetail} onSave={vi.fn()} />);
    const panel = screen.getByTestId("submission-review");
    expect(panel).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("mass")).toBeTruthy();
    expect(screen.getByText("Force increases. because mass grew")).toBeTruthy();
  });

  it("submits the entered score + feedback and reflects the saved state", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(savedReview);
    render(<SubmissionReview detail={baseDetail} onSave={onSave} />);

    await user.type(screen.getByTestId("review-score"), "88");
    await user.type(screen.getByTestId("review-feedback"), "Great work");
    await user.click(screen.getByTestId("save-review"));

    expect(onSave).toHaveBeenCalledWith({ score: 88, feedback: "Great work" });
    // After the PUT resolves the saved review is reflected.
    expect(await screen.findByText(/Reviewed · 88\/100/)).toBeTruthy();
    expect(screen.getByText("Feedback saved.")).toBeTruthy();
  });

  it("blocks an out-of-range score client-side and never calls save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SubmissionReview detail={baseDetail} onSave={onSave} />);

    await user.type(screen.getByTestId("review-score"), "150");
    await user.click(screen.getByTestId("save-review"));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/0 to 100/);
  });

  it("pre-fills the form and status when a review already exists", () => {
    render(<SubmissionReview detail={{ ...baseDetail, review: { ...savedReview, score: 72, feedback: "Nice job" } }} onSave={vi.fn()} />);
    expect((screen.getByTestId("review-score") as HTMLInputElement).value).toBe("72");
    expect((screen.getByTestId("review-feedback") as HTMLTextAreaElement).value).toBe("Nice job");
    expect(screen.getByText(/Reviewed · 72\/100/)).toBeTruthy();
  });
});
