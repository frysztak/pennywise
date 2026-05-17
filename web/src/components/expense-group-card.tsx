import type { Timestamp } from "@bufbuild/protobuf/wkt";

import { GroupImage } from "@/components/group/group-image";
import { GroupMemberStack } from "@/components/group/group-member-stack";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { AmountWithCurrency } from "./amount-with-currency";

interface ExpenseGroupCardProps {
  groupId: string;
  groupName: string;
  groupDefaultCurrency: string;
  balance: Record<string, bigint>;
  imageUpdatedAt?: Timestamp;
  members: Array<{ userId: string; userName: string }>;
  recentExpenses?: Array<{ name: string; amount: number; currency: string }>;
}

export function ExpenseGroupCard({
  groupId,
  groupName,
  groupDefaultCurrency,
  balance,
  imageUpdatedAt,
  members,
  recentExpenses,
}: ExpenseGroupCardProps) {
  return (
    <Card className="transition-all hover:shadow-md hover:border-primary/50 h-full overflow-hidden gap-0 pt-0 pb-4">
      <div className="bg-muted aspect-2/1 w-full overflow-hidden relative">
        <GroupImage groupId={groupId} groupName={groupName} imageUpdatedAt={imageUpdatedAt} className="size-full" />
        <GroupMemberStack members={members} className="absolute left-3 bottom-3" avatarClassName="size-7" />
      </div>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-3xl font-serif tracking-tight">{groupName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1">Your balance:</div>
          <AmountWithCurrency className="text-lg" balance={balance} defaultCurrency={groupDefaultCurrency} />
        </div>

        {recentExpenses && recentExpenses.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-sm text-muted-foreground">Recent expenses</div>
            {recentExpenses.slice(0, 3).map((expense, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{expense.name}</span>
                <span className="text-muted-foreground ml-2">
                  {(expense.amount / 100).toFixed(2)} {expense.currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
