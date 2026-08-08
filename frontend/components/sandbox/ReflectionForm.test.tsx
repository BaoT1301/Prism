// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ReflectionForm } from "./ReflectionForm";
import type { ReflectionAnswer } from "../../features/sandbox/sandbox-types";

function Harness() {
  const [answers, setAnswers] = useState<ReflectionAnswer[]>([]);
  return <ReflectionForm questions={[{ id: "q1", question: "What happens to force?" }]} answers={answers} onChange={setAnswers} />;
}

describe("ReflectionForm", () => {
  it("preserves the typed explanation when the multiple-choice answer changes", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const explanation = screen.getByTestId("reflection-q1-explanation") as HTMLTextAreaElement;
    await user.type(explanation, "because acceleration is constant");
    await user.click(screen.getByTestId("reflection-q1-choice-0")); // Force increases
    expect(explanation.value).toBe("because acceleration is constant");

    // Switching the choice must NOT wipe the explanation (the M1 regression).
    await user.click(screen.getByTestId("reflection-q1-choice-1")); // Force decreases
    expect(explanation.value).toBe("because acceleration is constant");
    expect((screen.getByTestId("reflection-q1-choice-1") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("reflection-q1-choice-0") as HTMLInputElement).checked).toBe(false);
  });

  it("labels each radiogroup with its own question for screen readers", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup");
    const heading = screen.getByRole("heading", { name: "What happens to force?" });
    expect(heading.id).toBe("reflection-question-q1");
    expect(group.getAttribute("aria-labelledby")).toBe(heading.id);
  });
});
