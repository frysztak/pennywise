import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { deleteConversion } from "@/gen/api/v1/conversion-ConversionService_connectquery";
import {
  getGroupActivity,
  getSettlementSuggestions,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import type { GetGroupActivityResponse_ActivityItem_Conversion } from "@/gen/api/v1/group_pb";
import { handleError } from "@/shared/lib/utils";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});
const settlementSuggestionsKey = createConnectQueryKey({
  schema: getSettlementSuggestions,
  cardinality: "finite",
});

interface DeletingConversion {
  conversion: GetGroupActivityResponse_ActivityItem_Conversion;
  groupId: string;
}

export function useDeleteConversionModal(groupId: string) {
  const { t } = useTranslation();
  const [deletingConversion, setDeletingConversion] = useState<DeletingConversion | null>(null);
  const queryClient = useQueryClient();

  const groupActivityKey = createConnectQueryKey({
    schema: getGroupActivity,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteConversionMutate } = useMutation(deleteConversion, {
    onSuccess: () => {
      toast.success(t("conversion.deleted"));
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({ queryKey: settlementSuggestionsKey });
    },
    onError: handleError,
  });

  const confirmDelete = (conversion: GetGroupActivityResponse_ActivityItem_Conversion) => {
    setDeletingConversion({ conversion, groupId });
  };

  const handleConfirm = () => {
    if (deletingConversion) {
      deleteConversionMutate({ id: deletingConversion.conversion.id, groupId: deletingConversion.groupId });
      setDeletingConversion(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeletingConversion(null);
    }
  };

  return {
    confirmDelete,
    dialogProps: {
      open: !!deletingConversion,
      fromCurrency: deletingConversion?.conversion.fromCurrency,
      toCurrency: deletingConversion?.conversion.toCurrency,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
    },
  };
}
