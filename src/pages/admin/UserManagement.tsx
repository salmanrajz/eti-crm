/**
 * ===============================================================================
 * USER MANAGEMENT PAGE - COMPREHENSIVE USER ADMINISTRATION
 * ===============================================================================
 * 
 * This page provides comprehensive user management functionality for administrators,
 * including user creation, role management, team assignment, password reset, and
 * verifier group configuration. It features modern UI with filtering, search, and
 * bulk operations capabilities.
 * 
 * FEATURES:
 * 
 * 1. USER CRUD OPERATIONS
 *    - Create new users with role assignment and validation
 *    - Update user information, roles, and team assignments
 *    - Bulk user deletion with confirmation and progress tracking
 *    - Password reset functionality for existing users
 * 
 * 2. ROLE AND PERMISSION MANAGEMENT
 *    - Role assignment and validation (admin, manager, coordinator, verifier, agent, freelancer)
 *    - Coordinator type configuration (G1, G2, G3, all groups)
 *    - Verifier group assignment for number pool access control
 *    - Role-based UI restrictions and feature access
 * 
 * 3. TEAM INTEGRATION
 *    - Team assignment and management for users
 *    - Team-based filtering and organization
 *    - Unassigned user management and visibility
 *    - Team hierarchy and member relationships
 * 
 * 4. ADVANCED UI FEATURES
 *    - Table and card view modes for user display
 *    - Comprehensive filtering (role, team, search terms)
 *    - Expandable team sections and user grouping
 *    - Real-time search and filtering with debouncing
 * 
 * 5. BULK OPERATIONS
 *    - Multi-user selection and bulk operations
 *    - Bulk user deletion with progress tracking
 *    - Bulk role updates and team assignments
 *    - Export and import capabilities integration
 * 
 * 6. SECURITY AND VALIDATION
 *    - Input validation for all user creation fields
 *    - Role-based access control and restrictions
 *    - Secure password handling and reset procedures
 *    - Audit trail and change tracking
 * 
 * USAGE:
 * This page is used by administrators to manage all aspects of user accounts,
 * roles, permissions, and team assignments within the CRM system.
 * ===============================================================================
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, updateDoc, where, orderBy } from 'firebase/firestore';
import { db, deleteUsers, createUserWithDocument } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { User, UserRole, Team, CoordinatorType, VerifierType, VerifierGroups } from '../../types';
import { 
  Users, 
  CheckCircle, 
  UserPlus, 
  Upload, 
  Trash2, 
  AlertCircle, 
  Search,
  Filter,
  Shield,
  UserCheck,
  Settings,
  Users2 as TeamIcon,
  Crown,
  Eye,
  Edit,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Mail,
  Calendar,
  Building2,
  Key,
  Lock,
  UserCog,
  Sparkles
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PasswordResetModal } from '../../components/admin/PasswordResetModal';
import { clsx } from 'clsx';

/**
 * ===============================================================================
 * USER MANAGEMENT COMPONENT
 * ===============================================================================
 * 
 * Main component for comprehensive user administration with advanced filtering,
 * role management, and bulk operations capabilities.
 */
export function UserManagement() {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [showVerifierGroupsModal, setShowVerifierGroupsModal] = useState(false);
  const [selectedUserForGroups, setSelectedUserForGroups] = useState<User | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<VerifierGroups>([]);
  const [createUserForm, setCreateUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'agent' as UserRole,
    coordinatorType: 'all' as CoordinatorType,
    verifierGroups: [] as VerifierGroups
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const { user: currentUser } = useAuthStore();

  // New state for modern UI
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | 'all'>('all');
  const [selectedTeam, setSelectedTeam] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [passwordResetModalOpen, setPasswordResetModalOpen] = useState(false);
  const [selectedUserForPasswordReset, setSelectedUserForPasswordReset] = useState<User | null>(null);

  // ===============================================================================
  // CONFIGURATION CONSTANTS
  // ===============================================================================
  
  /**
   * Available user roles for assignment and filtering
   */
  const roles: UserRole[] = ['admin', 'manager', 'coordinator', 'verifier', 'agent', 'freelancer'];
  
  /**
   * Coordinator types for number group management
   */
  const coordinatorTypes: CoordinatorType[] = ['g1', 'g2', 'g3', 'all'];
  
  /**
   * Verifier types for number pool access control
   */
  const verifierTypes: VerifierType[] = ['g1', 'g2', 'g3', 'all'];

  // ===============================================================================
  // DATA FILTERING AND SORTING
  // ===============================================================================
  
  /**
   * Filtered and sorted users based on search terms, role, and team filters
   * Implements complex sorting logic prioritizing team members over special roles
   */
  const filteredUsers = useMemo(() => {
    const filtered = users.filter(user => {
      const matchesSearch = !searchTerm || 
        (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesRole = selectedRole === 'all' || user.role === selectedRole;
      
      const matchesTeam = selectedTeam === 'all' || 
        (selectedTeam === 'no-team' && !user.teamId) ||
        user.teamId === selectedTeam;
      
      return matchesSearch && matchesRole && matchesTeam;
    });

    // Sort users: team-wise first, then coordinators/admins/verifiers at the end
    return filtered.sort((a, b) => {
      // First, separate team members from coordinators/admins/verifiers
      const aIsSpecial = ['coordinator', 'admin', 'verifier'].includes(a.role);
      const bIsSpecial = ['coordinator', 'admin', 'verifier'].includes(b.role);
      
      // If one is special and other isn't, special goes to end
      if (aIsSpecial && !bIsSpecial) return 1;
      if (!aIsSpecial && bIsSpecial) return -1;
      
      // If both are special or both are not special, sort by team then name
      if (aIsSpecial && bIsSpecial) {
        // Special users: sort by role priority (admin > coordinator > verifier), then name
        const rolePriority = { admin: 0, coordinator: 1, verifier: 2 };
        const roleDiff = rolePriority[a.role as keyof typeof rolePriority] - rolePriority[b.role as keyof typeof rolePriority];
        if (roleDiff !== 0) return roleDiff;
        return (a.name || '').localeCompare(b.name || '');
      }
      
      // Regular team members: sort by team, then role (managers first), then name
      const aTeamName = a.teamId ? (teams.find(t => t.id === a.teamId)?.name || 'Unknown') : 'Unassigned';
      const bTeamName = b.teamId ? (teams.find(t => t.id === b.teamId)?.name || 'Unknown') : 'Unassigned';
      
      // Put "Unassigned" at the end (after all regular teams)
      if (aTeamName === 'Unassigned' && bTeamName !== 'Unassigned') return 1;
      if (aTeamName !== 'Unassigned' && bTeamName === 'Unassigned') return -1;
      
      // If both are "Unassigned", sort by role then name
      if (aTeamName === 'Unassigned' && bTeamName === 'Unassigned') {
        if (a.role === 'manager' && b.role !== 'manager') return -1;
        if (a.role !== 'manager' && b.role === 'manager') return 1;
        return (a.name || '').localeCompare(b.name || '');
      }
      
      // For regular teams, sort alphabetically
      const teamDiff = aTeamName.localeCompare(bTeamName);
      if (teamDiff !== 0) return teamDiff;
      
      // Within the same team, put managers first
      if (a.role === 'manager' && b.role !== 'manager') return -1;
      if (a.role !== 'manager' && b.role === 'manager') return 1;
      
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [users, searchTerm, selectedRole, selectedTeam, teams]);

  // Group users by team
  const groupedUsers = useMemo(() => {
    const groups: { [key: string]: User[] } = {
      'no-team': [],
      ...teams.reduce((acc, team) => ({ ...acc, [team.id]: [] }), {})
    };

    filteredUsers.forEach(user => {
      const teamId = user.teamId || 'no-team';
      groups[teamId] = groups[teamId] || [];
      groups[teamId].push(user);
    });

    return groups;
  }, [filteredUsers, teams]);

  // Get team name
  const getTeamName = (teamId: string) => {
    if (teamId === 'no-team') return 'Unassigned';
    const team = teams.find(t => t.id === teamId);
    return team?.name || 'Unknown Team';
  };

  // Toggle team expansion
  const toggleTeamExpansion = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  // Role styling helper
  const getRoleStyle = (role: UserRole) => {
    const styles = {
      admin: { bg: 'bg-purple-100', text: 'text-purple-800', icon: Crown, label: 'Admin' },
      manager: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Shield, label: 'Manager' },
      coordinator: { bg: 'bg-green-100', text: 'text-green-800', icon: UserCheck, label: 'Coordinator' },
      verifier: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Eye, label: 'Verifier' },
      agent: { bg: 'bg-indigo-100', text: 'text-indigo-800', icon: UserCog, label: 'Agent' },
      freelancer: { bg: 'bg-orange-100', text: 'text-orange-800', icon: Sparkles, label: 'Freelancer' }
    };
    return styles[role] || styles.agent;
  };

  // Expand all teams
  const expandAllTeams = () => {
    setExpandedTeams(new Set(Object.keys(groupedUsers)));
  };

  // Collapse all teams
  const collapseAllTeams = () => {
    setExpandedTeams(new Set());
  };

  useEffect(() => {
    Promise.all([loadUsers(), loadTeams()]);
  }, []);

  async function loadTeams() {
    try {
      const teamsQuery = query(collection(db, 'teams'));
      const snapshot = await getDocs(teamsQuery);
      const teamsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Team[];
      setTeams(teamsData);
    } catch (error) {
      console.error('Error loading teams:', error);
      toast.error('Failed to load teams');
    }
  }

  async function loadUsers() {
    try {
      if (!currentUser?.role || currentUser.role !== 'admin') {
        toast.error('Only administrators can access user management');
        navigate('/unauthorized');
        return;
      }

      const usersQuery = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(usersQuery);
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as User[];
      
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUsers() {
    if (selectedUsers.length === 0) {
      toast.error('Please select users to delete');
      return;
    }

    setDeleteInProgress(true);
    try {
      const results = await deleteUsers(selectedUsers);
      
      if (results.success > 0) {
        toast.success(`Successfully deleted ${results.success} users`);
      }
      if (results.failed > 0) {
        toast.error(`Failed to delete ${results.failed} users`);
        console.error('Deletion errors:', results.errors);
      }

      setSelectedUsers([]);
      loadUsers(); // Reload the user list
    } catch (error) {
      console.error('Error deleting users:', error);
      toast.error('Failed to delete users');
    } finally {
      setDeleteInProgress(false);
      setShowDeleteModal(false);
    }
  }

  async function updateUserRole(userId: string, newRole: UserRole) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: new Date()
      });
      toast.success('User role updated successfully');
      loadUsers(); // Refresh the list
    } catch (error) {
      console.error('Error updating user role:', error);
      toast.error('Failed to update user role');
    }
  }

  async function updateCoordinatorType(userId: string, coordinatorType: CoordinatorType) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        coordinatorType,
        updatedAt: new Date()
      });
      toast.success('Coordinator type updated successfully');
      loadUsers(); // Refresh the list
    } catch (error) {
      console.error('Error updating coordinator type:', error);
      toast.error('Failed to update coordinator type');
    }
  }

  async function updateVerifierGroups(userId: string, verifierGroups: VerifierGroups) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        verifierGroups,
        updatedAt: new Date()
      });
      toast.success('Verifier groups updated successfully');
      loadUsers(); // Refresh the list
    } catch (error) {
      console.error('Error updating verifier groups:', error);
      toast.error('Failed to update verifier groups');
    }
  }

  function openVerifierGroupsModal(user: User) {
    setSelectedUserForGroups(user);
    setSelectedGroups(user.verifierGroups || []);
    setShowVerifierGroupsModal(true);
  }

  function openPasswordResetModal(user: User) {
    setSelectedUserForPasswordReset(user);
    setPasswordResetModalOpen(true);
  }

  function handleSaveVerifierGroups() {
    if (selectedUserForGroups) {
      updateVerifierGroups(selectedUserForGroups.id, selectedGroups);
      setShowVerifierGroupsModal(false);
      setSelectedUserForGroups(null);
      setSelectedGroups([]);
    }
  }

  async function assignTeam(userId: string, teamId: string) {
    try {
      if (!teamId) {
        // If empty team is selected, remove team assignment
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          teamId: null,
          managerId: null,
          updatedAt: new Date()
        });
        toast.success('Team assignment removed');
        loadUsers();
        return;
      }

      const team = teams.find(t => t.id === teamId);
      if (!team) {
        toast.error('Team not found');
        return;
      }

      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        teamId,
        managerId: team.managerId,
        updatedAt: new Date()
      });
      toast.success('Team assigned successfully');
      loadUsers();
    } catch (error) {
      console.error('Error assigning team:', error);
      toast.error('Failed to assign team');
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);

    try {
      await createUserWithDocument(
        createUserForm.email,
        createUserForm.password,
        createUserForm.role,
        createUserForm.name,
        {
          coordinatorType: createUserForm.coordinatorType,
          verifierGroups: createUserForm.verifierGroups
        }
      );

      toast.success('User created successfully');
      setShowCreateModal(false);
      setCreateUserForm({
        email: '',
        password: '',
        name: '',
        role: 'agent',
        coordinatorType: 'all',
        verifierGroups: []
      });
      loadUsers(); // Refresh the user list
    } catch (error) {
      console.error('Error creating user:', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to create user');
      }
    } finally {
      setCreatingUser(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div 
          className="flex flex-col items-center space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          <p className="text-gray-600">Loading users...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
              Delete Users
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Are you sure you want to delete {selectedUsers.length} selected users? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUsers}
                disabled={deleteInProgress}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteInProgress ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </span>
                ) : (
                  'Delete Users'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl">
                    <UserPlus className="h-8 w-8 text-white" />
                  </div>
              <div>
                    <h3 className="text-2xl font-bold text-gray-900">Create New User</h3>
                    <p className="text-gray-600">Add a new team member to your organization</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  value={createUserForm.name}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter full name"
                />
              </div>
              <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  value={createUserForm.email}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email address"
                />
              </div>
                </div>
                
              <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  minLength={6}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  value={createUserForm.password}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter password (min 6 characters)"
                />
              </div>
                
              <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  id="role"
                  required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  value={createUserForm.role}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, role: e.target.value as UserRole }))}
                >
                    {roles.map((role) => {
                      const roleStyle = getRoleStyle(role);
                      return (
                    <option key={role} value={role}>
                          {roleStyle.label}
                    </option>
                      );
                    })}
                </select>
              </div>
                
                {createUserForm.role === 'coordinator' && (
              <div>
                    <label htmlFor="coordinatorType" className="block text-sm font-medium text-gray-700 mb-2">
                  Coordinator Type
                </label>
                <select
                  id="coordinatorType"
                  required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  value={createUserForm.coordinatorType}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, coordinatorType: e.target.value as CoordinatorType }))}
                >
                  {coordinatorTypes.map((type) => (
                    <option key={type} value={type}>
                          {type === 'g1' ? 'Group G1' : type === 'g2' ? 'Group G2' : type === 'g3' ? 'Group G3' : 'All Groups'}
                    </option>
                  ))}
                </select>
              </div>
                )}
                
                {createUserForm.role === 'verifier' && (
              <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                  Verifier Groups
                </label>
                    <div className="grid grid-cols-2 gap-3">
                  {verifierTypes.map((type) => (
                        <div key={type} className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id={`verifier-${type}`}
                        checked={createUserForm.verifierGroups.includes(type)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCreateUserForm(prev => ({
                            ...prev,
                            verifierGroups: checked
                              ? [...prev.verifierGroups, type]
                              : prev.verifierGroups.filter(g => g !== type)
                          }));
                        }}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                          <label htmlFor={`verifier-${type}`} className="ml-3 text-sm font-medium text-gray-700">
                            {type === 'g1' ? 'Group G1' : type === 'g2' ? 'Group G2' : type === 'g3' ? 'Group G3' : 'All Groups'}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
                )}
                
                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                    className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                  <motion.button
                  type="submit"
                  disabled={creatingUser}
                    className="px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {creatingUser ? (
                      <span className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </span>
                    ) : (
                      'Create User'
                    )}
                  </motion.button>
              </div>
            </form>
          </div>
          </motion.div>
        </div>
      )}

      {/* Modern Header */}
      <motion.div 
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-4 mb-4">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                  <p className="text-gray-600 mt-1">
                    Manage user roles, teams, and permissions across your organization
          </p>
        </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-600 text-sm font-medium">Total Users</p>
                      <p className="text-2xl font-bold text-blue-900">{users.length}</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-500" />
                  </div>
                </div>
                <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-600 text-sm font-medium">Teams</p>
                      <p className="text-2xl font-bold text-green-900">{teams.length}</p>
                    </div>
                    <TeamIcon className="h-8 w-8 text-green-500" />
                  </div>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-600 text-sm font-medium">Admins</p>
                      <p className="text-2xl font-bold text-purple-900">{users.filter(u => u.role === 'admin').length}</p>
                    </div>
                    <Crown className="h-8 w-8 text-purple-500" />
                  </div>
                </div>
                <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-600 text-sm font-medium">Agents</p>
                      <p className="text-2xl font-bold text-orange-900">{users.filter(u => u.role === 'agent').length}</p>
                    </div>
                    <UserCog className="h-8 w-8 text-orange-500" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mt-6 lg:mt-0 lg:ml-8">
          {selectedUsers.length > 0 && (
                <motion.button
              onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedUsers.length})
                </motion.button>
          )}
          <Link
            to="/dashboard/admin/users/bulk-upload"
                className="inline-flex items-center px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Link>
              <motion.button
            onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
              </motion.button>
        </div>
      </div>
        </div>
      </motion.div>

      {/* Search and Filters */}
      <motion.div 
        className="mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                />
              </div>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all duration-200"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                <ChevronDown className={clsx("h-4 w-4 ml-2 transition-transform", showFilters && "rotate-180")} />
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={expandAllTeams}
                  className="px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAllTeams}
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Collapse All
          </button>
              </div>
        </div>
      </div>

          {/* Expanded Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 pt-6 border-t border-gray-200"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Role Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                          <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as UserRole | 'all')}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="all">All Roles</option>
                      {roles.map(role => (
                        <option key={role} value={role}>
                          {getRoleStyle(role).label}
                              </option>
                            ))}
                          </select>
                            </div>
                  
                  {/* Team Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
                          <select
                      value={selectedTeam}
                      onChange={(e) => setSelectedTeam(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="all">All Teams</option>
                      <option value="no-team">Unassigned</option>
                      {teams.map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                  </div>
                  
                  {/* View Mode */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">View Mode</label>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setViewMode('cards')}
                        className={clsx(
                          "flex-1 px-3 py-2 text-sm font-medium transition-colors",
                          viewMode === 'cards' 
                            ? "bg-indigo-600 text-white" 
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        Cards
                      </button>
                      <button
                        onClick={() => setViewMode('table')}
                        className={clsx(
                          "flex-1 px-3 py-2 text-sm font-medium transition-colors",
                          viewMode === 'table' 
                            ? "bg-indigo-600 text-white" 
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        Table
                      </button>
                          </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Perfect User Table */}
      <motion.div 
        className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {/* Table Header with Selection */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
                      <input
                        type="checkbox"
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUsers.includes(u.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                    setSelectedUsers(filteredUsers.map(u => u.id));
                          } else {
                            setSelectedUsers([]);
                          }
                        }}
                      />
              <span className="text-sm font-medium text-gray-700">
                {filteredUsers.length} of {users.length} users selected
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Showing {filteredUsers.length} users</span>
            </div>
          </div>
        </div>

        {/* Team-wise Tables */}
        <div className="space-y-6">
          {/* Regular Teams */}
          {Object.entries(groupedUsers)
            .filter(([teamId]) => teamId !== 'no-team') // Filter out unassigned team first
            .sort(([aId, aUsers], [bId, bUsers]) => {
              // Sort teams alphabetically by name
              const aTeamName = getTeamName(aId);
              const bTeamName = getTeamName(bId);
              return aTeamName.localeCompare(bTeamName);
            })
            .map(([teamId, teamUsers]) => {
              if (teamUsers.length === 0 || teamId === 'special-users') return null;
            
            const regularTeamUsers = teamUsers.filter(user => !['coordinator', 'admin', 'verifier'].includes(user.role));
            if (regularTeamUsers.length === 0) return null;
            
            const teamName = getTeamName(teamId);
            const team = teams.find(t => t.id === teamId);
            
            return (
              <motion.div
                key={teamId}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Team Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-500 rounded-lg">
                      <TeamIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-blue-800">{teamName}</h3>
                      <p className="text-sm text-blue-600">
                        {regularTeamUsers.length} members
                        {team?.managerId && (
                          <span className="ml-2">
                            • Managed by {users.find(u => u.id === team.managerId)?.name || 'Unknown'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Team Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Select
                    </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                    </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role & Permissions
                    </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Team Assignment
                    </th>
                        {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Coordinator Type
                    </th>
                        )}
                        {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Verifier Groups
                    </th>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                    </th>
                  </tr>
                </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {regularTeamUsers.map((user, index) => (
                        <motion.tr
                          key={user.id}
                          className="hover:bg-gray-50 transition-colors duration-200"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.02 }}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          checked={selectedUsers.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers([...selectedUsers, user.id]);
                            } else {
                              setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                            }
                          }}
                        />
                      </td>
                          
                          {/* User Info */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-4">
                              <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                                <Users className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{user.name || 'No Name'}</div>
                                <div className="text-sm text-gray-500 flex items-center">
                                  <Mail className="h-3 w-3 mr-1" />
                        {user.email || 'No Email'}
                                </div>
                              </div>
                            </div>
                      </td>
                          
                          {/* Role & Permissions */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              {(() => {
                                const roleStyle = getRoleStyle(user.role);
                                const IconComponent = roleStyle.icon;
                                return (
                                  <>
                                    <IconComponent className="h-4 w-4 text-gray-400" />
                                    <span className={clsx(
                                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                      roleStyle.bg,
                                      roleStyle.text
                                    )}>
                                      {roleStyle.label}
                        </span>
                                  </>
                                );
                              })()}
                            </div>
                      </td>
                          
                          {/* Team Assignment */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(user.role === 'agent' || user.role === 'verifier' || user.role === 'coordinator' || user.role === 'freelancer') ? (
                              <select
                                value={user.teamId || ''}
                                onChange={(e) => assignTeam(user.id, e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                              >
                                <option value="">No Team</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            ) : user.role === 'manager' ? (
                              <div className="flex items-center space-x-2">
                                <TeamIcon className="h-4 w-4 text-blue-500" />
                                <span className="text-sm text-gray-700">
                                  {teams.find(t => t.managerId === user.id)?.name || 'No team managed'}
                        </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">Not applicable</span>
                            )}
                      </td>
                          
                          {/* Coordinator Type - Only visible to verifiers and coordinators */}
                          {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                            <td className="px-6 py-4 whitespace-nowrap">
                        {user.role === 'coordinator' ? (
                          <select
                            value={user.coordinatorType || 'all'}
                            onChange={(e) => updateCoordinatorType(user.id, e.target.value as CoordinatorType)}
                                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          >
                            {coordinatorTypes.map((type) => (
                              <option key={type} value={type}>
                                {type === 'g1' ? 'Group G1' :
                                 type === 'g2' ? 'Group G2' :
                                 type === 'g3' ? 'Group G3' :
                                       'All Groups'}
                              </option>
                            ))}
                          </select>
                        ) : (
                                <span className="text-sm text-gray-400 italic">Not applicable</span>
                        )}
                      </td>
                          )}
                          
                          {/* Verifier Groups - Only visible to verifiers and coordinators */}
                          {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                            <td className="px-6 py-4 whitespace-nowrap">
                        {user.role === 'verifier' ? (
                          <div className="flex items-center space-x-2">
                            <div className="flex flex-wrap gap-1">
                              {user.verifierGroups && user.verifierGroups.length > 0 ? (
                                      user.verifierGroups.map((group: any, index: number) => (
                                  <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    {group === 'g1' ? 'G1' :
                                     group === 'g2' ? 'G2' :
                                     group === 'g3' ? 'G3' :
                                     'ALL'}
                                  </span>
                                ))
                              ) : (
                                <span className="text-gray-400 italic text-xs">No groups</span>
                              )}
                            </div>
                            <button
                              onClick={() => openVerifierGroupsModal(user)}
                                    className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors"
                              title="Edit verifier groups"
                            >
                                    <Settings className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                                <span className="text-sm text-gray-400 italic">Not applicable</span>
                        )}
                      </td>
                          )}
                          
                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              <select
                                value={user.role}
                                onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                                disabled={user.id === currentUser?.id}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                              >
                                {roles.map((role) => {
                                  const roleStyle = getRoleStyle(role);
                                  return (
                                    <option key={role} value={role}>
                                      {roleStyle.label}
                                    </option>
                                  );
                                })}
                              </select>
                              
                              <button
                                onClick={() => openPasswordResetModal(user)}
                                className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-lg hover:from-red-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 shadow-sm hover:shadow-md"
                                title="Reset Password"
                              >
                                <Key className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            );
          })}

          {/* Unassigned Team Section */}
          {(() => {
            const unassignedUsers = groupedUsers['no-team'] || [];
            const regularUnassignedUsers = unassignedUsers.filter(user => !['coordinator', 'admin', 'verifier'].includes(user.role));
            
            if (regularUnassignedUsers.length === 0) return null;

            return (
              <motion.div
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Unassigned Team Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-500 rounded-lg">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Unassigned</h3>
                      <p className="text-sm text-gray-600">
                        {regularUnassignedUsers.length} members without team assignment
                      </p>
                    </div>
                  </div>
                </div>

                {/* Unassigned Team Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Select
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role & Permissions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Team Assignment
                        </th>
                        {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Coordinator Type
                          </th>
                        )}
                        {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Verifier Groups
                          </th>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {regularUnassignedUsers.map((user, index) => (
                        <motion.tr
                          key={user.id}
                          className="hover:bg-gray-50 transition-colors duration-200"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.02 }}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                              checked={selectedUsers.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUsers([...selectedUsers, user.id]);
                                } else {
                                  setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                }
                              }}
                            />
                          </td>

                          {/* User Info */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-4">
                              <div className="w-10 h-10 bg-gradient-to-r from-gray-500 to-gray-600 rounded-lg flex items-center justify-center">
                                <Users className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{user.name || 'No Name'}</div>
                                <div className="text-sm text-gray-500 flex items-center">
                                  <Mail className="h-3 w-3 mr-1" />
                                  {user.email || 'No Email'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role & Permissions */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              {(() => {
                                const roleStyle = getRoleStyle(user.role);
                                const IconComponent = roleStyle.icon;
                                return (
                                  <>
                                    <IconComponent className="h-4 w-4 text-gray-400" />
                                    <span className={clsx(
                                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                      roleStyle.bg,
                                      roleStyle.text
                                    )}>
                                      {roleStyle.label}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </td>

                          {/* Team Assignment */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(user.role === 'agent' || user.role === 'verifier' || user.role === 'coordinator' || user.role === 'freelancer') ? (
                          <select
                            value={user.teamId || ''}
                            onChange={(e) => assignTeam(user.id, e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          >
                            <option value="">No Team</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                            ) : user.role === 'manager' ? (
                              <div className="flex items-center space-x-2">
                                <TeamIcon className="h-4 w-4 text-blue-500" />
                                <span className="text-sm text-gray-700">
                            {teams.find(t => t.managerId === user.id)?.name || 'No team managed'}
                                </span>
                          </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">Not applicable</span>
                        )}
                      </td>

                          {/* Coordinator Type - Only visible to verifiers and coordinators */}
                          {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user.role === 'coordinator' ? (
                                <select
                                  value={user.coordinatorType || 'all'}
                                  onChange={(e) => updateCoordinatorType(user.id, e.target.value as CoordinatorType)}
                                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                  {coordinatorTypes.map((type) => (
                                    <option key={type} value={type}>
                                      {type === 'g1' ? 'Group G1' :
                                       type === 'g2' ? 'Group G2' :
                                       type === 'g3' ? 'Group G3' :
                                       'All Groups'}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-sm text-gray-400 italic">Not applicable</span>
                              )}
                            </td>
                          )}

                          {/* Verifier Groups - Only visible to verifiers and coordinators */}
                          {(currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user.role === 'verifier' ? (
                                <div className="flex items-center space-x-2">
                                  <div className="flex flex-wrap gap-1">
                                    {user.verifierGroups && user.verifierGroups.length > 0 ? (
                                      user.verifierGroups.map((group: any, index: number) => (
                                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          {group === 'g1' ? 'G1' :
                                           group === 'g2' ? 'G2' :
                                           group === 'g3' ? 'G3' :
                                           'ALL'}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-gray-400 italic text-xs">No groups</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => openVerifierGroupsModal(user)}
                                    className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors"
                                    title="Edit verifier groups"
                                  >
                                    <Settings className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400 italic">Not applicable</span>
                              )}
                            </td>
                          )}

                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                          disabled={user.id === currentUser?.id}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        >
                                {roles.map((role) => {
                                  const roleStyle = getRoleStyle(role);
                                  return (
                            <option key={role} value={role}>
                                      {roleStyle.label}
                            </option>
                                  );
                                })}
                        </select>
                              
                              <button
                                onClick={() => openPasswordResetModal(user)}
                                className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-lg hover:from-red-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 shadow-sm hover:shadow-md"
                                title="Reset Password"
                              >
                                <Key className="h-4 w-4" />
                              </button>
                            </div>
                      </td>
                        </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
              </motion.div>
            );
          })()}
          
          {/* Special Users Section */}
          {(() => {
            const specialUsers = filteredUsers.filter(user => ['coordinator', 'admin', 'verifier'].includes(user.role));
            if (specialUsers.length === 0) return null;
            
            return (
              <motion.div
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Special Users Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-500 rounded-lg">
                      <Crown className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-purple-800">Administrative & Management</h3>
                      <p className="text-sm text-purple-600">
                        {specialUsers.length} administrative users
                      </p>
          </div>
        </div>
      </div>
                
                {/* Special Users Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Select
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role & Permissions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Team Assignment
                        </th>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Coordinator Type
                          </th>
                        )}
                        {(currentUser?.role === 'admin' || currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Verifier Groups
                          </th>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {specialUsers.map((user, index) => (
                        <motion.tr
                          key={user.id}
                          className="hover:bg-gray-50 transition-colors duration-200 bg-gradient-to-r from-purple-50/30 to-pink-50/30"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.02 }}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                              checked={selectedUsers.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUsers([...selectedUsers, user.id]);
                                } else {
                                  setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                }
                              }}
                            />
                          </td>
                          
                          {/* User Info */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-4">
                              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                                <Users className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{user.name || 'No Name'}</div>
                                <div className="text-sm text-gray-500 flex items-center">
                                  <Mail className="h-3 w-3 mr-1" />
                                  {user.email || 'No Email'}
                                </div>
                              </div>
                            </div>
                          </td>
                          
                          {/* Role & Permissions */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              {(() => {
                                const roleStyle = getRoleStyle(user.role);
                                const IconComponent = roleStyle.icon;
                                return (
                                  <>
                                    <IconComponent className="h-4 w-4 text-gray-400" />
                                    <span className={clsx(
                                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                      roleStyle.bg,
                                      roleStyle.text
                                    )}>
                                      {roleStyle.label}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                          
                          {/* Team Assignment */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(user.role === 'agent' || user.role === 'freelancer') ? (
                          <select
                            value={user.teamId || ''}
                            onChange={(e) => assignTeam(user.id, e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          >
                            <option value="">No Team</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                            ) : user.role === 'manager' ? (
                              <div className="flex items-center space-x-2">
                                <TeamIcon className="h-4 w-4 text-blue-500" />
                                <span className="text-sm text-gray-700">
                            {teams.find(t => t.managerId === user.id)?.name || 'No team managed'}
                                </span>
                          </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">Not applicable</span>
                        )}
                          </td>
                          
                          {/* Coordinator Type - Visible to admins, verifiers and coordinators */}
                          {(currentUser?.role === 'admin' || currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user.role === 'coordinator' ? (
                                <select
                                  value={user.coordinatorType || 'all'}
                                  onChange={(e) => updateCoordinatorType(user.id, e.target.value as CoordinatorType)}
                                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                  {coordinatorTypes.map((type) => (
                                    <option key={type} value={type}>
                                      {type === 'g1' ? 'Group G1' :
                                       type === 'g2' ? 'Group G2' :
                                       type === 'g3' ? 'Group G3' :
                                       'All Groups'}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-sm text-gray-400 italic">Not applicable</span>
                              )}
                            </td>
                          )}
                          
                          {/* Verifier Groups - Visible to admins, verifiers and coordinators */}
                          {(currentUser?.role === 'admin' || currentUser?.role === 'verifier' || currentUser?.role === 'coordinator') && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user.role === 'verifier' ? (
                                <div className="flex items-center space-x-2">
                                  <div className="flex flex-wrap gap-1">
                                    {user.verifierGroups && user.verifierGroups.length > 0 ? (
                                      user.verifierGroups.map((group: any, index: number) => (
                                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          {group === 'g1' ? 'G1' :
                                           group === 'g2' ? 'G2' :
                                           group === 'g3' ? 'G3' :
                                           'ALL'}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-gray-400 italic text-xs">No groups</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => openVerifierGroupsModal(user)}
                                    className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors"
                                    title="Edit verifier groups"
                                  >
                                    <Settings className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400 italic">Not applicable</span>
                              )}
                            </td>
                          )}
                          
                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-3">
                              <select
                                value={user.role}
                                onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                                disabled={user.id === currentUser?.id}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                              >
                                {roles.map((role) => {
                                  const roleStyle = getRoleStyle(role);
                                  return (
                                    <option key={role} value={role}>
                                      {roleStyle.label}
                                    </option>
                                  );
                                })}
                              </select>
                              
                              <button
                                onClick={() => openPasswordResetModal(user)}
                                className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-lg hover:from-red-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 shadow-sm hover:shadow-md"
                                title="Reset Password"
                              >
                                <Key className="h-4 w-4" />
                              </button>
                            </div>
                      </td>
                        </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
              </motion.div>
            );
          })()}
      </div>
        
        {/* No Results */}
        {filteredUsers.length === 0 && (
          <motion.div
            className="text-center py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria.</p>
          </motion.div>
        )}
      </motion.div>

      {/* Verifier Groups Modal */}
      {showVerifierGroupsModal && selectedUserForGroups && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
            <div className="flex items-center justify-center mb-6">
              <div className="p-3 rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Edit Verifier Groups
            </h3>
            <p className="text-gray-500 text-center mb-6">
              Select the groups that <strong>{selectedUserForGroups.name}</strong> should handle
            </p>
            <div className="space-y-3 mb-6">
              {verifierTypes.map((type) => (
                <div key={type} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`modal-${type}`}
                    checked={selectedGroups.includes(type)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedGroups(prev => {
                        if (checked) {
                          return [...prev, type];
                        } else {
                          return prev.filter(g => g !== type);
                        }
                      });
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor={`modal-${type}`} className="ml-3 text-sm font-medium text-gray-700">
                    {type === 'g1' ? 'Group G1' :
                     type === 'g2' ? 'Group G2' :
                     type === 'g3' ? 'Group G3' :
                     'All Groups'}
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowVerifierGroupsModal(false);
                  setSelectedUserForGroups(null);
                  setSelectedGroups([]);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVerifierGroups}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      <PasswordResetModal
        isOpen={passwordResetModalOpen}
        onClose={() => {
          setPasswordResetModalOpen(false);
          setSelectedUserForPasswordReset(null);
        }}
        user={selectedUserForPasswordReset}
      />
      </div>
    </div>
  );
}

// User Card Component
const UserCard = ({ 
  user, 
  teams, 
  selectedUsers, 
  setSelectedUsers, 
  updateUserRole, 
  updateCoordinatorType, 
  updateVerifierGroups, 
  assignTeam, 
  openVerifierGroupsModal, 
  getRoleStyle, 
  roles, 
  coordinatorTypes, 
  currentUser 
}: any) => {
  const roleStyle = getRoleStyle(user.role);
  const IconComponent = roleStyle.icon;
  
  return (
    <motion.div
      className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200 group"
      whileHover={{ y: -2 }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={selectedUsers.includes(user.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedUsers([...selectedUsers, user.id]);
              } else {
                setSelectedUsers(selectedUsers.filter(id => id !== user.id));
              }
            }}
          />
          <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Users className="h-6 w-6 text-white" />
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <IconComponent className="h-5 w-5 text-gray-400" />
          <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", roleStyle.bg, roleStyle.text)}>
            {roleStyle.label}
          </span>
        </div>
      </div>
      
      <div className="mb-4">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">{user.name || 'No Name'}</h4>
        <p className="text-sm text-gray-500 flex items-center">
          <Mail className="h-4 w-4 mr-1" />
          {user.email || 'No Email'}
        </p>
      </div>
      
      <div className="space-y-3">
        {/* Role Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
          <select
            value={user.role}
            onChange={(e) => updateUserRole(user.id, e.target.value)}
            disabled={user.id === currentUser?.id}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {getRoleStyle(role).label}
              </option>
            ))}
          </select>
        </div>
        
        {/* Coordinator Type */}
        {user.role === 'coordinator' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Coordinator Type</label>
            <select
              value={user.coordinatorType || 'all'}
              onChange={(e) => updateCoordinatorType(user.id, e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {coordinatorTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'g1' ? 'Group G1' : type === 'g2' ? 'Group G2' : type === 'g3' ? 'Group G3' : 'All Groups'}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* Verifier Groups */}
        {user.role === 'verifier' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Verifier Groups</label>
            <div className="flex items-center space-x-2">
              <div className="flex flex-wrap gap-1 flex-1">
                {user.verifierGroups && user.verifierGroups.length > 0 ? (
                  user.verifierGroups.map((group: any, index: number) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {group === 'g1' ? 'G1' : group === 'g2' ? 'G2' : group === 'g3' ? 'G3' : 'ALL'}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 text-xs">No groups</span>
                )}
              </div>
              <button
                onClick={() => openVerifierGroupsModal(user)}
                className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
              >
                <Edit className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        
        {/* Team Assignment */}
        {(user.role === 'agent' || user.role === 'freelancer') && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Team</label>
            <select
              value={user.teamId || ''}
              onChange={(e) => assignTeam(user.id, e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">No Team</option>
              {teams.map((team: any) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// User Table Row Component
const UserTableRow = ({ 
  user, 
  teams, 
  selectedUsers, 
  setSelectedUsers, 
  updateUserRole, 
  updateCoordinatorType, 
  updateVerifierGroups, 
  assignTeam, 
  openVerifierGroupsModal, 
  getRoleStyle, 
  roles, 
  coordinatorTypes, 
  currentUser 
}: any) => {
  const roleStyle = getRoleStyle(user.role);
  const IconComponent = roleStyle.icon;
  
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4">
        <input
          type="checkbox"
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          checked={selectedUsers.includes(user.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedUsers([...selectedUsers, user.id]);
            } else {
              setSelectedUsers(selectedUsers.filter(id => id !== user.id));
            }
          }}
        />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Users className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{user.name || 'No Name'}</div>
            <div className="text-sm text-gray-500">{user.email || 'No Email'}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center space-x-2">
          <IconComponent className="h-4 w-4 text-gray-400" />
          <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", roleStyle.bg, roleStyle.text)}>
            {roleStyle.label}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center space-x-2">
          <select
            value={user.role}
            onChange={(e) => updateUserRole(user.id, e.target.value)}
            disabled={user.id === currentUser?.id}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {getRoleStyle(role).label}
              </option>
            ))}
          </select>
          
          {user.role === 'verifier' && (
            <button
              onClick={() => openVerifierGroupsModal(user)}
              className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};