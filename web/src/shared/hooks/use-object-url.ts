import { useEffect, useState } from "react";

export const useObjectUrl = (object: Blob | MediaSource | File | null): string | undefined => {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!object) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(undefined);
      return;
    }

    const url = URL.createObjectURL(object);
    setUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [object]);

  return url;
};
