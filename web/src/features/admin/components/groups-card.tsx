import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { Trash } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { deleteGroup, listGroups } from "@/gen/api/v1/admin-AdminService_connectquery";
import type { Group } from "@/gen/api/v1/admin_pb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { handleError } from "@/shared/lib/utils";

const listGroupsKey = createConnectQueryKey({ schema: listGroups, cardinality: "finite" });

export function GroupsCard() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(listGroups);
  const queryClient = useQueryClient();

  const [target, setTarget] = useState<Group | null>(null);

  const { mutate, isPending } = useMutation(deleteGroup, {
    onSuccess: () => {
      toast.success(t("admin.groups.deleted"));
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: listGroupsKey });
    },
    onError: handleError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.groups.title")}</CardTitle>
        <CardDescription>{t("admin.groups.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.groups.name")}</TableHead>
              <TableHead>{t("admin.groups.owner")}</TableHead>
              <TableHead className="text-right">{t("admin.groups.members")}</TableHead>
              <TableHead>{t("admin.groups.created")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell className="text-muted-foreground">{group.createdByName}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(group.memberCount)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {group.createdAt ? timestampDate(group.createdAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setTarget(group)}
                    aria-label={t("admin.groups.deleteAria", { name: group.name })}
                  >
                    <Trash className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.groups.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.groups.deleteDescription", { name: target?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                if (target) mutate({ groupId: target.id });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
