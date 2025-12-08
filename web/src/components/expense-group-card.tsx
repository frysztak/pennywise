import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AmountWithCurrency } from "./amount-with-currency";

interface ExpenseGroupCardProps {
  groupName: string;
  groupDescription: string;
  groupDefaultCurrency: string;
  balance: Record<string, bigint>;
  recentExpenses?: Array<{ name: string; amount: number; currency: string }>;
}

export function ExpenseGroupCard({
  groupName,
  groupDescription,
  groupDefaultCurrency,
  balance,
  recentExpenses,
}: ExpenseGroupCardProps) {
  const balanceArray = Object.entries(balance).map(([currency, amount]) => ({
    amount,
    currency,
  }));

  return (
    <Card className="transition-all hover:shadow-md hover:border-primary/50 h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-2xl">{groupName}</CardTitle>
            <CardDescription className="mt-2 line-clamp-1">
              {groupDescription || "\u200B"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            Your balance:
          </div>
          <AmountWithCurrency className="text-lg" balance={balanceArray} defaultCurrency={groupDefaultCurrency} />
        </div>

        {recentExpenses && recentExpenses.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-sm text-muted-foreground">Recent expenses</div>
            {recentExpenses.slice(0, 3).map((expense, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm"
              >
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
