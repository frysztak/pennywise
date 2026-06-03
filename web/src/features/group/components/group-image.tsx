import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampDate } from "@bufbuild/protobuf/wkt";

import { cn } from "@/shared/lib/utils";

interface GroupImageProps {
  groupId: string;
  groupName: string;
  imageUpdatedAt?: Timestamp;
  className?: string;
  imgClassName?: string;
}

function initialsFromName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function GroupImage({ groupId, groupName, imageUpdatedAt, className, imgClassName }: GroupImageProps) {
  if (!imageUpdatedAt) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center font-serif select-none",
          className,
        )}
        aria-label={`${groupName} image placeholder`}
      >
        <span className="text-4xl tracking-tight">{initialsFromName(groupName)}</span>
      </div>
    );
  }

  const v = timestampDate(imageUpdatedAt).getTime();
  const base = `/group-image/${groupId}?v=${v}`;
  return (
    <img
      src={`${base}&size=large`}
      srcSet={`${base}&size=small 800w, ${base}&size=large 1600w`}
      sizes="(max-width: 640px) 800px, 1600px"
      alt=""
      className={cn("size-full object-cover", imgClassName, className)}
      loading="lazy"
      decoding="async"
    />
  );
}
