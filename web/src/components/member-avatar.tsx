import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MemberAvatarProps {
  userId: string;
  username: string;
  avatarUpdatedAt?: Date;
  className?: string;
}

export function MemberAvatar({
  userId,
  username,
  avatarUpdatedAt,
  className,
}: MemberAvatarProps) {
  // Generate avatar URL with optional cache busting
  const avatarUrl = avatarUpdatedAt
    ? `/avatar/${userId}?v=${avatarUpdatedAt.getTime()}`
    : `/avatar/${userId}`;

  const initials = username.substring(0, 2).toUpperCase();

  return (
    <Avatar className={cn("h-8 w-8 rounded-lg", className)}>
      <AvatarImage src={avatarUrl} alt={username} />
      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
    </Avatar>
  );
}
