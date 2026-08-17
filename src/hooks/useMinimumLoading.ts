import { useState, useEffect } from 'react';

let splashHold = false;
let initialSplashDismissed = false;
const splashHoldListeners = new Set<() => void>();

export function setSplashHold(hold: boolean) {
  const nextHold = hold && !initialSplashDismissed;
  if (splashHold === nextHold) return;
  splashHold = nextHold;
  splashHoldListeners.forEach((listener) => listener());
}

export function dismissInitialSplash() {
  if (initialSplashDismissed) return;
  initialSplashDismissed = true;
  if (!splashHold) return;
  splashHold = false;
  splashHoldListeners.forEach((listener) => listener());
}

export function useSplashHold() {
  const [hold, setHold] = useState(splashHold);

  useEffect(() => {
    const listener = () => setHold(splashHold);
    splashHoldListeners.add(listener);
    return () => {
      splashHoldListeners.delete(listener);
    };
  }, []);

  return hold;
}

export function useMinimumLoading(actualLoading: boolean, minimumDuration: number = 800) {
  const [showLoading, setShowLoading] = useState(true);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (!actualLoading) {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minimumDuration - elapsed);
      
      if (remaining > 0) {
        const timer = setTimeout(() => {
          setShowLoading(false);
        }, remaining);
        
        return () => clearTimeout(timer);
      } else {
        setShowLoading(false);
      }
    }
  }, [actualLoading, startTime, minimumDuration]);

  return showLoading;
}
