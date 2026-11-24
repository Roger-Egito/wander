/**
 * Small hooks for keeping the Editor fast while typing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The value, once it has stopped changing for `ms`: typing updates the input at once,
 * and heavy work that reads the settled value (validating the sheet, rebuilding the
 * preview) runs once per pause instead of once per letter. When `sameKey` says the new
 * value is a different thing altogether (another row, another type), it passes through
 * immediately, so nothing ever shows the previous row's result.
 */
export function useSettled<T>(value: T, ms: number, sameKey: (a: T, b: T) => boolean): T {
  const [settled, setSettled] = useState(value);
  const current = useRef(settled);
  current.current = settled;
  useEffect(() => {
    if (!sameKey(current.current, value)) {
      setSettled(value);
      return;
    }
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms, sameKey]);
  return sameKey(settled, value) ? settled : value;
}

/**
 * A function that keeps one identity across renders but always runs the latest code,
 * so passing it to a memoized child doesn't re-render that child on every keystroke.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}
