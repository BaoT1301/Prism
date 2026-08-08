// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentFeedback } from "./StudentFeedback";
import type { StudentSubmission } from "../../features/student/student-api";

const submissions: StudentSubmission[] = [
  {
    assignment_id: "a1",
    assignment_title: "Newton's Second Law",
    submitted_at: "2026-01-03T10:00:00Z",
    review: { score: 91, feedback: "Excellent reasoning.", reviewed_at: "2026-01-04T12:00:00Z" },
  },
  {
    assignment_id: "a2",
    assignment_title: "Ohm's Law Lab",
    submitted_at: "2026-01-05T10:00:00Z",
    review: null,
  },
];

describe("StudentFeedback", () => {
  it("shows the score and feedback for a reviewed submission", () => {
    render(<StudentFeedback submissions={submissions} loading={false} />);
    const panel = screen.getByTestId("student-feedback");
    expect(within(panel).getByText("Newton's Second Law")).toBeTruthy();
    expect(within(panel).getByText("91")).toBeTruthy();
    expect(within(panel).getByText("Excellent reasoning.")).toBeTruthy();
  });

  it("shows an awaiting-review state for an unreviewed submission", () => {
    render(<StudentFeedback submissions={submissions} loading={false} />);
    const panel = screen.getByTestId("student-feedback");
    expect(within(panel).getByText("Ohm's Law Lab")).toBeTruthy();
    expect(within(panel).getByText("Awaiting review")).toBeTruthy();
  });

  it("renders the empty state when there are no submissions", () => {
    render(<StudentFeedback submissions={[]} loading={false} />);
    expect(screen.getByTestId("student-feedback")).toBeTruthy();
    expect(screen.getByText("No submissions yet.")).toBeTruthy();
  });
});
