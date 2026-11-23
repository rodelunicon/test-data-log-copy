import { useEffect, useState } from "react";

import { formatDuration } from "@/lib/status-format";

export function LiveDuration({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const startTime = Date.parse(startedAt);
  if (Number.isNaN(startTime)) return <>Duration unavailable</>;
  if (now === null) return <>Elapsed --:--:--</>;

  const difference = Math.floor((now - startTime) / 1000);
  if (difference < 0) return <>Starts in {formatDuration(-difference)}</>;

  return <>Elapsed {formatDuration(difference)}</>;
}
