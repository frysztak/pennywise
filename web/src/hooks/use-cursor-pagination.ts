import { useState } from "react";

interface CursorPaginationOpts {
  limit: number;
  totalCount: number;
}

export function useCursorPagination({ limit, totalCount }: CursorPaginationOpts) {
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);

  const cursor = stack[stack.length - 1];
  const pageIndex = stack.length - 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return {
    cursor,
    pageIndex,
    totalPages,
    canPrev: stack.length > 1,
    canNext: pageIndex + 1 < totalPages,
    next: (nextCursor: string | undefined) => {
      if (nextCursor) setStack((s) => [...s, nextCursor]);
    },
    prev: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset: () => setStack([undefined]),
  };
}
