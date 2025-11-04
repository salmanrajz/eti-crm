import { useState, useEffect } from 'react';

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
