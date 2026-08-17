import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Users, Search, XCircle, Shield, UserCog } from 'lucide-react';
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

  const rolePills: { id: RoleFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'admin', label: 'Admins' },
    { id: 'coordinator', label: 'Coordinators' },
    { id: 'manager', label: 'Managers' },
  ];

  const roleTone = (role: string) => {
    if (role === 'admin') return { icon: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700', card: 'border-rose-100' };
    if (role === 'coordinator') return { icon: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700', card: 'border-violet-100' };
    return { icon: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700', card: 'border-sky-100' };
  };

  return (
    <>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, email, or team"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="inline-flex items-center gap-1.5 self-start rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              <Users className="h-3.5 w-3.5" />
              {filteredUsers.length}
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {rolePills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setRoleFilter(pill.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  roleFilter === pill.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-800">No people found</p>
              <p className="mt-1 text-xs text-slate-500">Try another search or role filter.</p>
              {(searchTerm || roleFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setRoleFilter('all');
                  }}
                  className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <div className="min-w-[40rem]">
                <div className="grid grid-cols-[minmax(8rem,1fr)_minmax(7rem,0.9fr)_minmax(10rem,1.5fr)_11rem] border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <div className="border-r border-slate-200 px-2 py-2 text-left">Name</div>
                  <div className="border-r border-slate-200 px-2 py-2 text-center">Role</div>
                  <div className="border-r border-slate-200 px-2 py-2 text-center">Numbers</div>
                  <div className="px-2 py-2 text-center">Add</div>
                </div>
                {filteredUsers.map((user, rowIndex) => {
                  const RoleIcon = getRoleIcon(user.role);
                  const tone = roleTone(user.role);
                  return (
                    <div
                      key={user.id}
                      className={`grid grid-cols-[minmax(8rem,1fr)_minmax(7rem,0.9fr)_minmax(10rem,1.5fr)_11rem] items-stretch border-b border-slate-200 last:border-b-0 ${
                        rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                      }`}
                    >
                      <div className="flex min-w-0 items-center justify-start gap-2 border-r border-slate-200 px-2 py-2">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${tone.icon}`}>
                          <RoleIcon className="h-4 w-4" />
                        </div>
                        <div className="truncate text-sm font-bold text-slate-900">{user.name}</div>
                      </div>

                      <div className="flex min-w-0 flex-col items-center justify-center border-r border-slate-200 px-2 py-2">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
                          {getRoleDisplay(user.role, user.coordinatorType)}
                        </span>
                        {user.teamName && (
                          <div className="mt-0.5 truncate text-center text-[11px] text-slate-500">{user.teamName}</div>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center justify-center gap-1 border-r border-slate-200 px-2 py-2">
                        {user.phoneNumbers.length === 0 && (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                        {user.phoneNumbers.map((phone, index) => (
                          <div key={`${user.id}-${phone}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5">
                            <span className="font-mono text-xs font-medium text-slate-800">{phone}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoneNumber(user.id, index)}
                              disabled={isRemovingPhone === `${user.id}-${index}`}
                              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              title="Remove number"
                            >
                              {isRemovingPhone === `${user.id}-${index}` ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-center gap-1 px-2 py-2">
                        <input
                          type="tel"
                          value={phoneInputs[user.id] || ''}
                          onChange={(e) => setPhoneInputs((prev) => ({ ...prev, [user.id]: e.target.value }))}
                          placeholder="+971…"
                          className="w-full min-w-0 max-w-[7.5rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-xs outline-none placeholder:text-slate-400 focus:border-emerald-400"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddPhoneNumber(user.id);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPhoneNumber(user.id)}
                          disabled={isAddingPhone[user.id] || !phoneInputs[user.id]?.trim()}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white disabled:opacity-50"
                        >
                          {isAddingPhone[user.id] ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
