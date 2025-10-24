import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { CalendarDays, Trash2 } from 'lucide-react';

const DEFAULT_NOTICE = {
  message: `Adding *RAK* info\n\nDear Partners,\n\nPlease *share Fujairah area leads on daily basis* starting from tomorrow.\nFor *Sharjah Far Areas*, visits will be on *Tuesday & Friday*\n\nFujairah Areas (Dibba, Al Halah, Masafi, Diftah, Bitnah, Sharm, Bidya, Khorfakkan, Qidfi, Al Qurrayah, Fujairah & Kalba)\n\nSharjah Far Areas (Falaj Al Mualla, Batayeh, Dhaid, Manama, Ghayl, Milehah & Al Madam)\n\n*RAK will be visited 3 times in a week - Monday, Wednesday & Friday*\n\nPlease note these are temporary changes for the month of June.`,
  table: [
    { area: 'Fujairah Areas', days: 'Daily' },
    { area: 'Sharjah Far Areas', days: 'Tuesday, Friday' },
    { area: 'RAK', days: 'Monday, Wednesday, Friday' },
  ],
};

function parseMessage(msg: string) {
  // Simple markdown: *bold*, _italic_
  return msg.split('\n').map((line, i) => (
    <div key={i}>
      {line.replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>')}
    </div>
  ));
}

const NoticeBoard = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuthStore();
  const [notice, setNotice] = useState(DEFAULT_NOTICE);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(DEFAULT_NOTICE.message);
  const [table, setTable] = useState(DEFAULT_NOTICE.table);

  useEffect(() => {
    const fetchNotice = async () => {
      setLoading(true);
      const docRef = doc(db, 'notices', 'schedule');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setNotice(snap.data() as typeof DEFAULT_NOTICE);
        setMessage(snap.data().message);
        setTable(snap.data().table);
      }
      setLoading(false);
    };
    fetchNotice();
  }, []);

  const isCoordinator = user?.role === 'coordinator';

  const handleSave = async () => {
    setSaving(true);
    const docRef = doc(db, 'notices', 'schedule');
    await setDoc(docRef, { message, table });
    setNotice({ message, table });
    setEditMode(false);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="w-full max-w-xl bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-indigo-200/60 animate-fade-in relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-indigo-500/90 to-purple-600/90 text-white shadow">
          <div className="bg-white/20 rounded-full p-2 flex items-center justify-center">
            <CalendarDays className="h-6 w-6 text-white drop-shadow" />
          </div>
          <span className="font-bold text-xl tracking-wide">Schedule Notice Board</span>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white transition-colors text-2xl font-light">✕</button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center text-gray-400">Loading...</div>
          ) : editMode ? (
            <div className="space-y-6">
              <div>
                <label className="block font-semibold mb-2 text-indigo-700">Message</label>
                <textarea
                  className="w-full border-2 border-indigo-200 rounded-lg p-3 text-base bg-white/70 focus:ring-2 focus:ring-indigo-400 transition"
                  rows={6}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-semibold mb-2 text-indigo-700">Area & Days Table</label>
                <table className="w-full border border-indigo-200 text-base">
                  <thead>
                    <tr className="bg-indigo-50/80">
                      <th className="p-2 border border-indigo-200 text-indigo-700">Area</th>
                      <th className="p-2 border border-indigo-200 text-indigo-700">Days</th>
                      <th className="p-2 border border-indigo-200 text-indigo-700 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-1 border border-indigo-200 text-center">
                          <input
                            className="w-full border border-indigo-200 rounded-lg px-2 py-1 bg-white/80"
                            value={row.area}
                            onChange={e => {
                              const t = [...table];
                              t[idx].area = e.target.value;
                              setTable(t);
                            }}
                          />
                        </td>
                        <td className="p-1 border border-indigo-200 text-center">
                          <input
                            className="w-full border border-indigo-200 rounded-lg px-2 py-1 bg-white/80"
                            value={row.days}
                            onChange={e => {
                              const t = [...table];
                              t[idx].days = e.target.value;
                              setTable(t);
                            }}
                          />
                        </td>
                        <td className="p-1 border border-indigo-200 text-center">
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-red-100 group"
                            aria-label="Delete row"
                            onClick={() => setTable(table.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4 text-red-500 group-hover:text-red-700" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  className="mt-3 text-sm text-indigo-600 hover:underline hover:text-indigo-800 transition"
                  onClick={() => setTable([...table, { area: '', days: '' }])}
                >
                  + Add Row
                </button>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition"
                  onClick={() => setEditMode(false)}
                  disabled={saving}
                >Cancel</button>
                <button
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold shadow hover:from-indigo-600 hover:to-purple-700 transition"
                  onClick={handleSave}
                  disabled={saving}
                >{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="prose prose-sm max-w-none text-gray-800 bg-white/60 rounded-lg p-4 border border-indigo-100 shadow-sm">
                {notice.message.split('\n').map((line, i) => (
                  <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>') }} />
                ))}
              </div>
              <div>
                <div className="mb-2 font-semibold text-indigo-700">Area & Days</div>
                <table className="w-full border border-indigo-200 text-base">
                  <thead>
                    <tr className="bg-indigo-50/80">
                      <th className="p-2 border border-indigo-200 text-indigo-700">Area</th>
                      <th className="p-2 border border-indigo-200 text-indigo-700">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notice.table.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border border-indigo-200 text-center">
                          <span className="font-semibold text-indigo-700 text-sm">{row.area}</span>
                        </td>
                        <td className="p-2 border border-indigo-200 text-center">
                          <span className="font-semibold text-purple-700 text-sm">{row.days}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isCoordinator && (
                <div className="flex justify-end pt-2">
                  <button
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold shadow hover:from-indigo-600 hover:to-purple-700 transition"
                    onClick={() => setEditMode(true)}
                  >Edit</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoticeBoard; 