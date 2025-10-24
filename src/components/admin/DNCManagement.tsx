import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Plus, Trash2, Search, AlertTriangle, CheckCircle, Clock, X, Settings, Globe } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { addToDNC, removeFromDNC, getAllDNCNumbers, getUserNames, getUserDetails, getWhatsAppCheckLogs, checkDNCNumber, DNCRecord, WhatsAppCheckLog } from '../../utils/dncService';
import { getAppConfig, updateWhatsAppApiEndpoint, AppConfig } from '../../utils/configService';

interface DNCManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DNCManagement({ isOpen, onClose }: DNCManagementProps) {
  const [dncNumbers, setDncNumbers] = useState<DNCRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newReason, setNewReason] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [addedNumber, setAddedNumber] = useState('');
  const [duplicateMessage, setDuplicateMessage] = useState('');
  
  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userDetails, setUserDetails] = useState<Record<string, {name: string, teamName: string}>>({});
  
  // API Configuration states
  const [activeTab, setActiveTab] = useState<'dnc' | 'api' | 'logs'>('dnc');
  const [apiConfig, setApiConfig] = useState<AppConfig | null>(null);
  const [newApiEndpoint, setNewApiEndpoint] = useState('');
  const [isUpdatingEndpoint, setIsUpdatingEndpoint] = useState(false);
  
  // WhatsApp Check Logs states
  const [checkLogs, setCheckLogs] = useState<WhatsAppCheckLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [logsHasMore, setLogsHasMore] = useState(true);
  const [logsLastDoc, setLogsLastDoc] = useState<any>(null);
  const [logsUserDetails, setLogsUserDetails] = useState<Record<string, {name: string, teamName: string}>>({});
  
  const { user } = useAuthStore();

  // Load DNC numbers (only for admins and managers)
  const loadDNCNumbers = async (reset = false) => {
    if (!['admin', 'manager'].includes(user?.role || '')) {
      return; // Don't load numbers for agents/freelancers
    }
    
    if (reset) {
      setLoading(true);
      setDncNumbers([]);
      setLastDoc(null);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await getAllDNCNumbers(20, reset ? undefined : lastDoc);
      
      if (reset) {
        setDncNumbers(result.records);
      } else {
        setDncNumbers(prev => [...prev, ...result.records]);
      }
      
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
      
      // Fetch user names and details for the new records
      const userIds = result.records.map(record => record.addedBy);
      const uniqueUserIds = [...new Set(userIds)];
      const [newUserNames, newUserDetails] = await Promise.all([
        getUserNames(uniqueUserIds),
        getUserDetails(uniqueUserIds)
      ]);
      setUserNames(prev => ({ ...prev, ...newUserNames }));
      setUserDetails(prev => ({ ...prev, ...newUserDetails }));
      
    } catch (error) {
      toast.error('Failed to load DNC numbers');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load API configuration (only for admins)
  const loadApiConfig = async () => {
    if (user?.role !== 'admin') {
      return;
    }
    
    try {
      const config = await getAppConfig();
      setApiConfig(config);
      setNewApiEndpoint(config?.whatsappApiEndpoint || '');
    } catch (error) {
      console.error('Failed to load API config:', error);
    }
  };

  // Load WhatsApp check logs (only for admins)
  const loadCheckLogs = async (reset = false) => {
    if (user?.role !== 'admin') {
      return;
    }
    
    if (reset) {
      setLogsLoading(true);
      setCheckLogs([]);
      setLogsLastDoc(null);
      setLogsHasMore(true);
    } else {
      setLogsLoadingMore(true);
    }

    try {
      const result = await getWhatsAppCheckLogs(20, reset ? undefined : logsLastDoc);
      
      if (reset) {
        setCheckLogs(result.records);
      } else {
        setCheckLogs(prev => [...prev, ...result.records]);
      }
      
      setLogsLastDoc(result.lastDoc);
      setLogsHasMore(result.hasMore);
      
      // Fetch user details for the new records
      const userIds = result.records.map(record => record.checkedBy);
      const uniqueUserIds = [...new Set(userIds)];
      const newUserDetails = await getUserDetails(uniqueUserIds);
      setLogsUserDetails(prev => ({ ...prev, ...newUserDetails }));
      
    } catch (error) {
      toast.error('Failed to load WhatsApp check logs');
    } finally {
      setLogsLoading(false);
      setLogsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDNCNumbers(true); // Reset pagination when opening
      loadApiConfig();
      if (activeTab === 'logs') {
        loadCheckLogs(true);
      }
    }
  }, [isOpen, user?.role, activeTab]);

  // Add number to DNC
  const handleAddToDNC = async () => {
    if (!newNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    // Clear any existing success message when adding new number
    setShowSuccessMessage(false);
    setAddedNumber('');
    setDuplicateMessage('');

    const numberToAdd = newNumber.trim();
    setIsAdding(true);
    try {
      // First check if number already exists in DNC
      const isAlreadyInDNC = await checkDNCNumber(numberToAdd);
      
      if (isAlreadyInDNC) {
        setDuplicateMessage(`⚠️ Number ${numberToAdd} is already in the DNC registry!`);
        toast.error(
          `⚠️ Number ${numberToAdd} is already in the DNC registry!`,
          {
            duration: 5000,
            style: {
              background: '#f59e0b',
              color: '#fff',
              fontWeight: '500',
              fontSize: '14px',
              zIndex: 9999,
            },
            icon: '⚠️',
          }
        );
        setIsAdding(false);
        return;
      }

      await addToDNC(numberToAdd, user?.id || '', newReason.trim() || undefined);
      
      // Show inline success message
      setAddedNumber(numberToAdd);
      setShowSuccessMessage(true);
      
      // Also show toast with higher z-index
      toast.success(
        `✅ Number ${numberToAdd} added to DNC registry successfully!`,
        {
          duration: 4000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontWeight: '500',
            fontSize: '14px',
            zIndex: 9999,
          },
          icon: '🚫',
        }
      );
      
      setNewNumber('');
      setNewReason('');
      loadDNCNumbers(true); // Reset and reload the list
    } catch (error) {
      toast.error('Failed to add number to DNC');
    } finally {
      setIsAdding(false);
    }
  };

  // Remove number from DNC
  const handleRemoveFromDNC = async (number: string) => {
    if (!confirm('Are you sure you want to remove this number from DNC?')) {
      return;
    }

    try {
      await removeFromDNC(number);
      toast.success('Number removed from DNC list');
      loadDNCNumbers(true); // Reset and reload the list
    } catch (error) {
      toast.error('Failed to remove number from DNC');
    }
  };

  // Update WhatsApp API endpoint
  const handleUpdateApiEndpoint = async () => {
    if (!newApiEndpoint.trim()) {
      toast.error('Please enter a valid API endpoint');
      return;
    }

    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    setIsUpdatingEndpoint(true);
    try {
      await updateWhatsAppApiEndpoint(newApiEndpoint.trim(), user.id);
      toast.success('WhatsApp API endpoint updated successfully!');
      loadApiConfig();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update API endpoint');
    } finally {
      setIsUpdatingEndpoint(false);
    }
  };

  // Filter numbers based on search term
  const filteredNumbers = dncNumbers.filter(dnc =>
    dnc.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dnc.reason?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">DNC Number Management</h2>
                <p className="text-red-100 text-sm">Manage Do Not Call registry</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Tabs - Only show for admins */}
          {user?.role === 'admin' && (
            <div className="flex space-x-1 mt-4">
              <button
                onClick={() => setActiveTab('dnc')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'dnc' 
                    ? 'bg-white/20 text-white' 
                    : 'text-red-100 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4" />
                  <span>DNC Management</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'logs' 
                    ? 'bg-white/20 text-white' 
                    : 'text-red-100 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4" />
                  <span>WhatsApp Checker Log</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('api')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'api' 
                    ? 'bg-white/20 text-white' 
                    : 'text-red-100 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Globe className="h-4 w-4" />
                  <span>API Configuration</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* DNC Management Tab */}
          {activeTab === 'dnc' && (
            <>
              {/* Add New Number Section */}
              <div className={`p-6 ${['admin', 'manager'].includes(user?.role || '') ? 'border-b border-gray-200' : ''} bg-gray-50`}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {['admin', 'manager'].includes(user?.role || '') ? 'Add Number to DNC' : 'Add Number to Do Not Call Registry'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="text"
                  value={newNumber}
                  onChange={(e) => {
                    setNewNumber(e.target.value);
                    if (duplicateMessage) {
                      setDuplicateMessage('');
                    }
                  }}
                  placeholder="+971501234567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Customer requested"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddToDNC}
                  disabled={isAdding}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isAdding ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>{isAdding ? 'Adding...' : 'Add to DNC'}</span>
                </button>
              </div>
            </div>
            
            {/* Duplicate Message */}
            {duplicateMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-4 bg-orange-100 border border-orange-300 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-6 w-6 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-orange-800">
                        ⚠️ Duplicate Number
                      </h4>
                      <p className="text-sm text-orange-700 mt-1">
                        {duplicateMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDuplicateMessage('')}
                    className="flex-shrink-0 ml-3 p-1 text-orange-600 hover:bg-orange-200 rounded-full transition-colors"
                    title="Close duplicate message"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
            
            {/* Success Message */}
            {showSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="flex-shrink-0">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-green-800">
                        ✅ Success!
                      </h4>
                      <p className="text-sm text-green-700 mt-1">
                        Number <span className="font-mono font-semibold">{addedNumber}</span> has been added to the DNC registry successfully.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowSuccessMessage(false);
                      setAddedNumber('');
                    }}
                    className="flex-shrink-0 ml-3 p-1 text-green-600 hover:bg-green-200 rounded-full transition-colors"
                    title="Close success message"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Search and List Section - Only for Admins and Managers */}
          {['admin', 'manager'].includes(user?.role || '') && (
            <div className="flex-1 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-6 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by number or reason..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>

            {/* DNC Numbers List */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
                </div>
              ) : filteredNumbers.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">
                    {searchTerm ? 'No numbers found matching your search' : 'No DNC numbers found'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNumbers.map((dnc, index) => (
                    <motion.div
                      key={dnc.id || index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {dnc.number}
                              </p>
                              <div className="flex items-center space-x-4 mt-1">
                                <p className="text-xs text-gray-500">
                                  Added: {new Date(dnc.addedAt).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                  By: <span className="font-medium">{userNames[dnc.addedBy] || 'Loading...'}</span>
                                  {userDetails[dnc.addedBy]?.teamName && userDetails[dnc.addedBy]?.teamName !== 'No Team' && (
                                    <span className="text-gray-400"> • {userDetails[dnc.addedBy].teamName}</span>
                                  )}
                                </p>
                                {dnc.reason && (
                                  <p className="text-xs text-gray-500">
                                    Reason: {dnc.reason}
                                  </p>
                                )}
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  dnc.source === 'manual' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {dnc.source}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFromDNC(dnc.number)}
                          className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove from DNC"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  
                  {/* Load More Button */}
                  {hasMore && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={() => loadDNCNumbers(false)}
                        disabled={loadingMore}
                        className="px-6 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {loadingMore ? (
                          <>
                            <Clock className="h-4 w-4 animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            <span>Load More</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
            </>
          )}

          {/* API Configuration Tab - Only for admins */}
          {activeTab === 'api' && user?.role === 'admin' && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-6 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  WhatsApp API Configuration
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Configure the WhatsApp API endpoint used for number verification. Changes take effect immediately.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current API Endpoint
                    </label>
                    <div className="p-3 bg-gray-100 rounded-lg border">
                      <code className="text-sm text-gray-800 break-all">
                        {apiConfig?.whatsappApiEndpoint || 'http://20.84.63.80:3000/check'}
                      </code>
                    </div>
                    {apiConfig?.updatedAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        Last updated: {new Date(apiConfig.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New API Endpoint
                    </label>
                    <input
                      type="url"
                      value={newApiEndpoint}
                      onChange={(e) => setNewApiEndpoint(e.target.value)}
                      placeholder="http://your-api-server:port/check"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter the full URL including protocol (http:// or https://)
                    </p>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={handleUpdateApiEndpoint}
                      disabled={isUpdatingEndpoint || !newApiEndpoint.trim()}
                      className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 flex items-center space-x-2"
                    >
                      {isUpdatingEndpoint ? (
                        <Clock className="h-4 w-4 animate-spin" />
                      ) : (
                        <Settings className="h-4 w-4" />
                      )}
                      <span>{isUpdatingEndpoint ? 'Updating...' : 'Update Endpoint'}</span>
                    </button>
                    
                    <button
                      onClick={() => setNewApiEndpoint(apiConfig?.whatsappApiEndpoint || '')}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Reset
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Checker Log Tab - Only for admins */}
          {activeTab === 'logs' && user?.role === 'admin' && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-6 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  WhatsApp Checker Log
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  View all WhatsApp number checks performed by users. This log tracks who checked which numbers and the results.
                </p>
                
                {/* Check Logs List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {logsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
                    </div>
                  ) : checkLogs.length === 0 ? (
                    <div className="text-center py-8">
                      <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No WhatsApp checks found</p>
                    </div>
                  ) : (
                    <>
                      {checkLogs.map((log, index) => (
                        <motion.div
                          key={log.id || index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    log.result === 'exists' 
                                      ? 'bg-green-100' 
                                      : log.result === 'not_exists' 
                                        ? 'bg-yellow-100' 
                                        : 'bg-red-100'
                                  }`}>
                                    {log.result === 'exists' ? (
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    ) : log.result === 'not_exists' ? (
                                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                    ) : (
                                      <X className="h-4 w-4 text-red-600" />
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {log.number}
                                  </p>
                                  <div className="flex items-center space-x-4 mt-1">
                                    <p className="text-xs text-gray-500">
                                      Checked: {new Date(log.checkedAt).toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      By: <span className="font-medium">{logsUserDetails[log.checkedBy]?.name || 'Loading...'}</span>
                                      {logsUserDetails[log.checkedBy]?.teamName && logsUserDetails[log.checkedBy]?.teamName !== 'No Team' && (
                                        <span className="text-gray-400"> • {logsUserDetails[log.checkedBy].teamName}</span>
                                      )}
                                    </p>
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      log.result === 'exists' 
                                        ? 'bg-green-100 text-green-800' 
                                        : log.result === 'not_exists' 
                                          ? 'bg-yellow-100 text-yellow-800' 
                                          : 'bg-red-100 text-red-800'
                                    }`}>
                                      {log.result === 'exists' ? 'WhatsApp Found' : log.result === 'not_exists' ? 'No WhatsApp' : 'Error'}
                                    </span>
                                    {log.isDNC && (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        DNC
                                      </span>
                                    )}
                                    {log.inNumberPool && (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        In Pool
                                      </span>
                                    )}
                                  </div>
                                  {log.errorMessage && (
                                    <p className="text-xs text-red-600 mt-1">
                                      Error: {log.errorMessage}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      
                      {/* Load More Button for Logs */}
                      {logsHasMore && (
                        <div className="flex justify-center mt-6">
                          <button
                            onClick={() => loadCheckLogs(false)}
                            disabled={logsLoadingMore}
                            className="px-6 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50 flex items-center space-x-2"
                          >
                            {logsLoadingMore ? (
                              <>
                                <Clock className="h-4 w-4 animate-spin" />
                                <span>Loading...</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                <span>Load More</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {activeTab === 'dnc' ? (
                ['admin', 'manager'].includes(user?.role || '') ? `Showing ${filteredNumbers.length} DNC Numbers${hasMore ? ' (Load more to see all)' : ''}` : 'Add numbers to prevent future contact attempts'
              ) : activeTab === 'logs' ? (
                `Showing ${checkLogs.length} WhatsApp Check Logs${logsHasMore ? ' (Load more to see all)' : ''}`
              ) : (
                'API endpoint configuration for WhatsApp verification'
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
