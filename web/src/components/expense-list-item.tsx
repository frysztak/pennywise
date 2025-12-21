import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";
import { timestampDate } from "@bufbuild/protobuf/wkt";

interface ExpenseListItemProps {
  expense: GetGroupExpensesResponse_Expense;
}

export function ExpenseListItem({ expense }: ExpenseListItemProps) {
  return (
    <div className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 py-5 px-6 sm:py-6 sm:px-8 bg-background hover:bg-accent/5 transition-all duration-200 border-b last:border-b-0">
      {/* Left side - Expense details */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold tracking-tight leading-tight">
              {expense.name}
            </h3>
            {expense.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                {expense.description}
              </p>
            )}
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
          <time className="font-medium">
            {timestampDate(expense.createdAt!).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
          <span className="hidden sm:inline text-muted-foreground/40">•</span>
          <span className="truncate max-w-[200px]">
            <span className="text-muted-foreground/60">Paid by</span>{" "}
            {expense.payerId}
          </span>
          {expense.beneficiariesIds.length > 0 && (
            <>
              <span className="hidden sm:inline text-muted-foreground/40">
                •
              </span>
              <span className="text-muted-foreground/60">
                Split {expense.beneficiariesIds.length}{" "}
                {expense.beneficiariesIds.length === 1 ? "way" : "ways"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right side - Amount */}
      <div className="flex items-baseline sm:items-end sm:flex-col gap-2 sm:gap-1 sm:text-right shrink-0 sm:min-w-[140px]">
        <div className="flex items-baseline gap-1.5 font-mono">
          <span className="text-3xl sm:text-4xl font-bold tracking-tighter tabular-nums leading-none">
            {(Number(expense.amount) / 100).toFixed(2)}
          </span>
          <span className="text-base sm:text-lg font-semibold text-muted-foreground/80 uppercase tracking-wider">
            {expense.currency}
          </span>
        </div>
        <div className="hidden sm:block h-px w-full bg-gradient-to-r from-transparent via-border to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    </div>
  );
}
