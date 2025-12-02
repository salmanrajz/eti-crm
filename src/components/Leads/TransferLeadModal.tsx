/**
 * Transfer Lead Modal Component
 * Allows admins to transfer leads from one agent to another, including cross-team transfers
 */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { X, Users, User, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lead, Team, User as UserType } from '../../types';
import { useAuthStore } from '../../store/authStore';

interface TransferLeadModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onTransferComplete: () => void;
}

export function TransferLeadModal({ lead, isOpen, onClose, onTransferComplete }: TransferLeadModalProps) {
  const { user } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [agents, setAgents] = useState<UserType[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<UserType | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);

  // Load teams
  useEffect(() => {
    if (!isOpen) return;

    const loadTeams = async () => {
      try {
        setLoadingTeams(true);
        const teamsQuery = query(collection(db, 'teams'));
        const snapshot = await getDocs(teamsQuery);
        const teamsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Team[];

        // Sort teams alphabetically
        teamsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setTeams(teamsData);

        // Load current agent and team info
        if (lead.agentId) {
          const agentDoc = await getDoc(doc(db, 'users', lead.agentId));
          if (agentDoc.exists()) {
            const agentData = { id: agentDoc.id, ...agentDoc.data() } as UserType;
            setCurrentAgent(agentData);

            if (agentData.teamId) {
              const teamDoc = await getDoc(doc(db, 'teams', agentData.teamId));
              if (teamDoc.exists()) {
                setCurrentTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading teams:', error);
        toast.error('Failed to load teams');
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [isOpen, lead.agentId]);

  // Load agents when team is selected
  useEffect(() => {
    if (!isOpen || !selectedTeamId) {
      setAgents([]);
      setSelectedAgentId('');
      return;
    }

    const loadAgents = async () => {
      try {
        setLoadingAgents(true);
        const agentsQuery = query(
          collection(db, 'users'),
          where('teamId', '==', selectedTeamId),
          where('role', 'in', ['agent', 'freelancer'])
        );
        const snapshot = await getDocs(agentsQuery);
        const agentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as UserType[];

        // Sort agents alphabetically
        agentsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setAgents(agentsData);
        setSelectedAgentId(''); // Reset selection when team changes
      } catch (error) {
        console.error('Error loading agents:', error);
        toast.error('Failed to load agents');
      } finally {
        setLoadingAgents(false);
      }
    };

    loadAgents();
  }, [selectedTeamId, isOpen]);

  const handleTransfer = async () => {
    if (!selectedAgentId || !selectedTeamId) {
      toast.error('Please select a team and agent');
      return;
    }

    if (selectedAgentId === lead.agentId) {
      toast.error('Please select a different agent');
      return;
    }

    setLoading(true);
    try {
      const agentDoc = await getDoc(doc(db, 'users', selectedAgentId));
      if (!agentDoc.exists()) {
        toast.error('Selected agent not found');
        return;
      }

      const agentData = agentDoc.data();
      const selectedTeamDoc = await getDoc(doc(db, 'teams', selectedTeamId));
      const selectedTeamData = selectedTeamDoc.exists() ? selectedTeamDoc.data() : null;

      // Get current agent name for remark
      const currentAgentName = currentAgent?.name || 'Unknown Agent';
      const newAgentName = agentData.name || 'Unknown Agent';
      const currentTeamName = currentTeam?.name || 'Unknown Team';
      const newTeamName = selectedTeamData?.name || 'Unknown Team';

      // Build transfer remark
      const transferDate = new Date();
      const formattedDate = transferDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const transferRemark = `\n\n[Transfer] Lead transferred from ${currentAgentName} (${currentTeamName}) to ${newAgentName} (${newTeamName}) on ${formattedDate} by Admin.`;

      // Update lead
      const leadRef = doc(db, 'leads', lead.id);
      const currentRemarks = lead.remarks || '';
      await updateDoc(leadRef, {
        agentId: selectedAgentId,
        teamId: selectedTeamId,
        agentName: newAgentName,
        updatedAt: new Date(),
        updatedBy: user?.id || 'admin',
        remarks: currentRemarks + transferRemark
      });

      toast.success(`Lead transferred to ${newAgentName} (${newTeamName})`);
      onTransferComplete();
      onClose();
    } catch (error) {
      console.error('Error transferring lead:', error);
      toast.error('Failed to transfer lead');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <ArrowRight className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Transfer Lead</h2>
                <p className="text-sm text-indigo-100 mt-0.5">
                  {lead.customerName || 'Unnamed Customer'} - {lead.customerNumber}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Current Assignment */}
            {currentAgent && currentTeam && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Assignment</h3>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <User className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{currentAgent.name}</p>
                    <p className="text-xs text-gray-500">{currentTeam.name}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Team Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="h-4 w-4 inline mr-2" />
                Select Team
              </label>
              {loadingTeams ? (
                <div className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 animate-pulse">
                  <div className="h-5 bg-gray-200 rounded w-1/3"></div>
                </div>
              ) : (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                >
                  <option value="">-- Select a team --</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Agent Selection */}
            {selectedTeamId && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="h-4 w-4 inline mr-2" />
                  Select Agent
                </label>
                {loadingAgents ? (
                  <div className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-1/3"></div>
                  </div>
                ) : agents.length === 0 ? (
                  <div className="w-full px-4 py-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-700">
                    No agents found in this team
                  </div>
                ) : (
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                  >
                    <option value="">-- Select an agent --</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} {agent.role === 'freelancer' ? '(Freelancer)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Warning */}
            {selectedAgentId && selectedAgentId === lead.agentId && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-700">
                  ⚠️ You've selected the current agent. Please select a different agent to transfer.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleTransfer}
              disabled={loading || !selectedAgentId || !selectedTeamId || selectedAgentId === lead.agentId}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Transferring...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Transfer Lead
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

