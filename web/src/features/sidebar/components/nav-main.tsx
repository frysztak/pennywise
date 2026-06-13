import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/shared/components/ui/sidebar";
import { getConfig } from "@/shared/lib/config";

export function NavMain() {
  const { receiptScanningEnabled } = getConfig();
  const { t } = useTranslation();

  return (
    <SidebarGroup>
      {/* <SidebarGroupLabel>Platform</SidebarGroupLabel> */}
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={t("nav.dashboard")}
            render={
              <Link to="/dashboard">
                <LayoutDashboard />
                <span className="font-bold text-base">{t("nav.dashboard")}</span>
              </Link>
            }
          />
        </SidebarMenuItem>
        {receiptScanningEnabled && (
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("nav.scanReceipt")}
              render={
                <Link to="/scan-receipt">
                  <ScanLine />
                  <span className="font-bold text-base">{t("nav.scanReceipt")}</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
