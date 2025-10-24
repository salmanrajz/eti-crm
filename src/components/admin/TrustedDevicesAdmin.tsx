import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Users, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Trash2, 
  XCircle,
  AlertTriangle, 
  CheckCircle2,
  Clock,
  MapPin,
  Eye,
  EyeOff,
  Search,
  Filter,
  Download,
  Settings
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TrustedDevice, TrustedDeviceSettings } from '../../types';
import { 
  getAllTrustedDevices, 
  revokeTrustedDevice,
  deleteTrustedDevice,
  getTrustedDeviceSettings,
  updateTrustedDeviceSettings,
  cleanupExpiredDevices
} from '../../services/trustedDeviceService';
import { formatDistanceToNow } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  team?: string;
  teamName?: string;
}

export function TrustedDevicesAdmin() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [userData, setUserData] = useState<Record<string, UserData>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<TrustedDeviceSettings>({
    trustDurationDays: 30,
    maxTrustedDevices: 5,
    requireIpValidation: false,
    allowAdminRevoke: true,
    notifyNewDevice: true
  });
  const [updatingSettings, setUpdatingSettings] = useState(false);

  useEffect(() => {
    loadTrustedDevices();
    loadSettings();
  }, []);

  const fetchUserData = async (userId: string): Promise<UserData | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          id: userId,
          name: userData.name || 'Unknown User',
          email: userData.email || 'No Email',
          role: userData.role || 'Unknown Role',
          team: userData.team,
          teamName: userData.teamName
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  };

  const loadTrustedDevices = async () => {
    try {
      setLoading(true);
      const allDevices = await getAllTrustedDevices();
      setDevices(allDevices);
      
      // Fetch user data for all unique user IDs
      const uniqueUserIds = [...new Set(allDevices.map(device => device.userId))];
      const userDataPromises = uniqueUserIds.map(userId => fetchUserData(userId));
      const userDataResults = await Promise.all(userDataPromises);
      
      // Create user data map
      const userDataMap: Record<string, UserData> = {};
      userDataResults.forEach((userData, index) => {
        if (userData) {
          userDataMap[uniqueUserIds[index]] = userData;
        }
      });
      
      setUserData(userDataMap);
    } catch (error) {
      console.error('Error loading trusted devices:', error);
      toast.error('Failed to load trusted devices');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const currentSettings = await getTrustedDeviceSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      setRevokingId(deviceId);
      await revokeTrustedDevice(deviceId);
      await loadTrustedDevices();
      toast.success('Device access revoked');
    } catch (error) {
      console.error('Error revoking device:', error);
      toast.error('Failed to revoke device');
    } finally {
      setRevokingId(null);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to permanently delete this trusted device? This action cannot be undone.')) {
      return;
    }
    
    try {
      setRevokingId(deviceId);
      await deleteTrustedDevice(deviceId);
      await loadTrustedDevices();
      toast.success('Device deleted permanently');
    } catch (error) {
      console.error('Error deleting device:', error);
      toast.error('Failed to delete device');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCleanupExpired = async () => {
    try {
      await cleanupExpiredDevices();
      await loadTrustedDevices();
      toast.success('Expired devices cleaned up');
    } catch (error) {
      console.error('Error cleaning up devices:', error);
      toast.error('Failed to cleanup expired devices');
    }
  };

  const handleUpdateSettings = async () => {
    try {
      setUpdatingSettings(true);
      await updateTrustedDeviceSettings(settings);
      toast.success('Settings updated successfully');
      setShowSettings(false);
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
    } finally {
      setUpdatingSettings(false);
    }
  };

  const getDeviceIcon = (device: TrustedDevice) => {
    const { browser, os } = device.deviceInfo;
    
    if (os.toLowerCase().includes('mobile') || os.toLowerCase().includes('android') || os.toLowerCase().includes('ios')) {
      return Smartphone;
    }
    if (os.toLowerCase().includes('tablet') || os.toLowerCase().includes('ipad')) {
      return Tablet;
    }
    return Monitor;
  };

  const getTrustLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-green-600 bg-green-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (device: TrustedDevice) => {
    if (!device.isActive) return 'text-red-600 bg-red-100';
    if (new Date() > device.expiresAt) return 'text-orange-600 bg-orange-100';
    return 'text-green-600 bg-green-100';
  };

  const toggleDetails = (deviceId: string) => {
    setShowDetails(prev => ({
      ...prev,
      [deviceId]: !prev[deviceId]
    }));
  };

  // Filter devices based on search and status
  const filteredDevices = devices.filter(device => {
    const user = userData[device.userId];
    const matchesSearch = device.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.location.ipAddress.includes(searchTerm) ||
                         (user && (
                           user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (user.teamName && user.teamName.toLowerCase().includes(searchTerm.toLowerCase()))
                         ));
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && device.isActive && new Date() < device.expiresAt) ||
                         (filterStatus === 'expired' && new Date() > device.expiresAt) ||
                         (filterStatus === 'inactive' && !device.isActive);
    
    return matchesSearch && matchesFilter;
  });

  // Statistics
  const stats = {
    total: devices.length,
    active: devices.filter(d => d.isActive && new Date() < d.expiresAt).length,
    expired: devices.filter(d => new Date() > d.expiresAt).length,
    inactive: devices.filter(d => !d.isActive).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Shield className="h-8 w-8 text-indigo-600" />
            Trusted Devices Management
          </h2>
          <p className="text-gray-600 mt-1">
            Monitor and manage all trusted devices across the system
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          
          <button
            onClick={handleCleanupExpired}
            className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Cleanup Expired
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">Total Devices</p>
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-900">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-xl border border-orange-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-900">Expired</p>
              <p className="text-2xl font-bold text-orange-600">{stats.expired}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-gray-50 to-slate-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Users className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Inactive</p>
              <p className="text-2xl font-bold text-gray-600">{stats.inactive}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search devices, users, teams, or IP addresses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">All Devices</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Devices List */}
      <div className="space-y-3">
        {filteredDevices.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No devices found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search terms.' : 'No trusted devices have been registered yet.'}
            </p>
          </div>
        ) : (
          filteredDevices.map((device) => {
            const DeviceIcon = getDeviceIcon(device);
            const showDetail = showDetails[device.id];
            const isExpired = new Date() > device.expiresAt;
            
            return (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gray-100 rounded-xl">
                      <DeviceIcon className="h-6 w-6 text-gray-600" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">
                          {device.deviceName}
                        </h4>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(device)}`}>
                          {!device.isActive ? 'Inactive' : isExpired ? 'Expired' : 'Active'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {userData[device.userId] ? (
                            <>
                              {userData[device.userId].name}
                              {userData[device.userId].teamName && (
                                <span className="text-gray-500"> • {userData[device.userId].teamName}</span>
                              )}
                            </>
                          ) : (
                            `User: ${device.userId}`
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Last seen {formatDistanceToNow(device.lastSeen, { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {device.location.coordinates ? (
                            <span title={`Coordinates: ${device.location.coordinates.latitude}, ${device.location.coordinates.longitude}`}>
                              {device.location.address?.city && device.location.address?.country 
                                ? `${device.location.address.city}, ${device.location.address.country}` 
                                : device.location.city && device.location.country 
                                  ? `${device.location.city}, ${device.location.country}` 
                                  : device.location.ipAddress || 'Unknown Location'
                              }
                              <span className="text-blue-600 text-xs ml-1">📍</span>
                            </span>
                          ) : (
                            device.location.city && device.location.country 
                              ? `${device.location.city}, ${device.location.country}` 
                              : device.location.ipAddress || 'Unknown Location'
                          )}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTrustLevelColor(device.trustLevel)}`}>
                          {device.trustLevel} trust
                        </span>
                        <span className="text-xs text-gray-500">
                          Expires {formatDistanceToNow(device.expiresAt, { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleDetails(device.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title={showDetail ? 'Hide details' : 'Show details'}
                    >
                      {showDetail ? (
                        <EyeOff className="h-4 w-4 text-gray-600" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-600" />
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleRevokeDevice(device.id)}
                      disabled={revokingId === device.id}
                      className="p-2 hover:bg-orange-100 rounded-lg transition-colors text-orange-600 disabled:opacity-50"
                      title="Revoke access (disable device)"
                    >
                      {revokingId === device.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleDeleteDevice(device.id)}
                      disabled={revokingId === device.id}
                      className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600 disabled:opacity-50"
                      title="Delete permanently"
                    >
                      {revokingId === device.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Detailed Information */}
                <AnimatePresence>
                  {showDetail && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-gray-200"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Device Information</h5>
                          <div className="space-y-1 text-gray-600">
                            <p><span className="font-medium">Browser:</span> {device.deviceInfo.browser}</p>
                            <p><span className="font-medium">OS:</span> {device.deviceInfo.os}</p>
                            <p><span className="font-medium">Platform:</span> {device.deviceInfo.platform}</p>
                            <p><span className="font-medium">Resolution:</span> {device.deviceInfo.screenResolution}</p>
                          </div>
                        </div>
                        
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Location & Security</h5>
                          <div className="space-y-1 text-gray-600">
                            <p><span className="font-medium">IP Address:</span> {device.location.ipAddress}</p>
                            <p><span className="font-medium">Country:</span> {device.location.country || 'Unknown'}</p>
                            <p><span className="font-medium">Trusted:</span> {formatDistanceToNow(device.createdAt, { addSuffix: true })}</p>
                            <p><span className="font-medium">Status:</span> {device.isActive ? 'Active' : 'Inactive'}</p>
                          </div>
                        </div>
                        
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">User Information</h5>
                          <div className="space-y-1 text-gray-600">
                            <p><span className="font-medium">User ID:</span> {device.userId}</p>
                            <p><span className="font-medium">Device ID:</span> {device.deviceId}</p>
                            <p><span className="font-medium">Created:</span> {device.createdAt.toLocaleDateString()}</p>
                            <p><span className="font-medium">Last Seen:</span> {device.lastSeen.toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Trusted Device Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trust Duration (days)
                  </label>
                  <input
                    type="number"
                    value={settings.trustDurationDays}
                    onChange={(e) => setSettings(prev => ({ ...prev, trustDurationDays: parseInt(e.target.value) || 30 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    min="1"
                    max="365"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Trusted Devices per User
                  </label>
                  <input
                    type="number"
                    value={settings.maxTrustedDevices}
                    onChange={(e) => setSettings(prev => ({ ...prev, maxTrustedDevices: parseInt(e.target.value) || 5 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    min="1"
                    max="20"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.requireIpValidation}
                      onChange={(e) => setSettings(prev => ({ ...prev, requireIpValidation: e.target.checked }))}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Require IP validation</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.allowAdminRevoke}
                      onChange={(e) => setSettings(prev => ({ ...prev, allowAdminRevoke: e.target.checked }))}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Allow admin to revoke devices</span>
                  </label>
                  
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.notifyNewDevice}
                      onChange={(e) => setSettings(prev => ({ ...prev, notifyNewDevice: e.target.checked }))}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Notify on new device trust</span>
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateSettings}
                  disabled={updatingSettings}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {updatingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
