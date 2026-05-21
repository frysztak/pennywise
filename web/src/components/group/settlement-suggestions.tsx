import { useSuspenseQuery } from "@connectrpc/connect-query";

import { SettlementCards } from "@/components/group/settlement-cards";
import { getSettlementSuggestions } from "@/gen/api/v1/group-GroupService_connectquery";
import type { TransferTemplateDefaults } from "@/hooks/use-transfer-modal";

import { Card, CardContent } from "../ui/card";

interface SettlementSuggestionsProps {
  groupId: string;
  currentUserId: string;
  onSettle: (templateDefaults: TransferTemplateDefaults) => void;
}

export function SettlementSuggestions({ groupId, currentUserId, onSettle }: SettlementSuggestionsProps) {
  const { data } = useSuspenseQuery(getSettlementSuggestions, { groupId });

  if (data.suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-muted-foreground">No outstanding debts in this group.</p>
        </CardContent>
      </Card>
    );
  }

  const mySettlements = data.suggestions.filter((s) => s.fromUserId === currentUserId || s.toUserId === currentUserId);
  const otherSettlements = data.suggestions.filter(
    (s) => s.fromUserId !== currentUserId && s.toUserId !== currentUserId,
  );
  const sortedSuggestions = [...mySettlements, ...otherSettlements];

  return <SettlementCards suggestions={sortedSuggestions} currentUserId={currentUserId} onSettle={onSettle} />;
}

// interface SettlementRowProps {
//   suggestion: SettlementSuggestion;
//   currentUserId: string;
//   onSettle?: (templateDefaults: TransferTemplateDefaults) => void;
// }
// function SettlementRow({ suggestion, currentUserId, onSettle }: SettlementRowProps) {
//   const isCurrentUserInvolved = suggestion.fromUserId === currentUserId || suggestion.toUserId === currentUserId;
//   const isCurrentUserPaying = suggestion.fromUserId === currentUserId;

//   const handleSettle = () => {
//     onSettle?.({
//       senderId: suggestion.fromUserId,
//       receiverId: suggestion.toUserId,
//       amount: suggestion.amount,
//       currency: suggestion.currency,
//     });
//   };

//   return (
//     <TableRow>
//       <TableCell>
//         <div className="flex items-center gap-2">
//           <MemberAvatar userId={suggestion.fromUserId} username={suggestion.fromUserName} className="h-8 w-8" />
//           <span className={isCurrentUserPaying ? "font-semibold" : ""}>{suggestion.fromUserName}</span>
//         </div>
//       </TableCell>

//       {/* <ArrowRight className="h-4 w-4 text-muted-foreground" /> */}
//       <TableCell>
//         <div className="flex items-center gap-2">
//           <MemberAvatar userId={suggestion.toUserId} username={suggestion.toUserName} className="h-8 w-8" />
//           <span className={!isCurrentUserPaying && isCurrentUserInvolved ? "font-semibold" : ""}>
//             {suggestion.toUserName}
//           </span>
//         </div>
//       </TableCell>

//       <TableCell>
//         <span className="font-semibold text-lg">{formatCurrency(suggestion.amount, suggestion.currency)}</span>
//       </TableCell>

//       <TableCell className="text-right">
//         {isCurrentUserInvolved && onSettle && (
//           <Button size="sm" onClick={handleSettle}>
//             <BanknoteArrowUp />
//             Settle
//           </Button>
//         )}
//       </TableCell>
//     </TableRow>
//   );
// }
