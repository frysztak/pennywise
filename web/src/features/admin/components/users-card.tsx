import { createConnectQueryKey, useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import { listUsers, updateUserRole } from "@/gen/api/v1/admin-AdminService_connectquery";
import { UserRole } from "@/gen/api/v1/user_pb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { handleError } from "@/shared/lib/utils";

const listUsersKey = createConnectQueryKey({ schema: listUsers, cardinality: "finite" });

const ROLE_OPTIONS = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.REGULAR, label: "Regular" },
];

export function UsersCard() {
  const { data } = useSuspenseQuery(listUsers);
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation(updateUserRole, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listUsersKey });
    },
    onError: handleError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Manage user roles.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-40">Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Select
                    items={ROLE_OPTIONS}
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
                      {ROLE_OPTIONS.map((opt) => (
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
