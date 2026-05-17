import { MemberAvatar } from "@/components/member-avatar";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface GroupMemberStackProps {
  members: Array<{ userId: string; userName: string }>;
  max?: number;
  className?: string;
  avatarClassName?: string;
}

export function GroupMemberStack({ members, max = 3, className, avatarClassName }: GroupMemberStackProps) {
  if (members.length === 0) return null;

  const visible = members.slice(0, max);
  const hidden = members.slice(max);

  return (
    <AvatarGroup className={cn("*:data-[slot=avatar]:after:hidden", className)}>
      {visible.map((m) => (
        <Tooltip key={m.userId}>
          <TooltipTrigger
            render={
              <MemberAvatar userId={m.userId} username={m.userName} className={cn("rounded-full", avatarClassName)} />
            }
          />
          <TooltipContent>{m.userName}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={<AvatarGroupCount className={cn("ring-0", avatarClassName)}>+{hidden.length}</AvatarGroupCount>}
          />
          <TooltipContent>{hidden.map((m) => m.userName).join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </AvatarGroup>
  );
}
