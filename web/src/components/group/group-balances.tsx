import { Fragment } from "react/jsx-runtime";

import { AmountWithCurrency } from "@/components/amount-with-currency";
import { MemberAvatar } from "@/components/member-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MemberBalance } from "@/gen/api/v1/group_pb";

interface GroupBalancesProps {
  memberBalances: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
}

export function GroupBalances({ memberBalances, currentUserId, defaultCurrency }: GroupBalancesProps) {
  if (memberBalances.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-muted-foreground">No balances in this group.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {memberBalances.map((member, idx) => (
          <Fragment key={member.userId}>
            {idx > 0 && <Separator className="my-3" />}
            <div className="flex gap-2 justify-between items-center">
              <div className="flex items-center gap-3">
                <MemberAvatar userId={member.userId} username={member.userName} className="w-8 md:w-10 h-8 md:h-10" />
                <span className={member.userId === currentUserId ? "font-bold" : "font-medium"}>{member.userName}</span>
              </div>
              <AmountWithCurrency balance={member.balance} defaultCurrency={defaultCurrency} className="text-right" />
            </div>
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
