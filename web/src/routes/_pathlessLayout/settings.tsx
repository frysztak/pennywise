import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";

import { AvatarUpload } from "@/components/avatar-upload";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsernameEdit } from "@/components/username-edit";

export const Route = createFileRoute("/_pathlessLayout/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Settings" }],
  }),
});

function RouteComponent() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your profile settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Username</label>
              <div className="mt-2">
                <UsernameEdit />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Avatar</label>
              <div className="mt-2">
                <AvatarUpload />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how Pennywise looks on your device</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex flex-col md:flex-row gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="flex-1"
              >
                <Sun />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="flex-1"
              >
                <Moon />
                Dark
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                className="flex-1"
              >
                <Monitor />
                Auto
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Auto matches your system preference</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
