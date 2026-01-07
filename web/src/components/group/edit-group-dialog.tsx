import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";

import { MemberAvatar } from "@/components/member-avatar";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import type { EditingGroup } from "@/hooks/use-edit-group-modal";
import { COMMON_CURRENCIES } from "@/lib/currencies";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string(),
  defaultCurrency: z.string().min(2, "Currency is required"),
});

interface EditGroupDialogProps {
  open: boolean;
  group: EditingGroup;
  memberBalances: MemberBalance[];
  onOpenChange: (open: boolean) => void;
  onUpdateGroup: (data: { name: string; description: string; defaultCurrency: string }) => void;
  onUpdateWeight: (userId: string, weight: number) => void;
}

export function EditGroupDialog({
  open,
  group,
  memberBalances,
  onOpenChange,
  onUpdateGroup,
  onUpdateWeight,
}: EditGroupDialogProps) {
  const [editingWeights, setEditingWeights] = useState(() => {
    const weights: Record<string, number> = {};
    memberBalances.forEach((member) => {
      weights[member.userId] = member.weight;
    });
    return weights;
  });

  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: group.groupName,
      description: group.groupDescription,
      defaultCurrency: group.defaultCurrency,
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setIsPending(true);

    // Update group details
    onUpdateGroup(data);

    // Update weights for members that have changed
    for (const member of memberBalances) {
      const newWeight = editingWeights[member.userId] ?? 1;
      if (newWeight !== member.weight && newWeight > 0) {
        onUpdateWeight(member.userId, newWeight);
      }
    }

    onOpenChange(false);
    setIsPending(false);
  };

  const handleWeightChange = (userId: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setEditingWeights((prev) => ({
        ...prev,
        [userId]: numValue,
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>Update group details and manage member weights</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Group Details Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Group Details</h3>
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
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
                    <Input {...field} id="groupDesc" aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="defaultCurrency"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="defaultCurrency">Default currency</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <SelectTrigger id="defaultCurrency" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_CURRENCIES.map((currency) => (
                          <SelectItem key={currency.value} value={currency.value}>
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
          </div>

          {/* Member Weights Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Member Weights</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Weight determines how expenses are split. A member with weight 2.0 pays twice as much as a member with
              weight 1.0.
            </p>
            <div className="space-y-2">
              {memberBalances.map((member) => (
                <Card key={member.userId}>
                  <CardContent className="px-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <MemberAvatar userId={member.userId} username={member.userName} />
                        <span className="font-medium text-sm">{member.userName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FieldLabel htmlFor={`weight-${member.userId}`} className="text-xs whitespace-nowrap mb-0">
                          Weight:
                        </FieldLabel>
                        <Input
                          id={`weight-${member.userId}`}
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={editingWeights[member.userId] ?? 1}
                          onChange={(e) => handleWeightChange(member.userId, e.target.value)}
                          disabled={isPending}
                          className="w-20 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
