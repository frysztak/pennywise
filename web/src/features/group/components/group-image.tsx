import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampDate } from "@bufbuild/protobuf/wkt";

import { cn } from "@/shared/lib/utils";

// Default `sizes` targets the full-bleed group header (full viewport width).
// Smaller call sites (e.g. dashboard cards) should pass their own `sizes` so
// the browser picks a smaller srcSet candidate instead of the 2880px variant.
const DEFAULT_SIZES = "(max-width: 640px) 1280px, 2880px";

interface GroupImageProps {
  groupId: string;
  groupName: string;
  imageUpdatedAt?: Timestamp;
  className?: string;
  imgClassName?: string;
  sizes?: string;
}

function initialsFromName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function GroupImage({
  groupId,
  groupName,
  imageUpdatedAt,
  className,
  imgClassName,
  sizes = DEFAULT_SIZES,
}: GroupImageProps) {
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
      srcSet={`${base}&size=small 1280w, ${base}&size=medium 1920w, ${base}&size=large 2880w`}
      sizes={sizes}
      alt={`${groupName} image`}
      className={cn("size-full object-cover", imgClassName, className)}
      loading="lazy"
      decoding="async"
    />
  );
}
