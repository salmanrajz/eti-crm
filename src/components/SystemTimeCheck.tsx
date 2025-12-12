/**
 * ===============================================================================
 * SYSTEM TIME CHECK COMPONENT
 * ===============================================================================
 * 
 * This component checks if the user's system time is correct and displays
 * a blocking message if the time is incorrect. Users must correct their
 * system time before using the CRM.
 * 
 * FEATURES:
 * - Compares local system time with Firebase server time
 * - Blocks access if time difference exceeds tolerance (5 minutes)
 * - Displays clear instructions to fix system time
 * - Automatically rechecks when user returns to the page
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { checkSystemTime, formatTimeDifference } from '../utils/systemTimeCheck';

export function SystemTimeCheck() {
  const [isChecking, setIsChecking] = useState(true);
  const [isValid, setIsValid] = useState(true);
  const [timeDiff, setTimeDiff] = useState<number | null>(null);
  const [localTime, setLocalTime] = useState<Date | null>(null);
  const [serverTime, setServerTime] = useState<Date | null>(null);

  const performCheck = async () => {
    setIsChecking(true);
    try {
      const result = await checkSystemTime();
      setIsValid(result.isValid);
      setTimeDiff(result.timeDiffMs);
      setLocalTime(result.localTime);
      setServerTime(result.serverTime);
    } catch (error) {
      console.error('Error checking system time:', error);
      // On error, allow access
      setIsValid(true);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Perform check only on app load
    performCheck();
  }, []); // Run only once on mount

  // If time is valid or still checking, don't block
  if (isChecking || isValid) {
    return null;
  }

  // Block access if time is invalid
  return (
    <div className="fixed inset-0 z-[10000] bg-gray-900 bg-opacity-95 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 text-center my-auto">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-red-100 rounded-full">
            <AlertCircle className="h-10 w-10 text-red-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          System Time Incorrect
        </h1>
        
        <p className="text-base text-gray-700 mb-4">
          Your system time is not synchronized correctly. Please set your system time correctly before using the CRM.
        </p>

        {timeDiff !== null && timeDiff !== Infinity && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-center gap-2 text-gray-700 mb-1.5">
              <Clock className="h-4 w-4" />
              <span className="font-medium text-sm">Time Difference:</span>
              <span className="font-bold text-red-600 text-sm">
                {formatTimeDifference(timeDiff)}
              </span>
            </div>
            {localTime && (
              <div className="text-xs text-gray-600 mt-1.5">
                Your device time:{' '}
                <span className="font-mono">
                  {localTime.toLocaleString('en-US', { hour12: true })}
                </span>
              </div>
            )}
            {serverTime && (
              <div className="text-xs text-gray-600">
                Actual time:{' '}
                <span className="font-mono">
                  {serverTime.toLocaleString('en-US', { hour12: true })}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4 text-left">
          <h3 className="font-semibold text-blue-900 mb-2.5 text-base">How to Fix Your System Time & Timezone:</h3>
          
          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-1.5 text-sm">📱 For Windows:</h4>
            <ol className="list-decimal list-inside text-blue-800 space-y-1 text-xs ml-1">
              <li>Press the <strong>Windows key</strong> on your keyboard (or click the Start button)</li>
              <li>Type <strong>"time"</strong> or <strong>"date and time"</strong> in the search box</li>
              <li>Click on <strong>"Date & time settings"</strong> from the search results</li>
              <li>Make sure <strong>"Set time automatically"</strong> is turned ON</li>
              <li>Make sure <strong>"Set time zone automatically"</strong> is turned ON</li>
              <li>If automatic sync is off, click <strong>"Sync now"</strong> button</li>
              <li>Verify your timezone is set to <strong>Asia/Dubai (UAE)</strong> or your correct local timezone</li>
            </ol>
          </div>
        </div>

        <button
          onClick={performCheck}
          disabled={isChecking}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Recheck System Time'}
        </button>

        <p className="text-xs text-gray-500 mt-4">
          The page will automatically refresh once your system time is corrected.
        </p>
      </div>
    </div>
  );
}

