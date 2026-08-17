import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const COLS = 5;
const ROWS = 5;
const TOTAL = COLS * ROWS;

function cubicEase(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function ModernLoading() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 800;

    const tick = () => {
      const elapsed = Date.now() - start;
      const raw = Math.min(elapsed / duration, 1);
      setProgress(cubicEase(raw) * 100);
      if (raw < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
    >
      {/* Ambient glow orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          }}
          animate={{ scale: [1, 0.9, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-10">
        {/* Cubic grid */}
        <div
          className="grid gap-[6px]"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {Array.from({ length: TOTAL }).map((_, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            // Wave delay: diagonal ripple
            const delay = (row + col) * 0.08;

            return (
              <motion.div
                key={i}
                className="rounded-[3px] relative overflow-hidden"
                style={{ width: 28, height: 28 }}
                initial={{ opacity: 0, scale: 0.2, rotateX: 90 }}
                animate={{
                  opacity: [0, 1, 1, 0.5, 1],
                  scale: [0.2, 1, 0.88, 1, 0.92, 1],
                  rotateX: [90, 0, 0, 0, 0],
                }}
                transition={{
                  duration: 1.8,
                  delay,
                  repeat: Infinity,
                  repeatDelay: TOTAL * 0.08 + 0.6,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
              >
                {/* Cube face */}
                <div
                  className="absolute inset-0 rounded-[3px]"
                  style={{
                    background: `linear-gradient(135deg,
                      rgba(${99 + col * 8},${102 + row * 8},241,0.9) 0%,
                      rgba(139,92,246,0.85) 100%)`,
                    boxShadow: `0 0 12px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)`,
                  }}
                />
                {/* Highlight shimmer */}
                <motion.div
                  className="absolute inset-0 rounded-[3px]"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)',
                  }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{
                    duration: 1.6,
                    delay: delay + 0.2,
                    repeat: Infinity,
                    repeatDelay: TOTAL * 0.08 + 0.6,
                  }}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Brand + text */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <p
            className="text-[11px] font-semibold tracking-[0.3em] uppercase"
            style={{ color: 'rgba(99,102,241,0.5)' }}
          >
            Initialising
          </p>

          {/* Progress bar */}
          <div
            className="w-[140px] h-[2px] rounded-full overflow-hidden"
            style={{ background: 'rgba(99,102,241,0.12)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))',
                boxShadow: '0 0 8px rgba(139,92,246,0.7)',
              }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.05, ease: 'linear' }}
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}