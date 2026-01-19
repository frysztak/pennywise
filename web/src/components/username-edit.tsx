import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUser, userInfo } from "@/gen/api/v1/user-UserService_connectquery";

const userInfoKey = createConnectQueryKey({
  schema: userInfo,
  cardinality: "finite",
});

export function UsernameEdit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(user?.username ?? "");

  const { mutate: updateUsername, isPending } = useMutation(updateUser, {
    onSuccess: () => {
      toast.success("Username updated successfully");
      queryClient.invalidateQueries({ queryKey: userInfoKey });
    },
    onError: (error) => {
      toast.error(`Failed to update username: ${error.message}`);
    },
  });

  const handleSave = () => {
    if (username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    updateUsername({ username });
  };

  return (
    <div className="flex gap-2">
      <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" />
      <Button onClick={handleSave} disabled={isPending || username === user?.username}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
