"use client";

import { useSuspenseQuery } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Plus, Star, StarOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { DeleteGroupDialog } from "@/features/group/components/delete-group-dialog";
import { useDeleteGroupModal } from "@/features/group/hooks/use-delete-group-modal";
import { useGroupMutations } from "@/features/group/hooks/use-group-mutations";
import { NewGroupModal } from "@/features/sidebar/components/new-group-modal";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { AmountWithCurrency } from "@/shared/components/amount-with-currency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/shared/components/ui/sidebar";

export function NavGroups() {
  const { isMobile } = useSidebar();
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const { data } = useSuspenseQuery(getUserGroups);
  const { data: currentUser } = useSuspenseQuery(userInfo);

  const deleteGroupModal = useDeleteGroupModal();
  const groupMutations = useGroupMutations("");

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="text-base">Groups</SidebarGroupLabel>
      <SidebarGroupAction onClick={() => setNewGroupOpen(true)}>
        <Plus className="size-6" />
        <span className="sr-only">New Group</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        {data.groups.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">You don't have any groups yet.</p>
        ) : (
          <SidebarMenu>
            {data.groups.map((item) => (
              <SidebarMenuItem key={item.groupId}>
                <SidebarMenuButton
                  className="h-auto"
                  render={
                    <Link to="/group/$groupId" params={{ groupId: item.groupId }}>
                      <div className="flex flex-col">
                        <strong className="flex items-center gap-1.5">
                          {item.pinned && <Star className="size-3.5 fill-current text-money shrink-0" />}
                          {item.groupName}
                        </strong>
                        <AmountWithCurrency
                          balance={item.memberBalances.find((balance) => balance.userId === currentUser.id)!.balance}
                        />
                      </div>
                    </Link>
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuAction showOnHover>
                        <MoreHorizontal />
                        <span className="sr-only">More</span>
                      </SidebarMenuAction>
                    }
                  />
                  <DropdownMenuContent
                    className="w-48"
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                  >
                    <DropdownMenuItem onClick={() => groupMutations.setGroupPinned(item.groupId, !item.pinned)}>
                      {item.pinned ? <StarOff /> : <Star />}
                      <span>{item.pinned ? "Unpin Group" : "Pin Group"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        deleteGroupModal.confirmDelete({
                          groupId: item.groupId,
                          groupName: item.groupName,
                        })
                      }
                    >
                      <Trash2 className="text-muted-foreground" />
                      <span>Delete Group</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarGroupContent>

      {/* Delete Group Confirmation Dialog */}
      <DeleteGroupDialog {...deleteGroupModal.dialogProps} />
      <NewGroupModal open={newGroupOpen} onOpenChange={setNewGroupOpen} />
    </SidebarGroup>
  );
}
