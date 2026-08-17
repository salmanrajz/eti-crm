import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuthStore } from '../store/authStore';

type BroadcastSource = 'global' | 'targeted';

/**
 * BroadcastPoster
 * Premium curtain-style announcements.
 * - GLOBAL: Admin sets at config/broadcastPoster - all users see it until acknowledged
 * - TARGETED: Admin sends to selected users only - each user sees only broadcasts sent to them
 */
export const BroadcastPoster: React.FC = () => {
  const { user } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [posterId, setPosterId] = useState<string>('');
  const [source, setSource] = useState<BroadcastSource>('global');
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [targetedRefresh, setTargetedRefresh] = useState(0);

  const posterDocRef = doc(db, 'config', 'broadcastPoster');
  const ackDocRef = user ? doc(db, 'users', user.id, 'meta', 'broadcastAck') : null;
  const broadcastsRef = user ? collection(db, 'users', user.id, 'broadcasts') : null;
  const broadcastsQuery = broadcastsRef ? query(broadcastsRef, orderBy('createdAt', 'desc')) : null;

  const checkGlobalAndShow = useCallback(
    async (incomingId: string, incomingTitle: string, incomingMessage: string) => {
      if (!user || !ackDocRef || dismissedThisSession) return false;
      const ackSnap = await getDoc(ackDocRef);
      const ackData = ackSnap.exists() ? ackSnap.data() : {};
      if (ackData?.posterId === incomingId) return false;
      setPosterId(incomingId);
      setTitle(incomingTitle);
      setMessage(incomingMessage);
      setSource('global');
      setVisible(true);
      return true;
    },
    [ackDocRef, user, dismissedThisSession]
  );

  // 1. Listen to GLOBAL broadcast (config/broadcastPoster) - always available
  useEffect(() => {
    const unsub = onSnapshot(posterDocRef, (snap) => {
      const data = snap.data();
      if (!data?.posterId || !data?.title || !data?.message) return;
      checkGlobalAndShow(data.posterId, data.title, data.message);
    });
    return () => unsub();
  }, [posterDocRef, checkGlobalAndShow]);

  // 2. Listen to TARGETED broadcasts - show only when no unacked global
  useEffect(() => {
    if (!user || !broadcastsQuery || dismissedThisSession) return;
    const unsub = onSnapshot(broadcastsQuery, async (snap) => {
      const docs = snap.docs;
      if (docs.length === 0) return;
      // Don't show targeted if there's an unacked global
      if (ackDocRef) {
        const posterSnap = await getDoc(posterDocRef);
        const posterData = posterSnap.data();
        if (posterData?.posterId) {
          const ackSnap = await getDoc(ackDocRef);
          const ackData = ackSnap.exists() ? ackSnap.data() : {};
          if (ackData?.posterId !== posterData.posterId) return; // Global is active, skip targeted
        }
      }
      const latest = docs[0];
      const data = latest.data();
      if (data?.title != null && data?.message != null) {
        setPosterId(latest.id);
        setTitle(data.title);
        setMessage(data.message);
        setSource('targeted');
        setVisible(true);
      }
    });
    return () => unsub();
  }, [user?.id, broadcastsQuery, dismissedThisSession, ackDocRef, targetedRefresh]);

  const handleAcknowledge = async () => {
    if (!user || !posterId) {
      setVisible(false);
      return;
    }
    const wasGlobal = source === 'global';
    try {
      if (wasGlobal && ackDocRef) {
        await setDoc(ackDocRef, { posterId, acknowledgedAt: new Date() }, { merge: true });
      } else if (source === 'targeted') {
        await deleteDoc(doc(db, 'users', user.id, 'broadcasts', posterId));
      }
    } catch {
      // Fallback: just hide
    }
    setVisible(false);
    if (wasGlobal) setTargetedRefresh((t) => t + 1); // Re-check targeted after ack global
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
            <div className="relative flex flex-col overflow-hidden rounded-3xl shadow-2xl border border-white/15 bg-gradient-to-br from-rose-800/90 via-orange-900/90 to-amber-900/90 text-white backdrop-blur-lg max-h-[90vh]">
              {/* Glass overlay */}
              <div className="absolute inset-0 bg-white/5 backdrop-blur-sm pointer-events-none" />
              {/* Dimmed sparkle overlay */}
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(255,219,182,0.08),_transparent_40%)]" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_bottom_right,_rgba(255,191,160,0.06),_transparent_45%)]" />

              {/* Header - Fixed */}
              <div className="relative z-10 flex-shrink-0 p-8 pb-4">
                <button
                  onClick={() => {
                    setVisible(false);
                    setDismissedThisSession(true); // hide for this session only
                  }}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors z-20"
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

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto px-8 py-4 relative z-10">
                <div className="text-sm text-gray-100 leading-relaxed whitespace-pre-line">
                  {message}
                </div>
              </div>

              {/* Footer with Button - Fixed */}
              <div className="flex-shrink-0 px-8 pb-8 pt-4 flex justify-end relative z-10 border-t border-white/10">
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

