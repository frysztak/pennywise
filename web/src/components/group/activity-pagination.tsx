import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ActivityPaginationProps {
  pageIndex: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  itemsOnPage: number;
  canPrev: boolean;
  canNext: boolean;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function ActivityPagination({
  pageIndex,
  totalPages,
  totalCount,
  limit,
  itemsOnPage,
  canPrev,
  canNext,
  isLoading,
  onPrev,
  onNext,
}: ActivityPaginationProps) {
  const from = totalCount === 0 ? 0 : pageIndex * limit + 1;
  const to = pageIndex * limit + itemsOnPage;

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        {totalCount === 0 ? "No items" : `${from}–${to} of ${totalCount} items`}
      </span>
      <div className="flex items-center gap-2">
        <span>
          Page {pageIndex + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!canPrev || isLoading}
          onClick={onPrev}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!canNext || isLoading}
          onClick={onNext}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
