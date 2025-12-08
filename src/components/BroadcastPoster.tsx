import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { useAuthStore } from '../store/authStore';

/**
 * BroadcastPoster
 * Premium curtain-style announcement for all users.
 * - Admin sets the poster content in Firestore at `config/broadcastPoster`
 * - All users see it on next refresh if not yet acknowledged
 * - Once acknowledged, it hides for that user until admin sends again
 */
export const BroadcastPoster: React.FC = () => {
  const { user } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [posterId, setPosterId] = useState<string>('');
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  // Collection paths
  const posterDocRef = doc(db, 'config', 'broadcastPoster');
  const ackDocRef = user ? doc(db, 'users', user.id, 'meta', 'broadcastAck') : null;

  const checkAckAndShow = useCallback(
    async (incomingId: string, incomingTitle: string, incomingMessage: string) => {
      if (!user || !ackDocRef) {
        setVisible(false);
        return;
      }

      const ackSnap = await getDoc(ackDocRef);
      const ackData = ackSnap.exists() ? ackSnap.data() : {};
      const acknowledgedId = ackData?.posterId;

      if (acknowledgedId === incomingId) {
        setVisible(false);
        return;
      }

      // Show new poster unless user dismissed this session
      if (!dismissedThisSession) {
        setPosterId(incomingId);
        setTitle(incomingTitle);
        setMessage(incomingMessage);
        setVisible(true);
      }
    },
    [ackDocRef, user, dismissedThisSession]
  );

  // Listen for poster updates
  useEffect(() => {
    const unsub = onSnapshot(posterDocRef, (snap) => {
      const data = snap.data();
      if (!data || !data.posterId || !data.title || !data.message) {
        setVisible(false);
        return;
      }
      checkAckAndShow(data.posterId, data.title, data.message);
    });

    return () => unsub();
  }, [posterDocRef, checkAckAndShow]);

  const handleAcknowledge = async () => {
    if (!user || !ackDocRef || !posterId) {
      setVisible(false);
      return;
    }

    await setDoc(ackDocRef, { posterId, acknowledgedAt: new Date() }, { merge: true });
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Curtain effect container */}
          <motion.div
            className="relative w-[90vw] max-w-3xl"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1, originY: 0 }}
            exit={{ scaleY: 0, opacity: 0, originY: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {/* Premium rust-inspired gradient poster (inverted & dimmed) */}
            <div className="relative overflow-hidden rounded-3xl shadow-2xl border border-white/15 bg-gradient-to-br from-rose-800/90 via-orange-900/90 to-amber-900/90 text-white p-8 backdrop-blur-lg">
              {/* Glass overlay */}
              <div className="absolute inset-0 bg-white/5 backdrop-blur-sm pointer-events-none" />
              {/* Dimmed sparkle overlay */}
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(255,219,182,0.08),_transparent_40%)]" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_bottom_right,_rgba(255,191,160,0.06),_transparent_45%)]" />

              <div className="relative z-10">
                <button
                  onClick={() => {
                    setVisible(false);
                    setDismissedThisSession(true); // hide for this session only
                  }}
                  className="absolute top-0 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
                  aria-label="Dismiss poster"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                <div className="flex flex-col items-center text-center gap-1 pt-0 -mt-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-white/10 rounded-xl border border-white/10 shadow-lg">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                    </div>
                    <div className="text-amber-300 text-sm uppercase tracking-[0.2em] font-semibold">
                      Announcement
                    </div>
                    <div className="p-2 bg-white/10 rounded-xl border border-white/10 shadow-lg">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-amber-200/90">
                    {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <div className="w-full max-w-sm h-0.5 bg-amber-200/70 mt-1 mb-2" />
                  <h2 className="text-3xl font-semibold text-amber-200 drop-shadow mt-1">{title}</h2>
                </div>
              </div>

              <div className="mt-6 text-sm text-gray-100 leading-relaxed whitespace-pre-line relative z-10">
                {message}
              </div>

              <div className="mt-8 flex justify-end relative z-10">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAcknowledge}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-900 font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  I Acknowledge
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

