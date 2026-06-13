import { useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Settings, ShieldUser } from "lucide-react";
import { useTranslation } from "react-i18next";

import { logout } from "@/gen/api/v1/auth-AuthService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { UserRole } from "@/gen/api/v1/user_pb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/shared/components/ui/sidebar";
import { UserAvatar } from "@/shared/components/user-avatar";

export function NavUser() {
  const { isMobile } = useSidebar();
  const { data } = useSuspenseQuery(userInfo);
  const { mutate } = useMutation(logout);
  const router = useRouter();
  const { t } = useTranslation();

  const onLogoutClicked = () => {
    mutate(
      {},
      {
        onSuccess: () => {
          router.invalidate().then(() => {
            router.navigate({ to: "/", reloadDocument: true });
          });
        },
      },
    );
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <UserAvatar className="h-8 w-8 rounded-lg" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{data.username}</span>
                  <span className="truncate text-xs">{data.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={
                  <Link to="/settings">
                    <Settings />
                    {t("nav.settings")}
                  </Link>
                }
              />
              {data.role === UserRole.ADMIN && (
                <DropdownMenuItem
                  render={
                    <Link to="/admin">
                      <ShieldUser />
                      {t("nav.admin")}
                    </Link>
                  }
                />
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogoutClicked}>
              <LogOut />
              {t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
