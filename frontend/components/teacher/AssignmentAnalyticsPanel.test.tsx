// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssignmentAnalyticsPanel } from "./AssignmentAnalyticsPanel";
import type { AssignmentAnalytics } from "../../features/teacher/teacher-api";

const analytics: AssignmentAnalytics = {
  assignment_id: "a1",
  roster_total: 10,
  funnel: { not_started: 2, in_progress: 3, submitted: 5 },
  completion_rate: 0.5,
  hints: { average: 1.4, max: 4 },
  median_seconds_to_submit: 185, // 3m 5s
  reflection_breakdown: [
    {
      question_id: "q1",
      prompt: "What happens to force?",
      responses: 5,
      choices: [
        { label: "Force increases", count: 3 },
        { label: "Force decreases", count: 1 },
        { label: "Stays the same", count: 1 },
      ],
    },
  ],
};

describe("AssignmentAnalyticsPanel", () => {
  it("renders the headline figures with formatted values", () => {
    render(<AssignmentAnalyticsPanel analytics={analytics} />);
    const panel = screen.getByTestId("assignment-analytics");
    expect(within(panel).getByText("50%")).toBeTruthy(); // completion rate
    expect(within(panel).getByText("1.4")).toBeTruthy(); // avg hints (one decimal)
    expect(within(panel).getByText("4")).toBeTruthy(); // max hints
    expect(within(panel).getByText("3m 5s")).toBeTruthy(); // median seconds → Xm Ys
  });

  it("renders every funnel stage with its label", () => {
    render(<AssignmentAnalyticsPanel analytics={analytics} />);
    const panel = screen.getByTestId("assignment-analytics");
    expect(within(panel).getByText("Submitted")).toBeTruthy();
    expect(within(panel).getByText("In progress")).toBeTruthy();
    expect(within(panel).getByText("Not started")).toBeTruthy();
    expect(within(panel).getByText("10 students")).toBeTruthy();
  });

  it("renders the per-reflection choice breakdown", () => {
    render(<AssignmentAnalyticsPanel analytics={analytics} />);
    const panel = screen.getByTestId("assignment-analytics");
    expect(within(panel).getByText("What happens to force?")).toBeTruthy();
    expect(within(panel).getByText("Force increases")).toBeTruthy();
    expect(within(panel).getByText("Force decreases")).toBeTruthy();
    expect(within(panel).getByText("5 responses")).toBeTruthy();
  });

  it("shows an em dash when median time-to-submit is null", () => {
    render(<AssignmentAnalyticsPanel analytics={{ ...analytics, median_seconds_to_submit: null }} />);
    const panel = screen.getByTestId("assignment-analytics");
    expect(within(panel).getByText("—")).toBeTruthy();
  });
});
