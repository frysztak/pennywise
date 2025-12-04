import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ExpenseGroupCardProps {
  groupName: string;
  groupDescription: string;
  balance: Record<string, bigint>;
  recentExpenses?: Array<{ name: string; amount: number; currency: string }>;
}

function formatBalance(balance: Record<string, bigint>): string {
  if (Object.keys(balance).length === 0) {
    return "No expenses yet";
  }

  return Object.entries(balance)
    .map(([currency, amount]) => {
      const formattedAmount = (Number(amount) / 100).toFixed(2);
      const sign = amount >= 0n ? "+" : "";
      return `${sign}${formattedAmount} ${currency}`;
    })
    .join(", ");
}

function getBalanceColor(balance: Record<string, bigint>): string {
  const totalBalance = Object.values(balance).reduce((sum, val) => sum + val, 0n);
  if (totalBalance > 0n) return "text-green-600 dark:text-green-400";
  if (totalBalance < 0n) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export function ExpenseGroupCard({
  groupName,
  groupDescription,
  balance,
  recentExpenses,
}: ExpenseGroupCardProps) {
  const balanceString = formatBalance(balance);
  const balanceColor = getBalanceColor(balance);

  return (
    <Card className="transition-all hover:shadow-md hover:border-primary/50 h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle>{groupName}</CardTitle>
            {groupDescription && (
              <CardDescription className="mt-2">{groupDescription}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1">Your balance</div>
          <div className={cn("text-lg font-semibold", balanceColor)}>{balanceString}</div>
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
