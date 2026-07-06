import { useSuspenseQuery } from "@connectrpc/connect-query";
import { Coins, Info } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SingleCurrencyModal } from "@/features/conversion/components/single-currency-modal";
import { SettlementCards } from "@/features/group/components/settlement-cards";
import type { TransferTemplateDefaults } from "@/features/transfer/hooks/use-transfer-modal";
import { getSettlementSuggestions } from "@/gen/api/v1/group-GroupService_connectquery";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

interface SettlementSuggestionsProps {
  groupId: string;
  currentUserId: string;
  currencies: string[];
  defaultCurrency: string;
  onSettle: (templateDefaults: TransferTemplateDefaults) => void;
  isArchived?: boolean;
}

export function SettlementSuggestions({
  groupId,
  currentUserId,
  currencies,
  defaultCurrency,
  onSettle,
  isArchived,
}: SettlementSuggestionsProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(getSettlementSuggestions, { groupId });
  const [singleCurrencyOpen, setSingleCurrencyOpen] = useState(false);

  // Offer single-currency mode whenever debts span more than one currency.
  const canConsolidate = !isArchived && data.currenciesInGroup.length > 1;

  const heading = (
    <h2 className="text-xl font-bold">
      {t("group.settleUp")}{" "}
      <Tooltip>
        <TooltipTrigger>
          <Info className="w-4 h-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>{t("group.settleUpTooltip")}</TooltipContent>
      </Tooltip>
    </h2>
  );

  if (data.suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 min-h-9">{heading}</div>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-muted-foreground">{t("group.settlementEmpty")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mySettlements = data.suggestions.filter((s) => s.fromUserId === currentUserId || s.toUserId === currentUserId);
  const otherSettlements = data.suggestions.filter(
    (s) => s.fromUserId !== currentUserId && s.toUserId !== currentUserId,
  );
  const sortedSuggestions = [...mySettlements, ...otherSettlements];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 min-h-9">
        {heading}
        {canConsolidate && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSingleCurrencyOpen(true)}>
            <Coins />
            {t("conversion.singleCurrency.open")}
          </Button>
        )}
      </div>
      <SettlementCards
        suggestions={sortedSuggestions}
        currentUserId={currentUserId}
        onSettle={onSettle}
        isArchived={isArchived}
      />
      {singleCurrencyOpen && (
        <SingleCurrencyModal
          open={singleCurrencyOpen}
          onOpenChange={setSingleCurrencyOpen}
          groupId={groupId}
          currenciesInGroup={data.currenciesInGroup}
          currencies={currencies}
          defaultCurrency={defaultCurrency}
        />
      )}
    </div>
  );
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
