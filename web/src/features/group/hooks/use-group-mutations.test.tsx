import { createRouterTransport } from "@connectrpc/connect";
import { createConnectQueryKey } from "@connectrpc/connect-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useGroupMutations } from "@/features/group/hooks/use-group-mutations";
import { ExpenseService } from "@/gen/api/v1/expense_pb";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness({ groupId }: { groupId: string }) {
  const { deleteExpense } = useGroupMutations(groupId);
  return <button onClick={() => deleteExpense({ id: "exp-1", groupId })}>delete</button>;
}

describe("useGroupMutations", () => {
  it("toasts and invalidates the activity + groups caches on a successful expense delete", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(ExpenseService, { deleteExpense: () => ({}) });
    });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(<Harness groupId="grp-1" />, { transport, queryClient });
    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Expense deleted!"));

    const userGroupsKey = createConnectQueryKey({ schema: getUserGroups, cardinality: "finite" });
    const activityKey = createConnectQueryKey({
      schema: getGroupActivity,
      cardinality: "finite",
      input: { groupId: "grp-1" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: activityKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userGroupsKey });
  });
});
