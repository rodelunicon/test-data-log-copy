import { useEffect, useState } from "react";

export function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// The browser clock is often a few seconds off from the server clock, which made
// a freshly started status appear to begin at 5-7s instead of 0. We measure the
// offset from the server timestamp that came with the last fetch and correct for it.
export function useServerClock(serverTime?: string | null, fetchedAt?: number) {
  const now = useTicker();
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!serverTime || !fetchedAt) return;
    const parsed = new Date(serverTime).getTime();
    if (Number.isNaN(parsed)) return;
    setOffset(parsed - fetchedAt);
  }, [serverTime, fetchedAt]);

  return now + offset;
}

export function elapsedSeconds(startedAt: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}
