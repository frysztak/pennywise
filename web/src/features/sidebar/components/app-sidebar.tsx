"use client";

import { useLocation } from "@tanstack/react-router";
import * as React from "react";

import pennywiseSvg from "@/assets/pennywise.svg";
import { NavGroups } from "@/features/sidebar/components/nav-groups";
import { NavMain } from "@/features/sidebar/components/nav-main";
import { NavUser } from "@/features/sidebar/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/shared/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpenMobile } = useSidebar();
  const { href } = useLocation();

  React.useEffect(() => {
    setOpenMobile(false);
  }, [href, setOpenMobile]);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex gap-2 p-1 items-center">
            <img src={pennywiseSvg} alt="Pennywise" className="size-8" />
            {/* eslint-disable-next-line i18next/no-literal-string -- brand name, not translated */}
            <span className="truncate font-semibold font-serif text-2xl">
              Pennywise
              <span className="text-money">.</span>
            </span>
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
