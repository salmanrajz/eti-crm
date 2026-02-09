/**
 * BroadcastModal - Global and targeted broadcast announcements
 * - GLOBAL: Send to all users (config/broadcastPoster)
 * - TARGETED: Select specific users, add multiple broadcasts at once
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, getDocs, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User } from '../../types';
import { Sparkles, X, Globe, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

export interface BroadcastRow {
  id: string;
  recipientIds: string[];
  title: string;
  message: string;
}

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  currentUserName?: string;
}

export function BroadcastModal({ isOpen, onClose, currentUserId, currentUserName }: BroadcastModalProps) {
  const [activeTab, setActiveTab] = useState<'global' | 'targeted'>('global');
  const [globalTitle, setGlobalTitle] = useState('');
  const [globalMessage, setGlobalMessage] = useState('');
  const [broadcastRows, setBroadcastRows] = useState<BroadcastRow[]>([
    { id: `row-${Date.now()}`, recipientIds: [], title: '', message: '' }
  ]);
  const [broadcastUsers, setBroadcastUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [broadcastUsersLoading, setBroadcastUsersLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewRow, setPreviewRow] = useState<BroadcastRow | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const loadData = async () => {
      setBroadcastUsersLoading(true);
      try {
        const [usersSnap, teamsSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', 'in', ['agent', 'manager', 'freelancer', 'coordinator', 'verifier']))),
          getDocs(collection(db, 'teams'))
        ]);
        setBroadcastUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        setTeams(teamsSnap.docs.map(d => ({ id: d.id, name: (d.data().name || d.data().teamName || d.id) as string })));
      } catch (error) {
        console.error('Failed to load users/teams for broadcast', error);
        toast.error('Failed to load users');
      } finally {
        setBroadcastUsersLoading(false);
      }
    };
    loadData();
  }, [isOpen]);

  // Group users by team: team first, then user within each team
  const usersByTeam = useMemo(() => {
    const teamMap = new Map<string, { teamName: string; users: User[] }>();
    for (const t of teams) {
      teamMap.set(t.id, { teamName: t.name, users: [] });
    }
    const noTeam: User[] = [];
    for (const u of broadcastUsers) {
      const teamId = u.teamId;
      if (teamId && teamMap.has(teamId)) {
        teamMap.get(teamId)!.users.push(u);
      } else {
        noTeam.push(u);
      }
    }
    for (const entry of teamMap.values()) {
      entry.users.sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '', undefined, { sensitivity: 'base' }));
    }
    noTeam.sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '', undefined, { sensitivity: 'base' }));
    const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return { sortedTeams, teamMap, noTeam };
  }, [broadcastUsers, teams]);

  const userMap = useMemo(() => new Map(broadcastUsers.map(u => [u.id, u])), [broadcastUsers]);

  // Per-row: which team is selected for the user picker
  const [selectedTeamByRow, setSelectedTeamByRow] = useState<Record<string, string>>({});

  const handleSendGlobal = useCallback(async () => {
    if (!globalTitle.trim() || !globalMessage.trim()) {
      toast.error('Enter title and message');
      return;
    }
    setIsSending(true);
    try {
      const posterId = `global-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await setDoc(doc(db, 'config', 'broadcastPoster'), {
        posterId,
        title: globalTitle.trim(),
        message: globalMessage.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: currentUserId || 'admin',
        updatedByName: currentUserName || 'Admin'
      });
      toast.success('Global broadcast sent to all users');
      setGlobalTitle('');
      setGlobalMessage('');
      onClose();
    } catch (error) {
      console.error('Failed to send global broadcast', error);
      toast.error('Failed to send global broadcast');
    } finally {
      setIsSending(false);
    }
  }, [globalTitle, globalMessage, currentUserId, currentUserName, onClose]);

  const handleSendTargeted = useCallback(async () => {
    const validRows = broadcastRows.filter(r => r.recipientIds.length > 0 && r.title.trim() && r.message.trim());
    if (validRows.length === 0) {
      toast.error('Add at least one broadcast with recipients, title, and message');
      return;
    }
    setIsSending(true);
    try {
      let totalSent = 0;
      for (const row of validRows) {
        const posterId = `poster-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const broadcastData = {
          posterId,
          title: row.title.trim(),
          message: row.message.trim(),
          createdAt: serverTimestamp(),
          createdBy: currentUserId || 'admin',
          createdByName: currentUserName || 'Admin'
        };
        for (const userId of row.recipientIds) {
          await setDoc(doc(db, 'users', userId, 'broadcasts', posterId), broadcastData);
          totalSent++;
        }
      }
      toast.success(`Broadcast(s) sent to ${totalSent} user(s)`);
      onClose();
      setBroadcastRows([{ id: `row-${Date.now()}`, recipientIds: [], title: '', message: '' }]);
      setSelectedTeamByRow({});
    } catch (error) {
      console.error('Failed to send broadcast', error);
      toast.error('Failed to send broadcast(s)');
    } finally {
      setIsSending(false);
    }
  }, [broadcastRows, currentUserId, currentUserName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 relative flex flex-col"
      >
        {/* Preview overlay */}
        {showPreview && (previewRow || activeTab === 'global') && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
            <div className="w-full max-w-2xl bg-white/10 rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
              <div className="flex items-center justify-between bg-white/10 px-4 py-3 border-b border-white/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  Preview
                </div>
                <button
                  onClick={() => { setShowPreview(false); setPreviewRow(null); }}
                  className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-gradient-to-br from-rose-800 via-orange-900 to-amber-900 text-white p-6">
                <div className="flex flex-col items-center text-center gap-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span className="text-amber-300 text-sm uppercase tracking-[0.2em] font-semibold">Announcement</span>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                  </div>
                  <p className="text-xs font-semibold text-amber-200/90">
                    {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <div className="w-full max-w-sm h-0.5 bg-amber-200/70 mt-1 mb-2" />
                  <h2 className="text-2xl font-semibold text-amber-100 drop-shadow">
                    {(activeTab === 'global' ? globalTitle : previewRow?.title) || 'Announcement Title'}
                  </h2>
                </div>
                <div className="mt-5 text-sm text-amber-50/90 leading-relaxed whitespace-pre-line">
                  {(activeTab === 'global' ? globalMessage : previewRow?.message) || 'Your announcement message.'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl border border-white/10">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-200/80">Broadcast Poster</p>
              <h3 className="text-xl font-semibold text-white">Send Announcements</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('global')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'global'
                ? 'text-amber-600 border-b-2 border-amber-600 bg-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Globe className="w-4 h-4" />
            Global (All Users)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('targeted')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'targeted'
                ? 'text-amber-600 border-b-2 border-amber-600 bg-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            Targeted (Selected Users)
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'global' ? (
            <>
              <p className="text-sm text-gray-600">
                Send an announcement to all users. Everyone will see it until they acknowledge.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Title</label>
                  <input
                    type="text"
                    value={globalTitle}
                    onChange={(e) => setGlobalTitle(e.target.value)}
                    placeholder="Announcement headline"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Message</label>
                  <textarea
                    value={globalMessage}
                    onChange={(e) => setGlobalMessage(e.target.value)}
                    rows={4}
                    placeholder="Details of the announcement..."
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200"
                >
                  Preview
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Add one or more broadcasts. Each broadcast goes only to the selected users. Recipients see only broadcasts sent to them.
              </p>

              {broadcastRows.map((row, idx) => (
            <div key={row.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Broadcast #{idx + 1}</span>
                {broadcastRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBroadcastRows(prev => prev.filter(r => r.id !== row.id))}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">Recipients</label>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={selectedTeamByRow[row.id] ?? ''}
                    onChange={(e) => setSelectedTeamByRow(prev => ({ ...prev, [row.id]: e.target.value }))}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
                  >
                    <option value="">Select team...</option>
                    {usersByTeam.sortedTeams.map((team) => {
                      const entry = usersByTeam.teamMap.get(team.id);
                      if (!entry || entry.users.length === 0) return null;
                      return (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      );
                    })}
                    {usersByTeam.noTeam.length > 0 && (
                      <option value="__no_team__">No Team</option>
                    )}
                  </select>
                  <select
                    value=""
                    onChange={(e) => {
                      const uid = e.target.value;
                      if (!uid) return;
                      setBroadcastRows(prev => prev.map(r => r.id === row.id ? { ...r, recipientIds: [...new Set([...r.recipientIds, uid])] } : r));
                      e.target.value = '';
                    }}
                    disabled={!selectedTeamByRow[row.id]}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select user...</option>
                    {selectedTeamByRow[row.id] === '__no_team__'
                      ? usersByTeam.noTeam
                          .filter(u => !row.recipientIds.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name || u.email} ({u.role})
                            </option>
                          ))
                      : selectedTeamByRow[row.id]
                        ? (usersByTeam.teamMap.get(selectedTeamByRow[row.id])?.users ?? [])
                            .filter(u => !row.recipientIds.includes(u.id))
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name || u.email} ({u.role})
                              </option>
                            ))
                      : null}
                  </select>
                </div>
                {row.recipientIds.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-600 mb-1">Selected users</p>
                    <div className="flex flex-wrap gap-2">
                      {row.recipientIds.map((uid) => {
                        const u = userMap.get(uid);
                        return (
                          <span
                            key={uid}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-800 text-sm font-medium"
                          >
                            {u ? (u.name || u.email) : uid}
                            <button
                              type="button"
                              onClick={() => setBroadcastRows(prev => prev.map(r => r.id === row.id ? { ...r, recipientIds: r.recipientIds.filter(id => id !== uid) } : r))}
                              className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
                              aria-label="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={row.title}
                  onChange={(e) => setBroadcastRows(prev => prev.map(r => r.id === row.id ? { ...r, title: e.target.value } : r))}
                  placeholder="Announcement headline"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Message</label>
                <textarea
                  value={row.message}
                  onChange={(e) => setBroadcastRows(prev => prev.map(r => r.id === row.id ? { ...r, message: e.target.value } : r))}
                  rows={3}
                  placeholder="Details of the announcement..."
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <button
                type="button"
                onClick={() => { setPreviewRow(row); setShowPreview(true); }}
                className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200"
              >
                Preview
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setBroadcastRows(prev => [...prev, { id: `row-${Date.now()}`, recipientIds: [], title: '', message: '' }])}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-colors"
          >
            + Add another broadcast
          </button>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          {activeTab === 'global' ? (
            <motion.button
              whileHover={{ scale: isSending ? 1 : 1.02 }}
              whileTap={{ scale: isSending ? 1 : 0.98 }}
              onClick={handleSendGlobal}
              disabled={isSending}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending...' : 'Send to All'}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: isSending ? 1 : 1.02 }}
              whileTap={{ scale: isSending ? 1 : 0.98 }}
              onClick={handleSendTargeted}
              disabled={isSending}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending...' : 'Send Broadcasts'}
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
