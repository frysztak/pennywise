import { useSuspenseQuery } from "@connectrpc/connect-query";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { timestampDate } from "@bufbuild/protobuf/wkt";

interface UserAvatarProps {
  className?: string;
}

export function UserAvatar({ className }: UserAvatarProps) {
  const { data } = useSuspenseQuery(userInfo);

  // Generate cache buster from avatar_updated_at timestamp
  const avatarUrl = data.avatarUpdatedAt
    ? `/avatar/${data.id}?v=${timestampDate(data.avatarUpdatedAt).getTime()}`
    : `/avatar/${data.id}`;

  const initials = data.username.substring(0, 2).toUpperCase();

  return (
    <Avatar className={cn("h-8 w-8 rounded-lg", className)}>
      <AvatarImage src={avatarUrl} alt={data.username} />
      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
    </Avatar>
  );
}
