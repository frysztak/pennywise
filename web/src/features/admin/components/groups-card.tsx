import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { Trash } from "lucide-react";
import { useState } from "react";
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
  const { data } = useSuspenseQuery(listGroups);
  const queryClient = useQueryClient();

  const [target, setTarget] = useState<Group | null>(null);

  const { mutate, isPending } = useMutation(deleteGroup, {
    onSuccess: () => {
      toast.success("Group deleted");
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: listGroupsKey });
    },
    onError: handleError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>Delete groups.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>Created</TableHead>
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
                    aria-label={`Delete ${group.name}`}
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
            <AlertDialogTitle>Delete group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{target?.name}"? This will permanently delete all expenses, transfers,
              and balances associated with this group. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                if (target) mutate({ groupId: target.id });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
