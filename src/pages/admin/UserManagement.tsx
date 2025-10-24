import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, where, orderBy } from 'firebase/firestore';
import { db, deleteUsers, createUserWithDocument } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { User, UserRole, Team, CoordinatorType, VerifierType, VerifierGroups } from '../../types';
import { Users, CheckCircle, UserPlus, Upload, Trash2, AlertCircle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export function UserManagement() {
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

  const roles: UserRole[] = ['admin', 'manager', 'coordinator', 'verifier', 'agent', 'freelancer'];
  const coordinatorTypes: CoordinatorType[] = ['g1', 'g2', 'g3', 'all'];
  const verifierTypes: VerifierType[] = ['g1', 'g2', 'g3', 'all'];

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
      
      console.log('Loaded users:', usersData);
      console.log('Users with coordinator role:', usersData.filter(u => u.role === 'coordinator'));
      
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
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

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Create New User
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={createUserForm.name}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={createUserForm.email}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  minLength={6}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={createUserForm.password}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role
                </label>
                <select
                  id="role"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={createUserForm.role}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, role: e.target.value as UserRole }))}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="coordinatorType" className="block text-sm font-medium text-gray-700">
                  Coordinator Type
                </label>
                <select
                  id="coordinatorType"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  value={createUserForm.coordinatorType}
                  onChange={(e) => setCreateUserForm(prev => ({ ...prev, coordinatorType: e.target.value as CoordinatorType }))}
                >
                  {coordinatorTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verifier Groups
                </label>
                <div className="space-y-2">
                  {verifierTypes.map((type) => (
                    <div key={type} className="flex items-center">
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
                      <label htmlFor={`verifier-${type}`} className="ml-2 text-sm text-gray-700">
                        {type === 'g1' ? 'Group G1' :
                         type === 'g2' ? 'Group G2' :
                         type === 'g3' ? 'Group G3' :
                         'All Groups'}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creatingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage user roles and permissions for the system.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-4">
          {selectedUsers.length > 0 && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedUsers.length})
            </button>
          )}
          <Link
            to="/dashboard/admin/users/bulk-upload"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300" style={{ minWidth: '1200px' }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="relative px-6 py-3 w-12">
                      <input
                        type="checkbox"
                        className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedUsers.length === users.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsers(users.map(u => u.id));
                          } else {
                            setSelectedUsers([]);
                          }
                        }}
                      />
                    </th>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 w-48">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-64">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-32">
                      Current Role
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 bg-blue-50 border-l-2 border-blue-200 w-48">
                      📋 Coordinator Type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 bg-green-50 border-l-2 border-green-200 w-48">
                      🔍 Verifier Type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-48">
                      Team
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-48">
                      Change Role
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="relative px-6 py-4">
                        <input
                          type="checkbox"
                          className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {user.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {user.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {user.role === 'coordinator' ? (
                          <select
                            value={user.coordinatorType || 'all'}
                            onChange={(e) => updateCoordinatorType(user.id, e.target.value as CoordinatorType)}
                            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                          >
                            {coordinatorTypes.map((type) => (
                              <option key={type} value={type}>
                                {type === 'g1' ? 'Group G1' :
                                 type === 'g2' ? 'Group G2' :
                                 type === 'g3' ? 'Group G3' :
                                 'All Groups (G1-G5)'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400 italic">Not applicable</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {user.role === 'verifier' ? (
                          <div className="flex items-center space-x-2">
                            <div className="flex flex-wrap gap-1">
                              {user.verifierGroups && user.verifierGroups.length > 0 ? (
                                user.verifierGroups.map((group, index) => (
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
                              className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                              title="Edit verifier groups"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Not applicable</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {(user.role === 'agent' || user.role === 'verifier' || user.role === 'coordinator' || user.role === 'freelancer') && (
                          <select
                            value={user.teamId || ''}
                            onChange={(e) => assignTeam(user.id, e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                          >
                            <option value="">No Team</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {user.role === 'manager' && (
                          <div className="text-sm text-gray-500">
                            {teams.find(t => t.managerId === user.id)?.name || 'No team managed'}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                          disabled={user.id === currentUser?.id}
                          className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}