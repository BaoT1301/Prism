// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeleteAccountControl } from "./AppChrome";

describe("DeleteAccountControl", () => {
  it("confirms, deletes the account, then signs the user out", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn(async () => undefined);
    const onSignOut = vi.fn(async () => undefined);
    render(<DeleteAccountControl deleteAccount={deleteAccount} onSignOut={onSignOut} />);

    // The confirm dialog is not shown until the user opts in.
    expect(screen.queryByTestId("confirm-delete-account")).toBeNull();

    await user.click(screen.getByTestId("delete-account"));
    expect(screen.getByText(/permanently removes your account/i)).toBeTruthy();

    await user.click(screen.getByTestId("confirm-delete-account"));

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });

  it("keeps the session and surfaces an error when deletion fails", async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn(async () => { throw new Error("Could not reach the server"); });
    const onSignOut = vi.fn(async () => undefined);
    render(<DeleteAccountControl deleteAccount={deleteAccount} onSignOut={onSignOut} />);

    await user.click(screen.getByTestId("delete-account"));
    await user.click(screen.getByTestId("confirm-delete-account"));

    expect(await screen.findByText("Could not reach the server")).toBeTruthy();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
