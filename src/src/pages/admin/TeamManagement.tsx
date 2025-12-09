/**
 * ===============================================================================
 * TEAM MANAGEMENT PAGE - ORGANIZATIONAL STRUCTURE MANAGEMENT
 * ===============================================================================
 * 
 * This page provides comprehensive team management functionality for administrators,
 * including team creation, member assignment, manager configuration, and commission
 * settings. It handles the organizational structure of the CRM system.
 * 
 * FEATURES:
 * 
 * 1. TEAM CRUD OPERATIONS
 *    - Create, read, update, and delete team entities
 *    - Team name and manager assignment management
 *    - Commission-based team configuration
 *    - Freelancer team distinction and handling
 * 
 * 2. MEMBER MANAGEMENT
 *    - Assign and unassign users to/from teams
 *    - Bulk member assignment with user selection
 *    - Manager assignment and role validation
 *    - Unassigned user management and visibility
 * 
 * 3. COMMISSION CONFIGURATION
 *    - Team-specific commission rate management
 *    - Integration with CommissionConfig component
 *    - Commission-based team identification and handling
 * 
 * 4. BULK OPERATIONS
 *    - Bulk user upload integration for team assignment
 *    - Team bulk upload capabilities
 *    - Efficient batch operations for large datasets
 * 
 * 5. USER INTERFACE
 *    - Modal-based team editing and creation
 *    - Comprehensive user selection interfaces
 *    - Real-time updates and state synchronization
 *    - Error handling and validation feedback
 * 
 * USAGE:
 * This page is used by administrators to manage the organizational structure
 * of the CRM system, including teams, managers, and member assignments.
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, getDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { Team, User, UserRole } from '../../types';
import { 
  Users, 
  Plus, 
  Pencil, 
  Trash2, 
  UserPlus, 
  Building2, 
  Upload, 
  DollarSign,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Crown,
  Shield,
  UserCheck,
  Sparkles
} from 'lucide-react';
import { TeamBulkUpload } from '../../components/teams/TeamBulkUpload';
import { CommissionConfig } from '../../components/CommissionConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

/**
 * ===============================================================================
 * TEAM MANAGEMENT COMPONENT
 * ===============================================================================
 * 
 * Main component for team management with comprehensive CRUD operations,
 * member assignment, and commission configuration integration.
 */
export function TeamManagement() {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [unassignedUsers, setUnassignedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showCommissionConfigModal, setShowCommissionConfigModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    managerId: '',
    managerName: '',
    commissionBased: false,
    isFreelancerTeam: false
  });

  useEffect(() => {
    loadAllData();
  }, []);

  // Load all data in a single optimized batch
  async function loadAllData() {
    try {
      // Load teams and users in parallel (only 2 queries total!)
      const [teamsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'teams'))),
        getDocs(query(collection(db, 'users')))
      ]);
      
      // Build users map and categorize users
      const usersMap = new Map<string, User>();
      const usersByTeam = new Map<string, User[]>();
      const managersList: User[] = [];
      const unassignedUsersList: User[] = [];
      
      usersSnapshot.docs.forEach(doc => {
        const user = {
        id: doc.id,
        ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        } as User;
        
        usersMap.set(doc.id, user);
      
        // Categorize managers
        if (user.role === 'manager' || user.role === null) {
          managersList.push(user);
        }
        
        // Categorize unassigned users
        if (['agent', 'freelancer'].includes(user.role) && !user.teamId) {
          unassignedUsersList.push(user);
        }

        // Group team members by team
        if (user.teamId && ['agent', 'freelancer'].includes(user.role)) {
          if (!usersByTeam.has(user.teamId)) {
            usersByTeam.set(user.teamId, []);
          }
          usersByTeam.get(user.teamId)!.push(user);
        }
      });
      
      // Build teams with manager names and members
      const teamsData = teamsSnapshot.docs.map((doc) => {
        const teamData = doc.data();
        const team: Team = {
          id: doc.id,
          ...teamData,
          managerName: '',
          commissionBased: teamData.commissionBased || false,
          createdAt: teamData.createdAt?.toDate() || new Date(),
          updatedAt: teamData.updatedAt?.toDate() || new Date(),
          members: usersByTeam.get(doc.id) || []
        } as Team;
        
        // Get manager name from users map (instant lookup)
        if (team.managerId && usersMap.has(team.managerId)) {
          team.managerName = usersMap.get(team.managerId)!.name || '';
      }
      
        return team;
      });
      
      // Sort teams alphabetically with numeric sorting (ETS-1, ETS-2, ETS-11)
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      teamsData.sort((a, b) => collator.compare(a.name || '', b.name || ''));
      
      // Update all state at once
      setTeams(teamsData);
      setManagers(managersList);
      setUnassignedUsers(unassignedUsersList);
      
      // Expand all teams by default
      setExpandedTeams(new Set(teamsData.map(t => t.id)));
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load teams and users');
    } finally {
      setLoading(false);
    }
  }

  // Simplified reload functions that can be called when needed
  async function loadTeams() {
    await loadAllData();
  }

  async function loadManagers() {
    // Data is already loaded in loadAllData, but keeping this for compatibility
      if (isEditing && editingTeam?.managerId) {
      try {
        const currentManagerDoc = await getDoc(doc(db, 'users', editingTeam.managerId));
        if (currentManagerDoc.exists()) {
          const currentManager = {
            id: currentManagerDoc.id,
            ...currentManagerDoc.data(),
            createdAt: currentManagerDoc.data().createdAt?.toDate(),
            updatedAt: currentManagerDoc.data().updatedAt?.toDate()
          } as User;
          
          setManagers(prev => {
            if (!prev.find(m => m.id === currentManager.id)) {
              return [...prev, currentManager];
          }
            return prev;
          });
        }
    } catch (error) {
        console.error('Error loading current manager:', error);
      }
    }
  }

  async function loadUnassignedUsers() {
    // Data is already loaded in loadAllData
    // This function kept for compatibility with existing code
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.managerId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
    const manager = managers.find(m => m.id === formData.managerId);
    if (!manager) {
      toast.error('Selected manager not found');
      return;
    }

      if (isEditing && editingTeam) {
        await updateDoc(doc(db, 'teams', editingTeam.id), {
          name: formData.name,
          managerId: formData.managerId,
          managerName: manager.name,
          commissionBased: formData.commissionBased,
          isFreelancerTeam: formData.isFreelancerTeam,
          updatedAt: new Date()
        });
        
        if (editingTeam.managerId && editingTeam.managerId !== formData.managerId) {
          await updateDoc(doc(db, 'users', editingTeam.managerId), {
            teamId: null,
            role: 'manager',
            updatedAt: new Date()
          });
        }
        
        await updateDoc(doc(db, 'users', formData.managerId), {
          teamId: editingTeam.id,
          role: 'manager',
          updatedAt: new Date()
        });
        
        // Bulk update team member roles based on freelancer toggle
        const membersSnap = await getDocs(query(collection(db, 'users'), where('teamId', '==', editingTeam.id)));
        const memberUpdates = membersSnap.docs.map(u => updateDoc(u.ref, {
          role: formData.isFreelancerTeam ? 'freelancer' : (u.data().role === 'freelancer' ? 'agent' : u.data().role),
          updatedAt: new Date()
        }));
        await Promise.all(memberUpdates);

        toast.success('Team updated successfully');
      } else {
        const teamData = {
          name: formData.name,
          managerId: formData.managerId,
          managerName: manager.name,
          commissionBased: formData.commissionBased,
          isFreelancerTeam: formData.isFreelancerTeam,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const teamRef = await addDoc(collection(db, 'teams'), teamData);
        
        await updateDoc(doc(db, 'users', formData.managerId), {
          teamId: teamRef.id,
          role: 'manager',
          updatedAt: new Date()
        });
        
        toast.success('Team created successfully');
      }

      setFormData({ name: '', managerId: '', managerName: '', commissionBased: false, isFreelancerTeam: false });
      setIsEditing(false);
      setEditingTeam(null);
      setShowCreateForm(false);
      loadTeams();
    } catch (error) {
      console.error('Error saving team:', error);
      toast.error('Failed to save team');
    }
  }

  async function handleAssignUsers() {
    if (!selectedTeam || selectedUsers.length === 0) {
      toast.error('Please select users to assign');
      return;
    }

    try {
      const updatePromises = selectedUsers.map(userId =>
        updateDoc(doc(db, 'users', userId), {
          teamId: selectedTeam.id,
          managerId: selectedTeam.managerId,
          updatedAt: new Date()
        })
      );

      await Promise.all(updatePromises);
      toast.success(`Successfully assigned ${selectedUsers.length} users to team`);
      setShowAssignModal(false);
      setSelectedUsers([]);
      loadTeams();
    } catch (error) {
      console.error('Error assigning users:', error);
      toast.error('Failed to assign users to team');
    }
  }

  async function handleRemoveFromTeam(userId: string, teamId: string) {
    try {
      await updateDoc(doc(db, 'users', userId), {
        teamId: null,
        managerId: null,
        updatedAt: new Date()
      });
      toast.success('User removed from team');
      loadTeams();
    } catch (error) {
      console.error('Error removing user from team:', error);
      toast.error('Failed to remove user from team');
    }
  }

  function handleEdit(team: Team) {
    setIsEditing(true);
    setEditingTeam(team);
    setFormData({
      name: team.name,
      managerId: team.managerId,
      managerName: team.managerName,
      commissionBased: team.commissionBased || false,
      isFreelancerTeam: team.isFreelancerTeam || false
    });
    setShowCreateForm(true);
  }

  async function handleDelete(teamId: string) {
    if (!window.confirm('Are you sure you want to delete this team? All team members will be unassigned.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'teams', teamId));
      
      const team = teams.find(t => t.id === teamId);
      if (team?.managerId) {
        await updateDoc(doc(db, 'users', team.managerId), {
          teamId: null,
          updatedAt: new Date()
        });
      }

      // Remove team assignment from all team members
      const teamMembersQuery = query(
        collection(db, 'users'),
        where('teamId', '==', teamId)
      );
      const snapshot = await getDocs(teamMembersQuery);
      const updatePromises = snapshot.docs.map(doc =>
        updateDoc(doc.ref, {
          teamId: null,
          managerId: null,
          updatedAt: new Date()
        })
      );
      await Promise.all(updatePromises);
      
      toast.success('Team deleted successfully');
      loadTeams();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast.error('Failed to delete team');
    }
  }

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const expandAllTeams = () => {
    setExpandedTeams(new Set(teams.map(t => t.id)));
  };

  const collapseAllTeams = () => {
    setExpandedTeams(new Set());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Modern Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-lg">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Team Management
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  Create and manage teams, assign managers, and organize your workforce
          </p>
        </div>
      </div>
            <div className="flex items-center space-x-3">
              <motion.button
                onClick={() => {
                  setIsEditing(false);
                  setEditingTeam(null);
                  setFormData({ name: '', managerId: '', managerName: '', commissionBased: false, isFreelancerTeam: false });
                  setShowCreateForm(!showCreateForm);
                }}
                className={clsx(
                  "inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-lg transition-all duration-200",
                  showCreateForm
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {showCreateForm ? (
                  <>
                    <X className="h-5 w-5 mr-2" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5 mr-2" />
                    Create Team
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>

      {/* Create/Edit Team Form */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Sparkles className="h-5 w-5 mr-2 text-indigo-600" />
                    {isEditing ? 'Edit Team' : 'Create New Team'}
                  </h3>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                        Team Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                required
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        placeholder="Enter team name (e.g., ETS-1)"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
                      <label htmlFor="managerId" className="block text-sm font-medium text-gray-700 mb-2">
                        Team Manager <span className="text-red-500">*</span>
              </label>
              <select
                id="managerId"
                required
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                value={formData.managerId}
                onChange={(e) => setFormData(prev => ({ ...prev, managerId: e.target.value }))}
              >
                <option value="">Select a manager</option>
                {managers.map(manager => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.email})
                  </option>
                ))}
              </select>
            </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center p-4 bg-green-50 border border-green-200 rounded-xl cursor-pointer hover:bg-green-100 transition-colors">
              <input
                type="checkbox"
                id="commissionBased"
                checked={formData.commissionBased}
                onChange={e => setFormData(prev => ({ ...prev, commissionBased: e.target.checked }))}
                        className="h-5 w-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">Commission-based team</span>
                        <p className="text-xs text-gray-600">Enable commission tracking for this team</p>
            </div>
                    </label>

                    <label className="flex items-center p-4 bg-blue-50 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors">
              <input
                type="checkbox"
                id="isFreelancerTeam"
                checked={formData.isFreelancerTeam}
                onChange={e => setFormData(prev => ({ ...prev, isFreelancerTeam: e.target.checked }))}
                        className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">Freelancer team</span>
                        <p className="text-xs text-gray-600">Members become freelancers with restricted number pool access</p>
                      </div>
              </label>
          </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                        setShowCreateForm(false);
                  setIsEditing(false);
                  setEditingTeam(null);
                  setFormData({ name: '', managerId: '', managerName: '', commissionBased: false, isFreelancerTeam: false });
                }}
                      className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            <button
              type="submit"
                      className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg transition-all"
            >
                      <Save className="h-4 w-4 mr-2" />
              {isEditing ? 'Update Team' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Teams List Header */}
        <motion.div
          className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="h-5 w-5 text-indigo-600" />
              <span className="text-lg font-semibold text-gray-900">
                {teams.length} {teams.length === 1 ? 'Team' : 'Teams'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={expandAllTeams}
                className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAllTeams}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>
        </motion.div>

      {/* Teams List */}
        <div className="space-y-4">
          {teams.map((team, index) => {
            const isExpanded = expandedTeams.has(team.id);
            const memberCount = team.members?.length || 0;
            
            return (
              <motion.div
                key={team.id}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                {/* Team Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <button
                        onClick={() => toggleTeam(team.id)}
                        className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-indigo-600" />
                        )}
                      </button>
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <Building2 className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                          <span>{team.name}</span>
                          {team.isFreelancerTeam && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Freelancer
                            </span>
                          )}
                          {team.commissionBased && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Commission
                            </span>
                          )}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600 flex items-center">
                          <Crown className="h-4 w-4 mr-1 text-yellow-500" />
                          Manager: <span className="font-medium ml-1">{team.managerName}</span>
                          <span className="mx-2">•</span>
                          <Users className="h-4 w-4 mr-1 text-blue-500" />
                          {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </p>
              </div>
                    </div>

                    <div className="flex items-center space-x-2">
                {team.commissionBased && (
                  <button
                    onClick={() => {
                      setSelectedTeam(team);
                      setShowCommissionConfigModal(true);
                    }}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all shadow-md"
                  >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Commission
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedTeam(team);
                    setShowBulkUploadModal(true);
                  }}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all shadow-md"
                >
                        <Upload className="h-4 w-4 mr-1" />
                  Bulk Upload
                </button>
                <button
                  onClick={() => {
                    setSelectedTeam(team);
                    setShowAssignModal(true);
                  }}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-md"
                >
                        <UserPlus className="h-4 w-4 mr-1" />
                  Add Members
                </button>
                <button
                  onClick={() => handleEdit(team)}
                        className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"
                >
                        <Pencil className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleDelete(team.id)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                >
                        <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
                </div>

                {/* Team Members Table */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {team.members?.map((member) => (
                              <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                                      <span className="text-white font-bold text-sm">
                                        {member.name?.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="ml-4">
                                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                                    </div>
                                  </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {member.email}
                      </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={clsx(
                                    "px-3 py-1 text-xs font-medium rounded-full",
                                    member.role === 'agent' ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                                  )}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleRemoveFromTeam(member.id, team.id)}
                                    className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!team.members || team.members.length === 0) && (
                    <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                                  <p className="font-medium">No team members yet</p>
                                  <p className="text-xs mt-1">Click "Add Members" to assign users to this team</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {teams.length === 0 && (
            <motion.div
              className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Building2 className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No teams yet</h3>
              <p className="text-sm text-gray-600 mb-6">Get started by creating your first team</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg transition-all"
              >
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Team
              </button>
            </motion.div>
          )}
          </div>
      </div>

      {/* Assign Users Modal */}
      {showAssignModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <UserPlus className="h-6 w-6 mr-2 text-indigo-600" />
                  Add Members to {selectedTeam.name}
              </h3>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedUsers([]);
                }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                  <X className="h-6 w-6" />
              </button>
              </div>
            </div>
            
            <div className="p-6 max-h-96 overflow-y-auto">
              {unassignedUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">No unassigned users available</p>
                  <p className="text-sm text-gray-500 mt-2">All users are already assigned to teams</p>
                </div>
              ) : (
                <div className="space-y-2">
                    {unassignedUsers.map((user) => (
                    <label
                      key={user.id}
                      className={clsx(
                        "flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all",
                        selectedUsers.includes(user.id)
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                      )}
                    >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers([...selectedUsers, user.id]);
                              } else {
                                setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                              }
                            }}
                        className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <div className="ml-4 flex-1">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                      <span className={clsx(
                        "px-3 py-1 text-xs font-medium rounded-full",
                        user.role === 'agent' ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                      )}>
                            {user.role}
                          </span>
                    </label>
                    ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
              <span className="text-sm text-gray-600">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedUsers([]);
                }}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignUsers}
                disabled={selectedUsers.length === 0}
                  className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Assign to Team
              </button>
            </div>
          </div>
          </motion.div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUploadModal && selectedTeam && (
            <TeamBulkUpload
          teamId={selectedTeam.id}
          onClose={() => {
                setShowBulkUploadModal(false);
                loadTeams();
              }}
            />
      )}

      {/* Commission Config Modal */}
      {showCommissionConfigModal && selectedTeam && (
            <CommissionConfig
              teamId={selectedTeam.id}
              onClose={() => {
                setShowCommissionConfigModal(false);
              }}
            />
      )}
    </div>
  );
}
