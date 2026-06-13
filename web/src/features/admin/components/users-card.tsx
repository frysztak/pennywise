import { createConnectQueryKey, useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listUsers, updateUserRole } from "@/gen/api/v1/admin-AdminService_connectquery";
import { UserRole } from "@/gen/api/v1/user_pb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { handleError } from "@/shared/lib/utils";

const listUsersKey = createConnectQueryKey({ schema: listUsers, cardinality: "finite" });

export function UsersCard() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(listUsers);
  const queryClient = useQueryClient();

  const roleOptions = [
    { value: UserRole.ADMIN, label: t("admin.users.admin") },
    { value: UserRole.REGULAR, label: t("admin.users.regular") },
  ];

  const { mutate, isPending } = useMutation(updateUserRole, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listUsersKey });
    },
    onError: handleError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.users.title")}</CardTitle>
        <CardDescription>{t("admin.users.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.users.username")}</TableHead>
              <TableHead>{t("admin.users.email")}</TableHead>
              <TableHead className="w-40">{t("admin.users.role")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Select
                    items={roleOptions}
                    value={user.role}
                    onValueChange={(role) => {
                      if (role !== null && role !== user.role) mutate({ userId: user.id, role });
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
