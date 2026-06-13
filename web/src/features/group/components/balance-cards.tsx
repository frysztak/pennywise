import { useTranslation } from "react-i18next";

import type { MemberBalance } from "@/gen/api/v1/group_pb";
import { AmountWithCurrency } from "@/shared/components/amount-with-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";

interface BalanceCardsProps {
  userBalance: MemberBalance;
  totalSpending: Record<string, bigint>;
  defaultCurrency: string;
  className?: string;
}

export function BalanceCards({ userBalance, totalSpending, defaultCurrency, className }: BalanceCardsProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      <Card className="gap-1">
        <CardHeader>
          <CardTitle className="text-lg">{t("group.yourTotalBalance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AmountWithCurrency balance={userBalance.balance} defaultCurrency={defaultCurrency} className="text-2xl" />
        </CardContent>
      </Card>

      <Card className="gap-1">
        <CardHeader>
          <CardTitle className="text-lg">{t("group.totalGroupSpending")}</CardTitle>
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
