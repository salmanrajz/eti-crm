import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Phone, Plus, Trash2, Users, Search, Filter, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Manager {
  id: string;
  name: string;
  email: string;
  teamId?: string;
  teamName?: string;
  phoneNumbers: string[];
}

export function AdminManagerPhoneNumbers() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedManager, setSelectedManager] = useState<Manager | null>(null);
  const [phoneInputs, setPhoneInputs] = useState<{ [managerId: string]: string }>({});
  const [isAddingPhone, setIsAddingPhone] = useState<{ [managerId: string]: boolean }>({});
  const [isRemovingPhone, setIsRemovingPhone] = useState<string | null>(null);

  useEffect(() => {
    loadManagers();
  }, []);

  const loadManagers = async () => {
    try {
      setLoading(true);
      
      // Get all users with manager role
      const usersQuery = query(
        collection(db, 'users'),
        where('role', '==', 'manager')
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      const managersData: Manager[] = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        // Get team name if teamId exists
        let teamName = 'No Team';
        if (userData.teamId) {
          try {
            const teamRef = doc(db, 'teams', userData.teamId);
            const teamDoc = await getDocs(query(collection(db, 'teams'), where('__name__', '==', userData.teamId)));
            if (!teamDoc.empty) {
              const teamData = teamDoc.docs[0].data();
              teamName = teamData.name || 'Unknown Team';
            }
          } catch (error) {
            console.error('Error fetching team name:', error);
          }
        }
        
        managersData.push({
          id: userDoc.id,
          name: userData.name || 'Unknown',
          email: userData.email || '',
          teamId: userData.teamId,
          teamName,
          phoneNumbers: userData.phoneNumbers || []
        });
      }
      
      setManagers(managersData);
    } catch (error) {
      console.error('Error loading managers:', error);
      toast.error('Failed to load managers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhoneNumber = async (managerId: string) => {
    try {
      const phoneNumber = phoneInputs[managerId]?.trim();
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

      setIsAddingPhone(prev => ({ ...prev, [managerId]: true }));
      
      const manager = managers.find(m => m.id === managerId);
      if (!manager) return;

      const updatedPhoneNumbers = [...manager.phoneNumbers, phoneNumber];
      
      const userRef = doc(db, 'users', managerId);
      await updateDoc(userRef, {
        phoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date()
      });

      // Update local state
      setManagers(prev => prev.map(m => 
        m.id === managerId 
          ? { ...m, phoneNumbers: updatedPhoneNumbers }
          : m
      ));

      // Update selected manager if it's the same one
      if (selectedManager?.id === managerId) {
        setSelectedManager({ ...selectedManager, phoneNumbers: updatedPhoneNumbers });
      }

      // Clear the input for this manager
      setPhoneInputs(prev => ({ ...prev, [managerId]: '' }));
      toast.success('Phone number added successfully');
    } catch (error) {
      console.error('Error adding phone number:', error);
      toast.error('Failed to add phone number');
    } finally {
      setIsAddingPhone(prev => ({ ...prev, [managerId]: false }));
    }
  };

  const handleRemovePhoneNumber = async (managerId: string, phoneIndex: number) => {
    try {
      setIsRemovingPhone(`${managerId}-${phoneIndex}`);
      
      const manager = managers.find(m => m.id === managerId);
      if (!manager) return;

      const updatedPhoneNumbers = manager.phoneNumbers.filter((_, i) => i !== phoneIndex);
      
      const userRef = doc(db, 'users', managerId);
      await updateDoc(userRef, {
        phoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date()
      });

      // Update local state
      setManagers(prev => prev.map(m => 
        m.id === managerId 
          ? { ...m, phoneNumbers: updatedPhoneNumbers }
          : m
      ));

      // Update selected manager if it's the same one
      if (selectedManager?.id === managerId) {
        setSelectedManager({ ...selectedManager, phoneNumbers: updatedPhoneNumbers });
      }

      toast.success('Phone number removed successfully');
    } catch (error) {
      console.error('Error removing phone number:', error);
      toast.error('Failed to remove phone number');
    } finally {
      setIsRemovingPhone(null);
    }
  };

  const filteredManagers = managers.filter(manager =>
    manager.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    manager.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    manager.teamName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
            <Phone className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Manager WhatsApp Numbers</h3>
            <p className="mt-1 text-gray-600">
              Manage WhatsApp notification numbers for all managers across teams.
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-200">
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-indigo-500" />
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">{managers.length}</div>
              <div className="text-xs text-gray-500">Total Managers</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search managers by name, email, or team..."
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

      {/* Managers List */}
      <div className="grid gap-4">
        <AnimatePresence>
          {filteredManagers.map((manager) => (
            <motion.div
              key={manager.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Manager Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-gray-900">{manager.name}</h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                          {manager.email}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>
                          {manager.teamName}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-gray-200">
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-semibold text-gray-700">
                          {manager.phoneNumbers.length} {manager.phoneNumbers.length === 1 ? 'Number' : 'Numbers'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phone Numbers */}
              <div className="px-6 py-4">
                {manager.phoneNumbers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Phone className="h-10 w-10 text-gray-400" />
                    </div>
                    <h5 className="text-lg font-semibold text-gray-700 mb-2">No Phone Numbers</h5>
                    <p className="text-gray-500 mb-1">This manager won't receive WhatsApp notifications</p>
                    <p className="text-sm text-gray-400">Add a phone number below to enable notifications</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {manager.phoneNumbers.map((phone, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.1 }}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                            <Phone className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <span className="text-gray-900 font-semibold text-lg">{phone}</span>
                            <div className="flex items-center mt-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                              <span className="text-xs text-gray-500">Active for notifications</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemovePhoneNumber(manager.id, index)}
                          disabled={isRemovingPhone === `${manager.id}-${index}`}
                          className="p-3 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-105"
                          title="Remove phone number"
                        >
                          {isRemovingPhone === `${manager.id}-${index}` ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Add Phone Number */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-4 border border-gray-200">
                    <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                      <Plus className="h-4 w-4 mr-2 text-indigo-500" />
                      Add New Phone Number
                    </h5>
                    <div className="flex items-center space-x-3">
                      <div className="flex-1 relative">
                        <input
                          type="tel"
                          value={phoneInputs[manager.id] || ''}
                          onChange={(e) => setPhoneInputs(prev => ({ ...prev, [manager.id]: e.target.value }))}
                          placeholder="Enter phone number (e.g., +1234567890)"
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-white shadow-sm"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleAddPhoneNumber(manager.id);
                            }
                          }}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <Phone className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddPhoneNumber(manager.id)}
                        disabled={isAddingPhone[manager.id] || !phoneInputs[manager.id]?.trim()}
                        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                      >
                        {isAddingPhone[manager.id] ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Add
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Phone numbers will receive WhatsApp notifications for team updates and lead activities.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredManagers.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="w-24 h-24 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              {searchTerm ? 'No managers found' : 'No managers available'}
            </h3>
            <p className="text-gray-500 mb-4 max-w-md mx-auto">
              {searchTerm 
                ? 'Try adjusting your search terms or clear the search to see all managers'
                : 'No managers are currently registered in the system'
              }
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Clear Search
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
