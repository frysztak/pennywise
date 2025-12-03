import { Controller, useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import {
  createExpenseGroup,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";
import { useState } from "react";
import { handleError } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(2),
  description: z.string(),
});
const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

export const NewGroupModal = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const { isPending, mutate } = useMutation(createExpenseGroup, {
    onSuccess: () => {
      toast.success("Group created!");
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      setOpen(false);
    },
    onError: handleError
  });
  const queryClient = useQueryClient();

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutate(data);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      form.reset();
    }
    setOpen(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new group</DialogTitle>
          <DialogDescription>Create new expense group.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="groupName">Group name</FieldLabel>
                  <Input
                    {...field}
                    id="groupName"
                    placeholder="My group..."
                    required
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="description"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="groupDesc">Group description</FieldLabel>
                  <Input
                    {...field}
                    id="groupDesc"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Field>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}
                Submit
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
};
