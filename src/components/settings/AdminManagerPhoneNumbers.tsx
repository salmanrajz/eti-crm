import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Phone, Plus, Trash2, Users, Search, Filter, XCircle, Shield, UserCog } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CoordinatorType } from '../../types';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'coordinator' | 'manager';
  teamId?: string;
  teamName?: string;
  coordinatorType?: CoordinatorType;
  phoneNumbers: string[];
}

type RoleFilter = 'all' | 'admin' | 'coordinator' | 'manager';

export function AdminManagerPhoneNumbers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [phoneInputs, setPhoneInputs] = useState<{ [userId: string]: string }>({});
  const [isAddingPhone, setIsAddingPhone] = useState<{ [userId: string]: boolean }>({});
  const [isRemovingPhone, setIsRemovingPhone] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel: users and teams
      const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
      const coordinatorQuery = query(collection(db, 'users'), where('role', '==', 'coordinator'));
      const managerQuery = query(collection(db, 'users'), where('role', '==', 'manager'));
      const teamsQuery = query(collection(db, 'teams'));
      
      const [adminSnapshot, coordinatorSnapshot, managerSnapshot, teamsSnapshot] = await Promise.all([
        getDocs(adminQuery),
        getDocs(coordinatorQuery),
        getDocs(managerQuery),
        getDocs(teamsQuery)
      ]);
      
      // Build team name lookup map (O(1) access)
      const teamNameMap = new Map<string, string>();
      teamsSnapshot.docs.forEach(teamDoc => {
        const teamData = teamDoc.data();
        teamNameMap.set(teamDoc.id, teamData.name || 'Unknown Team');
      });
      
      const usersData: User[] = [];
      
      // Process admins - aggregate all admin phone numbers into a single entry
      const allAdminPhoneNumbers = new Set<string>();
      const adminIds: string[] = [];
      adminSnapshot.docs.forEach(userDoc => {
        const userData = userDoc.data();
        const phoneNumbers = userData.phoneNumbers || [];
        phoneNumbers.forEach((phone: string) => allAdminPhoneNumbers.add(phone));
        adminIds.push(userDoc.id);
      });
      
      // Create a single "Admin" entry with aggregated phone numbers
      if (adminIds.length > 0) {
        usersData.push({
          id: 'admin-aggregated', // Special ID for aggregated admin entry
          name: 'Admin',
          email: '',
          role: 'admin',
          phoneNumbers: Array.from(allAdminPhoneNumbers)
        });
      }
      
      // Process coordinators
      coordinatorSnapshot.docs.forEach(userDoc => {
        const userData = userDoc.data();
        usersData.push({
          id: userDoc.id,
          name: userData.name || 'Unknown',
          email: userData.email || '',
          role: 'coordinator',
          coordinatorType: userData.coordinatorType,
          phoneNumbers: userData.phoneNumbers || []
        });
      });
      
      // Process managers (using team map for fast lookup)
      managerSnapshot.docs.forEach(userDoc => {
        const userData = userDoc.data();
        const teamName = userData.teamId 
          ? (teamNameMap.get(userData.teamId) || 'No Team')
          : 'No Team';
        
        usersData.push({
          id: userDoc.id,
          name: userData.name || 'Unknown',
          email: userData.email || '',
          role: 'manager',
          teamId: userData.teamId,
          teamName,
          phoneNumbers: userData.phoneNumbers || []
        });
      });
      
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhoneNumber = async (userId: string) => {
    try {
      const phoneNumber = phoneInputs[userId]?.trim();
      if (!phoneNumber) {
        toast.error('Please enter a phone number');
        return;
      }

      // Basic phone number validation
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber)) {
        toast.error('Please enter a valid phone number');
        return;
      }

      setIsAddingPhone(prev => ({ ...prev, [userId]: true }));
      
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const updatedPhoneNumbers = [...user.phoneNumbers, phoneNumber];
      
      // If this is the aggregated admin entry, update ALL admin users
      if (userId === 'admin-aggregated') {
        // Fetch all admin users and update them all
        const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminSnapshot = await getDocs(adminQuery);
        
        const updatePromises = adminSnapshot.docs.map(adminDoc => {
          const userRef = doc(db, 'users', adminDoc.id);
          // Merge with existing phone numbers (remove duplicates)
          const existingPhones = adminDoc.data().phoneNumbers || [];
          const mergedPhones = Array.from(new Set([...existingPhones, phoneNumber]));
          return updateDoc(userRef, {
            phoneNumbers: mergedPhones,
            updatedAt: new Date()
          });
        });
        
        await Promise.all(updatePromises);
      } else {
        // Regular user update
        const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        phoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date()
      });
      }

      // Reload users to get updated data
      await loadUsers();

      // Clear the input for this user
      setPhoneInputs(prev => ({ ...prev, [userId]: '' }));
      toast.success('Phone number added successfully');
    } catch (error) {
      console.error('Error adding phone number:', error);
      toast.error('Failed to add phone number');
    } finally {
      setIsAddingPhone(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleRemovePhoneNumber = async (userId: string, phoneIndex: number) => {
    try {
      setIsRemovingPhone(`${userId}-${phoneIndex}`);
      
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const phoneToRemove = user.phoneNumbers[phoneIndex];
      const updatedPhoneNumbers = user.phoneNumbers.filter((_, i) => i !== phoneIndex);
      
      // If this is the aggregated admin entry, update ALL admin users
      if (userId === 'admin-aggregated') {
        // Fetch all admin users and remove the phone number from all of them
        const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminSnapshot = await getDocs(adminQuery);
        
        const updatePromises = adminSnapshot.docs.map(adminDoc => {
          const userRef = doc(db, 'users', adminDoc.id);
          const existingPhones = adminDoc.data().phoneNumbers || [];
          const filteredPhones = existingPhones.filter((phone: string) => phone !== phoneToRemove);
          return updateDoc(userRef, {
            phoneNumbers: filteredPhones,
            updatedAt: new Date()
          });
        });
        
        await Promise.all(updatePromises);
      } else {
        // Regular user update
        const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        phoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date()
      });
      }

      // Reload users to get updated data
      await loadUsers();

      toast.success('Phone number removed successfully');
    } catch (error) {
      console.error('Error removing phone number:', error);
      toast.error('Failed to remove phone number');
    } finally {
      setIsRemovingPhone(null);
    }
  };

  const getRoleDisplay = (role: string, coordinatorType?: CoordinatorType) => {
    if (role === 'admin') return 'Admin';
    if (role === 'coordinator') {
      if (coordinatorType === 'g1') return 'Coordinator (G1)';
      if (coordinatorType === 'g2') return 'Coordinator (G2)';
      if (coordinatorType === 'g3') return 'Coordinator (G3)';
      if (coordinatorType === 'all') return 'Coordinator (All Groups)';
      return 'Coordinator';
    }
    return 'Manager';
  };

  const getRoleIcon = (role: string) => {
    if (role === 'admin') return Shield;
    if (role === 'coordinator') return UserCog;
    return Users;
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.teamName && user.teamName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role Filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Filter className="h-5 w-5 text-gray-500" />
          <div className="flex space-x-2">
            {(['all', 'admin', 'coordinator', 'manager'] as RoleFilter[]).map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  roleFilter === role
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1) + 's'}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-indigo-500" />
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">{filteredUsers.length}</div>
              <div className="text-xs text-gray-500">Total Users</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, email, or team..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white shadow-sm text-lg"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <XCircle className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-purple-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Email / Team
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Phone Numbers
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
        <AnimatePresence>
                {filteredUsers.map((user) => {
                  const RoleIcon = getRoleIcon(user.role);
                  return (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* User Name */}
                      <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm ${
                            user.role === 'admin' ? 'bg-gradient-to-r from-red-500 via-orange-600 to-yellow-600' :
                            user.role === 'coordinator' ? 'bg-gradient-to-r from-purple-500 via-pink-600 to-rose-600' :
                            'bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600'
                          }`}>
                            <RoleIcon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.role === 'admin' ? 'bg-red-100 text-red-800' :
                          user.role === 'coordinator' ? 'bg-purple-100 text-purple-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {getRoleDisplay(user.role, user.coordinatorType)}
                        </span>
                      </td>

                      {/* Email / Team */}
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {user.email && <div className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                            <span>{user.email}</span>
                          </div>}
                          {user.teamName && (
                            <div className="flex items-center space-x-1 mt-1 text-gray-600">
                              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                              <span>{user.teamName}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Phone Numbers */}
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          {user.phoneNumbers.length > 0 ? (
                            user.phoneNumbers.map((phone, index) => (
                              <div key={index} className="flex items-center justify-between group">
                                <div className="flex items-center space-x-2">
                                  <Phone className="h-4 w-4 text-green-500" />
                                  <span className="text-sm text-gray-900 font-medium">{phone}</span>
                        </div>
                        <button
                                  onClick={() => handleRemovePhoneNumber(user.id, index)}
                                  disabled={isRemovingPhone === `${user.id}-${index}`}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-all disabled:opacity-50"
                          title="Remove phone number"
                        >
                                  {isRemovingPhone === `${user.id}-${index}` ? (
                                    <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                              </div>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500 italic">No number set</span>
                          )}
                          
                          {/* Add Phone Number Input */}
                          <div className="flex items-center space-x-2 mt-2">
                      <div className="flex-1 relative">
                        <input
                          type="tel"
                                value={phoneInputs[user.id] || ''}
                                onChange={(e) => setPhoneInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                                placeholder="+1234567890"
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                    handleAddPhoneNumber(user.id);
                            }
                          }}
                        />
                      </div>
                      <button
                              onClick={() => handleAddPhoneNumber(user.id)}
                              disabled={isAddingPhone[user.id] || !phoneInputs[user.id]?.trim()}
                              className="inline-flex items-center px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                              {isAddingPhone[user.id] ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                                <Plus className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                      </td>

                      {/* Actions / Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium ${
                            user.phoneNumbers.length > 0 
                              ? 'bg-green-50 text-green-700 border border-green-200' 
                              : 'bg-gray-50 text-gray-500 border border-gray-200'
                          }`}>
                            <Phone className={`h-3 w-3 ${user.phoneNumbers.length > 0 ? 'text-green-500' : 'text-gray-400'}`} />
                            <span>{user.phoneNumbers.length}</span>
                </div>
              </div>
                      </td>
                    </motion.tr>
                  );
                })}
        </AnimatePresence>

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-gray-400" />
            </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {searchTerm || roleFilter !== 'all' ? 'No users found' : 'No users available'}
            </h3>
                      <p className="text-sm text-gray-500 mb-4">
                        {searchTerm || roleFilter !== 'all'
                          ? 'Try adjusting your search terms or filters'
                          : 'No users are currently registered in the system'
              }
            </p>
                      {(searchTerm || roleFilter !== 'all') && (
              <button
                          onClick={() => {
                            setSearchTerm('');
                            setRoleFilter('all');
                          }}
                          className="inline-flex items-center px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <XCircle className="h-4 w-4 mr-2" />
                          Clear Filters
              </button>
            )}
                    </div>
                  </td>
                </tr>
        )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
