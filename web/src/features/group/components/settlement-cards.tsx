import { ArrowBigRightDash, BanknoteArrowUp, BanknoteIcon } from "lucide-react";
import { Fragment } from "react";

import type { TransferTemplateDefaults } from "@/features/transfer/hooks/use-transfer-modal";
import type { SettlementSuggestion } from "@/gen/api/v1/group_pb";
import { MemberAvatar } from "@/shared/components/member-avatar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { formatCurrency } from "@/shared/lib/utils";

interface SettlementCardsProps {
  suggestions: SettlementSuggestion[];
  currentUserId: string;
  onSettle: (templateDefaults: TransferTemplateDefaults) => void;
  isArchived?: boolean;
}

export function SettlementCards({ suggestions, currentUserId, onSettle, isArchived }: SettlementCardsProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        {suggestions.map((suggestion, idx) => {
          const isCurrentUserPaying = suggestion.fromUserId === currentUserId;
          const isCurrentUserInvolved = isCurrentUserPaying || suggestion.toUserId === currentUserId;

          const handleSettle = () => {
            onSettle({
              senderId: suggestion.fromUserId,
              receiverId: suggestion.toUserId,
              amount: suggestion.amount,
              currency: suggestion.currency,
            });
          };

          return (
            <Fragment key={`${suggestion.fromUserId}-${suggestion.toUserId}-${suggestion.currency}`}>
              {idx > 0 && <Separator className="my-3" />}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0">
                <div className="justify-self-start flex items-center gap-3">
                  <MemberAvatar
                    userId={suggestion.fromUserId}
                    username={suggestion.fromUserName}
                    className="h-8 w-8 shrink-0"
                  />
                  <span className={`${isCurrentUserPaying ? "font-bold" : "font-medium"}`}>
                    {suggestion.fromUserName}
                  </span>
                </div>
                <ArrowBigRightDash className="h-6 w-6 text-muted-foreground shrink-0" />
                <div className="justify-self-end flex items-center gap-3">
                  <MemberAvatar
                    userId={suggestion.toUserId}
                    username={suggestion.toUserName}
                    className="h-8 w-8 shrink-0"
                  />
                  <span className={`${!isCurrentUserPaying && isCurrentUserInvolved ? "font-bold" : "font-medium"}`}>
                    {suggestion.toUserName}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BanknoteIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <span className="font-semibold text-lg">
                    {formatCurrency(suggestion.amount, suggestion.currency)}
                  </span>
                </div>
                {isCurrentUserInvolved && !isArchived && (
                  <Button size="sm" onClick={handleSettle}>
                    <BanknoteArrowUp />
                    Settle
                  </Button>
                )}
              </div>
            </Fragment>
          );
        })}
      </CardContent>
    </Card>
  );
}
