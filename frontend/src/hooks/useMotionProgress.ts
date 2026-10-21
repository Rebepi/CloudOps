import { useEffect, useState } from 'react';

/** Visual interpolation only: the supplied result remains authoritative. */
export function useMotionProgress(replayKey: string | number, duration = 850) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (preference?.matches) { setProgress(1); return; }
    setProgress(0);
    let frame = 0;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const elapsed = Math.min(1, (now - start) / duration);
      setProgress(1 - (1 - elapsed) ** 3);
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replayKey, duration]);
  return progress;
}

export function useAnimatedNumber(value: number, replayKey: string | number = value) {
  const progress = useMotionProgress(`${replayKey}:${value}`);
  return Math.round(value * progress);
}
