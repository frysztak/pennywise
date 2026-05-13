import { ArrowRight } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SettlementSuggestion } from "@/gen/api/v1/group_pb";
import type { TransferTemplateDefaults } from "@/hooks/use-transfer-modal";
import { formatCurrency } from "@/lib/utils";

interface SettlementCardsProps {
  suggestions: SettlementSuggestion[];
  currentUserId: string;
  onSettle: (templateDefaults: TransferTemplateDefaults) => void;
}

export function SettlementCards({ suggestions, currentUserId, onSettle }: SettlementCardsProps) {
  return (
    <div className="flex flex-col gap-2">
      {suggestions.map((suggestion, index) => {
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
          <Card key={index} className="p-3">
            <CardContent className="flex flex-col gap-2 px-0">
              <div className="flex items-center gap-2 min-w-0">
                <MemberAvatar
                  userId={suggestion.fromUserId}
                  username={suggestion.fromUserName}
                  className="h-6 w-6 shrink-0"
                />
                <span className={`line-clamp-1 ${isCurrentUserPaying ? "font-semibold" : ""}`}>
                  {suggestion.fromUserName}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <MemberAvatar
                  userId={suggestion.toUserId}
                  username={suggestion.toUserName}
                  className="h-6 w-6 shrink-0"
                />
                <span
                  className={`line-clamp-1 ${!isCurrentUserPaying && isCurrentUserInvolved ? "font-semibold" : ""}`}
                >
                  {suggestion.toUserName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-lg">{formatCurrency(suggestion.amount, suggestion.currency)}</span>
                {isCurrentUserInvolved && (
                  <Button size="lg" onClick={handleSettle}>
                    Settle
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
