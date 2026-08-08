// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClassSettings, RegenerateCode, Roster } from "./TeacherApp";
import type { ClassSummary, Collection, Member, TeacherApi } from "./teacher-api";

const baseClass: ClassSummary = {
  id: "c1",
  name: "Physics 101",
  subject: "Physics",
  grade_level: "10",
  description: "Intro",
  join_code: "ABC123",
  student_count: 2,
  assignment_count: 1,
  created_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

const members: Member[] = [
  { student_id: "st1", display_name: "Ada Lovelace", joined_at: "2026-01-02T10:00:00Z" },
  { student_id: "st2", display_name: "Alan Turing", joined_at: "2026-01-03T10:00:00Z" },
];

function memberResource(items: Member[]): { data: Collection<Member>; error?: string; loading: boolean; authExpired: boolean; reload: () => void } {
  return { data: { items, total: items.length }, error: undefined, loading: false, authExpired: false, reload: vi.fn() };
}

describe("ClassSettings", () => {
  it("renames a class through the update endpoint and reflects the returned class", async () => {
    const user = userEvent.setup();
    const updated: ClassSummary = { ...baseClass, name: "Quantum 201", description: "Intro" };
    const api: Pick<TeacherApi, "updateClass" | "archiveClass" | "unarchiveClass"> = {
      updateClass: vi.fn(async () => updated),
      archiveClass: vi.fn(async () => baseClass),
      unarchiveClass: vi.fn(async () => baseClass),
    };
    const onClassChange = vi.fn();
    render(<ClassSettings api={api} currentClass={baseClass} onClassChange={onClassChange} />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const form = screen.getByTestId("rename-class");
    const nameInput = within(form).getByLabelText("Class name");
    await user.clear(nameInput);
    await user.type(nameInput, "Quantum 201");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(api.updateClass).toHaveBeenCalledWith("c1", { name: "Quantum 201", description: "Intro" });
    expect(onClassChange).toHaveBeenCalledWith(updated);
    expect(await screen.findByText("Class updated.")).toBeTruthy();
  });

  it("archives an active class through the archive endpoint", async () => {
    const user = userEvent.setup();
    const archived: ClassSummary = { ...baseClass, archived_at: "2026-02-01T00:00:00Z" };
    const api: Pick<TeacherApi, "updateClass" | "archiveClass" | "unarchiveClass"> = {
      updateClass: vi.fn(async () => baseClass),
      archiveClass: vi.fn(async () => archived),
      unarchiveClass: vi.fn(async () => baseClass),
    };
    const onClassChange = vi.fn();
    render(<ClassSettings api={api} currentClass={baseClass} onClassChange={onClassChange} />);

    await user.click(screen.getByTestId("archive-class"));

    expect(api.archiveClass).toHaveBeenCalledWith("c1");
    expect(api.unarchiveClass).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onClassChange).toHaveBeenCalledWith(archived));
  });

  it("unarchives an archived class through the unarchive endpoint", async () => {
    const user = userEvent.setup();
    const archived: ClassSummary = { ...baseClass, archived_at: "2026-02-01T00:00:00Z" };
    const revived: ClassSummary = { ...baseClass, archived_at: null };
    const api: Pick<TeacherApi, "updateClass" | "archiveClass" | "unarchiveClass"> = {
      updateClass: vi.fn(async () => baseClass),
      archiveClass: vi.fn(async () => archived),
      unarchiveClass: vi.fn(async () => revived),
    };
    const onClassChange = vi.fn();
    render(<ClassSettings api={api} currentClass={archived} onClassChange={onClassChange} />);

    await user.click(screen.getByRole("button", { name: "Unarchive class" }));

    expect(api.unarchiveClass).toHaveBeenCalledWith("c1");
    await vi.waitFor(() => expect(onClassChange).toHaveBeenCalledWith(revived));
  });
});

describe("Roster", () => {
  it("removes a member after confirmation and optimistically drops them from the list", async () => {
    const user = userEvent.setup();
    const api: Pick<TeacherApi, "removeMember"> = { removeMember: vi.fn(async () => undefined) };
    render(<Roster api={api} classId="c1" resource={memberResource(members)} />);

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    await user.click(screen.getByTestId("remove-member-st1"));
    await user.click(screen.getByTestId("confirm-remove-member"));

    expect(api.removeMember).toHaveBeenCalledWith("c1", "st1");
    await vi.waitFor(() => expect(screen.queryByText("Ada Lovelace")).toBeNull());
    expect(screen.getByText("Alan Turing")).toBeTruthy();
  });

  it("restores the member and surfaces an error when removal fails", async () => {
    const user = userEvent.setup();
    const api: Pick<TeacherApi, "removeMember"> = { removeMember: vi.fn(async () => { throw new Error("Server said no"); }) };
    render(<Roster api={api} classId="c1" resource={memberResource(members)} />);

    await user.click(screen.getByTestId("remove-member-st1"));
    await user.click(screen.getByTestId("confirm-remove-member"));

    expect(await screen.findByText("Server said no")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });
});

describe("RegenerateCode", () => {
  it("regenerates the join code after confirmation and hands back the new code", async () => {
    const user = userEvent.setup();
    const api: Pick<TeacherApi, "regenerateJoinCode"> = { regenerateJoinCode: vi.fn(async () => ({ join_code: "NEW999" })) };
    const onRegenerated = vi.fn();
    render(<RegenerateCode api={api} classId="c1" onRegenerated={onRegenerated} />);

    await user.click(screen.getByTestId("regenerate-code"));
    await user.click(screen.getByTestId("confirm-regenerate-code"));

    expect(api.regenerateJoinCode).toHaveBeenCalledWith("c1");
    await vi.waitFor(() => expect(onRegenerated).toHaveBeenCalledWith("NEW999"));
  });
});
