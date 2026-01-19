"use client";

import { useLocation } from "@tanstack/react-router";
import * as React from "react";

import pennywiseSvg from "@/assets/pennywise.svg";
import { NavGroups } from "@/components/sidebar/nav-groups";
import { NavMain } from "@/components/sidebar/nav-main";
import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpenMobile } = useSidebar();
  const { href } = useLocation();

  React.useEffect(() => {
    setOpenMobile(false);
  }, [href]);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex gap-2 p-1">
            <img src={pennywiseSvg} alt="Pennywise" className="size-8" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-bold text-lg">Pennywise</span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavGroups />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
