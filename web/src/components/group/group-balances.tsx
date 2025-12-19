import { Card, CardContent } from "@/components/ui/card";
import { AmountWithCurrency } from "@/components/amount-with-currency";
import type { GetUserGroupsResponse_Group_MemberBalance } from "@/gen/api/v1/group_pb";

interface GroupBalancesProps {
  memberBalances: GetUserGroupsResponse_Group_MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
}

export function GroupBalances({
  memberBalances,
  currentUserId,
  defaultCurrency,
}: GroupBalancesProps) {
  const otherMembers = memberBalances.filter(
    (member) => member.userId !== currentUserId
  );

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Group Balances</h2>
      <div className="space-y-3">
        {otherMembers.map((member) => (
          <Card key={member.userId} className="py-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {member.userName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>
                  <span className="font-medium">{member.userName}</span>
                </div>
                <AmountWithCurrency
                  balance={member.balance}
                  defaultCurrency={defaultCurrency}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
