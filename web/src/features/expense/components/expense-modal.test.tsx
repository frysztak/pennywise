import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { ExpenseModal } from "@/features/expense/components/expense-modal";
import { type CreateExpenseRequest, ExpenseService } from "@/gen/api/v1/expense_pb";
import { MemberBalanceSchema } from "@/gen/api/v1/group_pb";
import { renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const members = [
  create(MemberBalanceSchema, { userId: "u-alice", userName: "Alice", weight: 1, balance: {} }),
  create(MemberBalanceSchema, { userId: "u-bob", userName: "Bob", weight: 1, balance: {} }),
];

interface Overrides {
  onCreate?: (req: CreateExpenseRequest) => void;
  createError?: ConnectError;
  onOpenChange?: (open: boolean) => void;
}

function renderModal(overrides: Overrides = {}) {
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const transport = createRouterTransport(({ service }) => {
    service(ExpenseService, {
      createExpense: (req) => {
        if (overrides.createError) throw overrides.createError;
        overrides.onCreate?.(req);
        return { id: "exp-new", name: req.name };
      },
    });
  });

  renderWithProviders(
    <ExpenseModal
      open
      onOpenChange={onOpenChange}
      mode="create"
      groupId="grp-1"
      groupMembers={members}
      currentUserId="u-alice"
      defaultCurrency="USD"
      currencies={["USD", "EUR"]}
    />,
    { transport },
  );
  return { onOpenChange };
}

const fillName = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Dinner, groceries, etc."), { target: { value } });
const fillAmount = (value: string) => fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value } });
// The submit button sits outside <form> and is linked via the `form` attribute.
// jsdom doesn't trigger submission for that association, so submit the form directly.
const submit = () => fireEvent.submit(document.getElementById("expense-form")!);

describe("ExpenseModal (create mode)", () => {
  it("blocks submit and shows a validation error when the name is empty", async () => {
    const onCreate = vi.fn();
    renderModal({ onCreate });

    submit();

    expect(await screen.findByText("Name must be at least 2 characters")).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("submits the expense and reports success", async () => {
    const onCreate = vi.fn();
    const { onOpenChange } = renderModal({ onCreate });

    fillName("Dinner");
    fillAmount("30");
    submit();

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const req = onCreate.mock.calls[0][0];
    expect(req.name).toBe("Dinner");
    expect(req.amount).toBe(30); // dollars; the backend converts to cents
    expect(req.currency).toBe("USD");
    expect(req.groupId).toBe("grp-1");
    expect(req.payerId).toBe("u-alice");
    expect(req.beneficiariesIds).toEqual(expect.arrayContaining(["u-alice", "u-bob"]));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Expense created!"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("surfaces a server error via toast and keeps the modal open", async () => {
    const onOpenChange = vi.fn();
    renderModal({ createError: new ConnectError("Server is down", Code.Internal), onOpenChange });

    fillName("Dinner");
    fillAmount("30");
    submit();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Server is down")));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
