import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AmountInputTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Info className="w-4 h-4 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>
        The following operations are supported: <code>+-*/</code>
      </TooltipContent>
    </Tooltip>
  );
}
