import { useState, useEffect, useRef } from 'react';

/**
 * Animates a number from 0 to `target` over `duration` ms using
 * requestAnimationFrame with an ease-out-cubic curve.
 * Re-triggers whenever `target` changes.
 *
 * @param {number} target   - The final value to count up to.
 * @param {number} duration - Animation duration in milliseconds (default 1500).
 * @returns {number} The current animated value.
 */
export function useCountUp(target, duration = 1500) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }

    startTimeRef.current = null;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function animate(timestamp) {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return value;
}

export default useCountUp;
