import { AmountWithCurrency } from "@/components/amount-with-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberBalance } from "@/gen/api/v1/group_pb";

interface BalanceCardsProps {
  userBalance: MemberBalance;
  totalSpending: Record<string, bigint>;
  defaultCurrency: string;
}

export function BalanceCards({ userBalance, totalSpending, defaultCurrency }: BalanceCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-1">
        <CardHeader>
          <CardTitle className="text-lg">Your total balance</CardTitle>
        </CardHeader>
        <CardContent>
          <AmountWithCurrency balance={userBalance.balance} defaultCurrency={defaultCurrency} className="text-2xl" />
        </CardContent>
      </Card>

      <Card className="gap-1">
        <CardHeader>
          <CardTitle className="text-lg">Total group spending</CardTitle>
        </CardHeader>
        <CardContent>
          <AmountWithCurrency
            balance={totalSpending}
            defaultCurrency={defaultCurrency}
            disableColor
            className="text-2xl"
          />
        </CardContent>
      </Card>
    </div>
  );
}
