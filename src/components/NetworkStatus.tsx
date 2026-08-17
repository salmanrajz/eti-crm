/**
 * ===============================================================================
 * NETWORK STATUS COMPONENT - INTERNET CONNECTIVITY MONITOR
 * ===============================================================================
 * 
 * This component monitors internet connectivity and displays a banner when
 * the user is offline. It also shows a lightweight warning when the browser
 * reports a slow connection. It uses navigator.onLine plus the Network
 * Information API where available.
 * 
 * FEATURES:
 * - Real-time internet connectivity monitoring
 * - Persistent banner when offline
 * - Lightweight warning for slow connections
 * - Automatic detection when connection quality changes
 * - Non-intrusive UI that doesn't block user interaction
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { WifiOff, Wifi, X, Smartphone, RefreshCw, Router, Globe2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BrowserNetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: EventListener) => void;
  removeEventListener?: (type: 'change', listener: EventListener) => void;
}

type NetworkAwareNavigator = Navigator & {
  connection?: BrowserNetworkInformation;
  mozConnection?: BrowserNetworkInformation;
  webkitConnection?: BrowserNetworkInformation;
};

const SLOW_DOWNLINK_THRESHOLD_MBPS = 1;
const SLOW_RTT_THRESHOLD_MS = 1200;

const getBrowserConnection = () => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const networkNavigator = navigator as NetworkAwareNavigator;
  return (
    networkNavigator.connection ||
    networkNavigator.mozConnection ||
    networkNavigator.webkitConnection
  );
};

const getSlowConnectionState = () => {
  const connection = getBrowserConnection();

  if (!connection) {
    return {
      isSlow: false,
      effectiveType: null as string | null,
      downlink: null as number | null,
      rtt: null as number | null,
      saveData: false
    };
  }

  const effectiveType = connection.effectiveType || null;
  const downlink = typeof connection.downlink === 'number' ? connection.downlink : null;
  const rtt = typeof connection.rtt === 'number' ? connection.rtt : null;
  const saveData = Boolean(connection.saveData);
  const isSlow =
    saveData ||
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    (downlink !== null && downlink < SLOW_DOWNLINK_THRESHOLD_MBPS) ||
    (rtt !== null && rtt > SLOW_RTT_THRESHOLD_MS);

  return {
    isSlow,
    effectiveType,
    downlink,
    rtt,
    saveData
  };
};

const formatConnectionSpeed = (downlink: number | null) => {
  if (downlink === null) {
    return null;
  }

  if (downlink < 1) {
    return `${Math.round(downlink * 1000)} Kbps`;
  }

  return `${downlink.toFixed(downlink >= 10 ? 0 : 1)} Mbps`;
};

const formatEffectiveType = (effectiveType: string | null) => {
  if (!effectiveType) {
    return null;
  }

  return effectiveType.toUpperCase();
};

const OFFLINE_RECOVERY_STEPS = [
  {
    icon: Smartphone,
    label: 'Check Wi-Fi or mobile data'
  },
  {
    icon: RefreshCw,
    label: 'Refresh once you are back online'
  },
  {
    icon: Router,
    label: 'Restart your router if needed'
  },
  {
    icon: Globe2,
    label: 'Test another website'
  }
] as const;

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [slowConnection, setSlowConnection] = useState(() => getSlowConnectionState());
  const [slowWarningDismissed, setSlowWarningDismissed] = useState(false);

  useEffect(() => {
    const connection = getBrowserConnection();

    const syncNetworkState = () => {
      if (typeof navigator === 'undefined') {
        return;
      }

      setIsOnline(navigator.onLine);

      const nextSlowConnection = getSlowConnectionState();
      setSlowConnection(nextSlowConnection);

      if (!nextSlowConnection.isSlow) {
        setSlowWarningDismissed(false);
      }
    };

    const handleOnline = () => syncNetworkState();
    const handleOffline = () => syncNetworkState();
    const handleConnectionChange = () => syncNetworkState();

    syncNetworkState();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection?.removeEventListener?.('change', handleConnectionChange);
    };
  }, []);

  const showSlowConnectionWarning = isOnline && slowConnection.isSlow && !slowWarningDismissed;
  const connectionSpeed = formatConnectionSpeed(slowConnection.downlink);
  const connectionType = formatEffectiveType(slowConnection.effectiveType);

  return (
    <AnimatePresence>
      {!isOnline && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 18, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="fixed inset-0 z-[10000] flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:items-center sm:px-4 sm:pb-4 sm:pt-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="network-status-title"
          >
            <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-[1.9rem] border border-red-200/20 bg-gradient-to-br from-red-500 via-rose-500 to-red-700 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:max-h-[min(42rem,calc(100dvh-2rem))] sm:max-w-2xl">
              <div className="px-5 pt-3 sm:hidden">
                <div className="mx-auto h-1.5 w-14 rounded-full bg-white/30" />
              </div>
              <div className="relative overflow-hidden p-5 sm:p-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_28%)]" />
                <div className="relative flex flex-col gap-5 sm:gap-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/14 shadow-lg ring-1 ring-white/20 sm:h-16 sm:w-16">
                      <WifiOff className="h-7 w-7 text-white sm:h-8 sm:w-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90 ring-1 ring-white/15">
                        Offline
                      </span>
                      <h3
                        id="network-status-title"
                        className="mt-2 text-xl font-bold tracking-tight text-white sm:text-[2rem]"
                      >
                        No Internet Connection
                      </h3>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {OFFLINE_RECOVERY_STEPS.map(({ icon: Icon, label }) => (
                      <div
                        key={label}
                        className="rounded-2xl bg-black/12 px-4 py-3.5 shadow-sm ring-1 ring-white/12"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/12">
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <p className="pt-0.5 text-sm font-medium leading-5 text-white sm:text-[15px]">
                            {label}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}

      {showSlowConnectionWarning && (
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-x-0 top-0 z-[9998] px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none sm:left-1/2 sm:right-auto sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:px-4"
        >
          <div className="pointer-events-auto rounded-[1.35rem] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 shadow-xl ring-1 ring-amber-100/70 backdrop-blur-xl">
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-2xl bg-amber-100 p-2.5 text-amber-700 shadow-sm ring-1 ring-amber-200">
                  <Wifi className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-amber-950 sm:text-base">
                      Slow internet connection detected
                    </p>
                    {(connectionSpeed || connectionType) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                        {connectionSpeed ? `Estimate: ${connectionSpeed}` : `Type: ${connectionType}`}
                      </span>
                    )}
                    {slowConnection.rtt !== null && (
                      <span className="rounded-full bg-amber-100/70 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200/80">
                        Ping: {slowConnection.rtt} ms
                      </span>
                    )}
                    {slowConnection.saveData && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800 ring-1 ring-orange-200">
                        Data saver on
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end sm:justify-start">
                <button
                  type="button"
                  onClick={() => setSlowWarningDismissed(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-white"
                  aria-label="Dismiss slow connection warning"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
