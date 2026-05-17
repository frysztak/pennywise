import type { ComponentProps } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MemberAvatarProps extends Omit<ComponentProps<typeof Avatar>, "children"> {
  userId: string;
  username: string;
  avatarUpdatedAt?: Date;
}

export function MemberAvatar({ userId, username, avatarUpdatedAt, className, ...props }: MemberAvatarProps) {
  const avatarUrl = avatarUpdatedAt ? `/avatar/${userId}?v=${avatarUpdatedAt.getTime()}` : `/avatar/${userId}`;
  const initials = username.substring(0, 2).toUpperCase();

  return (
    <Avatar {...props} className={cn("h-8 w-8 rounded-lg", className)}>
      <AvatarImage src={avatarUrl} alt={username} />
      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
    </Avatar>
  );
}
