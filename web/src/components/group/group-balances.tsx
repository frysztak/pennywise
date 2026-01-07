import { AmountWithCurrency } from "@/components/amount-with-currency";
import { MemberAvatar } from "@/components/member-avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { MemberBalance } from "@/gen/api/v1/group_pb";

interface GroupBalancesProps {
  memberBalances: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
}

export function GroupBalances({ memberBalances, currentUserId, defaultCurrency }: GroupBalancesProps) {
  const otherMembers = memberBalances.filter((member) => member.userId !== currentUserId);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Group Balances</h2>
      <div className="space-y-3">
        {otherMembers.map((member) => (
          <Card key={member.userId} className="py-0">
            <CardContent className="p-4">
              <div className="flex flex-col items-start md:items-center md:flex-row gap-2 justify-between">
                <div className="flex items-center gap-3">
                  <MemberAvatar userId={member.userId} username={member.userName} className="w-10 h-10" />
                  <span className="font-medium">{member.userName}</span>
                </div>
                <AmountWithCurrency balance={member.balance} defaultCurrency={defaultCurrency} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
