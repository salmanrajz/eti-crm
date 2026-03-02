/**
 * Download Verification Media - Admin tool to download verification media by date
 * Streams ZIP directly from Cloud Function (no storage, no public URLs)
 */

import { useState, useEffect } from 'react';
import { auth, firebaseApp } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { Download, Calendar, FileImage, Loader2, X } from 'lucide-react';

interface DownloadVerificationMediaProps {
  isOpen: boolean;
  onClose: () => void;
}

const FUNCTION_REGION = 'us-central1';

export function DownloadVerificationMedia({ isOpen, onClose }: DownloadVerificationMediaProps) {
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  const handleDownload = async () => {
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast.error('Please sign in');
      return;
    }

    setDownloading(true);
    setProgress('Preparing download...');
    setError(null);

    try {
      const token = await user.getIdToken();
      const projectId = firebaseApp.options.projectId;
      const url = `https://${FUNCTION_REGION}-${projectId}.cloudfunctions.net/downloadVerificationMediaHTTP?date=${encodeURIComponent(selectedDate)}`;

      setProgress('Downloading...');

      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || res.statusText || 'Download failed';
        if (res.status === 403) {
          setError('Admin access required');
          toast.error('Admin access required');
        } else if (res.status === 404) {
          setError('No recordings found for this date.');
          toast.error('No recordings found for this date.');
        } else {
          setError(msg);
          toast.error(msg);
        }
        return;
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `verification-media-${selectedDate}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setError(null);
      toast.success(`Downloaded verification media for ${format(new Date(selectedDate), 'dd MMM yyyy')}`);
      onClose();
    } catch (error: unknown) {
      console.error('Download verification media failed:', error);
      const err = error as { message?: string };
      const msg = err.message || 'Failed to download verification media';
      setError(msg);
      toast.error(msg);
    } finally {
      setDownloading(false);
      setProgress('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileImage className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-semibold text-gray-900">Download Verification Media</h2>
            </div>
            <button
              onClick={onClose}
              disabled={downloading}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Download all verification media from leads created on the selected date as a ZIP file.
           
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setError(null);
                  }}
                  disabled={downloading}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            {progress && (
              <div className="flex items-center gap-2 text-sm text-indigo-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{progress}</span>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              disabled={downloading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
