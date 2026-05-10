import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ScanLine } from "lucide-react";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { getConfig } from "@/lib/config";

export function NavMain() {
  const { receiptScanningEnabled } = getConfig();

  return (
    <SidebarGroup>
      {/* <SidebarGroupLabel>Platform</SidebarGroupLabel> */}
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Dashboard"
            render={
              <Link to="/dashboard">
                <LayoutDashboard />
                <span className="font-bold text-base">Dashboard</span>
              </Link>
            }
          />
        </SidebarMenuItem>
        {receiptScanningEnabled && (
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Scan receipt"
              render={
                <Link to="/scan-receipt">
                  <ScanLine />
                  <span className="font-bold text-base">Scan receipt</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
