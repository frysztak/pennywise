"use client";

import { useSuspenseQuery } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/sidebar";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { useDeleteGroupModal } from "@/hooks/use-delete-group-modal";

import { AmountWithCurrency } from "../amount-with-currency";
import { DeleteGroupDialog } from "../group/delete-group-dialog";
import { NewGroupModal } from "./new-group-modal";

export function NavGroups() {
  const { isMobile } = useSidebar();

  const { data } = useSuspenseQuery(getUserGroups);
  const { data: currentUser } = useSuspenseQuery(userInfo);

  const deleteGroupModal = useDeleteGroupModal();

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Groups</SidebarGroupLabel>
      <SidebarGroupAction title="Add Group">
        <NewGroupModal>
          <span>
            <Plus /> <span className="sr-only">Add Group</span>
          </span>
        </NewGroupModal>
      </SidebarGroupAction>
      <SidebarGroupContent>
        {data.groups.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">You don't have any groups yet</p>
        ) : (
          <SidebarMenu>
            {data.groups.map((item) => (
              <SidebarMenuItem key={item.groupId}>
                <SidebarMenuButton asChild className="h-auto">
                  <Link to="/group/$groupId" params={{ groupId: item.groupId }}>
                    <div className="flex flex-col">
                      <strong>{item.groupName}</strong>
                      <AmountWithCurrency
                        balance={item.memberBalances.find((balance) => balance.userId === currentUser.id)!.balance}
                      />
                    </div>
                  </Link>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontal />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-48"
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                  >
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
    </SidebarGroup>
  );
}
