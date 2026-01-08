import { useSuspenseQuery } from "@connectrpc/connect-query";
import { ArrowRight, Check, Info } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSettlementSuggestions } from "@/gen/api/v1/group-GroupService_connectquery";
import type { SettlementSuggestion } from "@/gen/api/v1/group_pb";
import type { TransferTemplateDefaults } from "@/hooks/use-transfer-modal";
import { formatCurrency } from "@/lib/utils";

interface SettlementSuggestionsProps {
  groupId: string;
  currentUserId: string;
  onSettle: (templateDefaults: TransferTemplateDefaults) => void;
}

export function SettlementSuggestions({ groupId, currentUserId, onSettle }: SettlementSuggestionsProps) {
  const { data } = useSuspenseQuery(getSettlementSuggestions, { groupId });

  if (data.suggestions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Check className="mx-auto h-12 w-12 mb-2" />
        <p className="text-lg font-medium">All settled up!</p>
        <p className="text-sm">No outstanding debts in this group</p>
      </div>
    );
  }

  // Separate settlements involving current user from others
  const mySettlements = data.suggestions.filter(
    (s) => s.fromUserId === currentUserId || s.toUserId === currentUserId,
  );
  const otherSettlements = data.suggestions.filter(
    (s) => s.fromUserId !== currentUserId && s.toUserId !== currentUserId,
  );

  return (
    <div className="space-y-4">
      {mySettlements.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Your settlements</h3>
          {mySettlements.map((suggestion, index) => (
            <SettlementCard
              key={`my-${index}`}
              suggestion={suggestion}
              currentUserId={currentUserId}
              onSettle={onSettle}
            />
          ))}
        </div>
      )}

      {otherSettlements.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Other group settlements</h3>
          {otherSettlements.map((suggestion, index) => (
            <SettlementCard key={`other-${index}`} suggestion={suggestion} currentUserId={currentUserId} />
          ))}
        </div>
      )}

      <div className="flex gap-2 text-xs text-muted-foreground mt-4">
        <Info className="h-4 w-4 shrink-0" />
        <p>
          These suggestions are optimized to minimize the number of transfers. The suggested payer may differ from who
          originally owed the money.
        </p>
      </div>
    </div>
  );
}

interface SettlementCardProps {
  suggestion: SettlementSuggestion;
  currentUserId: string;
  onSettle?: (templateDefaults: TransferTemplateDefaults) => void;
}

function SettlementCard({ suggestion, currentUserId, onSettle }: SettlementCardProps) {
  const isCurrentUserInvolved = suggestion.fromUserId === currentUserId || suggestion.toUserId === currentUserId;
  const isCurrentUserPaying = suggestion.fromUserId === currentUserId;

  const handleSettle = () => {
    onSettle?.({
      senderId: suggestion.fromUserId,
      receiverId: suggestion.toUserId,
      amount: suggestion.amount,
      currency: suggestion.currency,
    });
  };

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <MemberAvatar userId={suggestion.fromUserId} username={suggestion.fromUserName} className="h-8 w-8" />
              <span className={isCurrentUserPaying ? "font-semibold" : ""}>{suggestion.fromUserName}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <MemberAvatar userId={suggestion.toUserId} username={suggestion.toUserName} className="h-8 w-8" />
              <span className={!isCurrentUserPaying && isCurrentUserInvolved ? "font-semibold" : ""}>
                {suggestion.toUserName}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="font-semibold text-lg">{formatCurrency(suggestion.amount, suggestion.currency)}</span>
            {isCurrentUserInvolved && onSettle && (
              <Button size="sm" onClick={handleSettle}>
                Settle
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
