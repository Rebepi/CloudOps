import { useAnimatedNumber } from '../../hooks/useMotionProgress';

export function AnimatedNumber({ value, replayKey = value }: { value: number; replayKey?: string | number }) {
  const displayed = useAnimatedNumber(value, replayKey);
  return <span aria-label={String(value)} className="tabular-nums"><span aria-hidden="true">{displayed}</span></span>;
}
