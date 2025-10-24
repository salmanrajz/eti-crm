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
import { Users, Plus, Pencil, Trash2, UserPlus, Building2, Upload, DollarSign } from 'lucide-react';
import { TeamBulkUpload } from '../../components/teams/TeamBulkUpload';
import { CommissionConfig } from '../../components/CommissionConfig';

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
  const [formData, setFormData] = useState({
    name: '',
    managerId: '',
    managerName: '',
    commissionBased: false,
    isFreelancerTeam: false
  });

  useEffect(() => {
    Promise.all([loadTeams(), loadManagers(), loadUnassignedUsers()]);
  }, []);

  async function loadTeams() {
    try {
      const teamsQuery = query(collection(db, 'teams'));
      const snapshot = await getDocs(teamsQuery);
      const teamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        managerName: '',
        commissionBased: doc.data().commissionBased || false,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as Team[];
      
      // Get manager names and team members for each team
      for (const team of teamsData) {
        if (team.managerId) {
          const managerDoc = await getDoc(doc(db, 'users', team.managerId));
          if (managerDoc.exists()) {
            team.managerName = managerDoc.data().name;
          }
        }

        // Get team members
        const membersQuery = query(
          collection(db, 'users'),
          where('teamId', '==', team.id),
          where('role', 'in', ['agent', 'freelancer'])
        );
        const membersSnapshot = await getDocs(membersQuery);
        team.members = membersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as User[];
      }
      
      setTeams(teamsData);
    } catch (error) {
      console.error('Error loading teams:', error);
      toast.error('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }

  async function loadManagers() {
    try {
      const managersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['manager', null])
      );
      const snapshot = await getDocs(managersQuery);
      
      let availableManagers = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        })) as User[];

      if (isEditing && editingTeam?.managerId) {
        const currentManagerDoc = await getDoc(doc(db, 'users', editingTeam.managerId));
        if (currentManagerDoc.exists()) {
          const currentManager = {
            id: currentManagerDoc.id,
            ...currentManagerDoc.data(),
            createdAt: currentManagerDoc.data().createdAt?.toDate(),
            updatedAt: currentManagerDoc.data().updatedAt?.toDate()
          } as User;
          
          if (!availableManagers.find(m => m.id === currentManager.id)) {
            availableManagers.push(currentManager);
          }
        }
      }

      setManagers(availableManagers);
    } catch (error) {
      console.error('Error loading managers:', error);
      toast.error('Failed to load managers');
    }
  }

  async function loadUnassignedUsers() {
    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['agent', 'freelancer']),
        where('teamId', '==', null)
      );
      const snapshot = await getDocs(usersQuery);
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as User[];
      setUnassignedUsers(users);
    } catch (error) {
      console.error('Error loading unassigned users:', error);
      toast.error('Failed to load unassigned users');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.managerId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const manager = managers.find(m => m.id === formData.managerId);
    if (!manager) {
      toast.error('Selected manager not found');
      return;
    }

    try {
      if (isEditing && editingTeam) {
        const teamData = {
          name: formData.name,
          managerId: formData.managerId,
          managerName: manager.name,
          commissionBased: formData.commissionBased,
          isFreelancerTeam: formData.isFreelancerTeam,
          updatedAt: new Date()
        };
        await updateDoc(doc(db, 'teams', editingTeam.id), teamData);
        
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
      loadTeams();
      loadManagers();
      loadUnassignedUsers();
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
      loadUnassignedUsers();
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
      loadUnassignedUsers();
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
  }

  async function handleDelete(teamId: string) {
    if (!window.confirm('Are you sure you want to delete this team?')) {
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
      loadUnassignedUsers();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast.error('Failed to delete team');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Team Management</h1>
          <p className="mt-2 text-sm text-gray-700">
            Create and manage teams and their members.
          </p>
        </div>
      </div>

      {/* Create/Edit Team Form */}
      <div className="mt-8 bg-white shadow rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Team Name *
              </label>
              <input
                type="text"
                id="name"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <label htmlFor="managerId" className="block text-sm font-medium text-gray-700">
                Team Manager *
              </label>
              <select
                id="managerId"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
            <div className="sm:col-span-2 flex items-center mt-2">
              <input
                type="checkbox"
                id="commissionBased"
                checked={formData.commissionBased}
                onChange={e => setFormData(prev => ({ ...prev, commissionBased: e.target.checked }))}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="commissionBased" className="ml-2 block text-sm text-gray-700">
                Commission-based team
              </label>
            </div>
            <div className="sm:col-span-2 flex items-center mt-2">
              <input
                type="checkbox"
                id="isFreelancerTeam"
                checked={formData.isFreelancerTeam}
                onChange={e => setFormData(prev => ({ ...prev, isFreelancerTeam: e.target.checked }))}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="isFreelancerTeam" className="ml-2 block text-sm text-gray-700">
                Freelancer team (members become freelancers with restricted number pool)
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditingTeam(null);
                  setFormData({ name: '', managerId: '', managerName: '', commissionBased: false, isFreelancerTeam: false });
                }}
                className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isEditing ? 'Update Team' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>

      {/* Teams List */}
      <div className="mt-8">
        {teams.map((team) => (
          <div key={team.id} className="mb-8 bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">{team.name}</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Manager: {team.managerName}
                </p>
              </div>
              <div className="flex space-x-4">
                {team.commissionBased && (
                  <button
                    onClick={() => {
                      setSelectedTeam(team);
                      setShowCommissionConfigModal(true);
                    }}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    Configure Commission
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedTeam(team);
                    setShowBulkUploadModal(true);
                  }}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload
                </button>
                <button
                  onClick={() => {
                    setSelectedTeam(team);
                    setShowAssignModal(true);
                  }}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Members
                </button>
                <button
                  onClick={() => handleEdit(team)}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(team.id)}
                  className="text-red-600 hover:text-red-900"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="border-t border-gray-200">
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
                    <tr key={member.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {member.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {member.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleRemoveFromTeam(member.id, team.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!team.members || team.members.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                        No team members yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Assign Users Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Add Members to {selectedTeam?.name}
              </h3>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedUsers([]);
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {unassignedUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  No unassigned users available
                </p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedUsers.length === unassignedUsers.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers(unassignedUsers.map(u => u.id));
                            } else {
                              setSelectedUsers([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {unassignedUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {user.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {user.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedUsers([]);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignUsers}
                disabled={selectedUsers.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Assign Selected Users
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUploadModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <TeamBulkUpload
              team={selectedTeam}
              onComplete={() => {
                setShowBulkUploadModal(false);
                loadTeams();
              }}
            />
          </div>
        </div>
      )}

      {/* Commission Config Modal */}
      {showCommissionConfigModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <CommissionConfig
              teamId={selectedTeam.id}
              onClose={() => {
                setShowCommissionConfigModal(false);
                setSelectedTeam(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}