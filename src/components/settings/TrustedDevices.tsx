import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  MapPin,
  Wifi,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TrustedDevice } from '../../types';
import { 
  getUserTrustedDevices, 
  revokeTrustedDevice, 
  generateDeviceFingerprint,
  isDeviceTrusted 
} from '../../services/trustedDeviceService';
import { useAuthStore } from '../../store/authStore';
import { formatDistanceToNow } from 'date-fns';

interface TrustedDevicesProps {
  onClose?: () => void;
}

export function TrustedDevices({ onClose }: TrustedDevicesProps) {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});

  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      loadTrustedDevices();
    }
  }, [user]);

  const loadTrustedDevices = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userDevices = await getUserTrustedDevices(user.id);
      setDevices(userDevices);
    } catch (error) {
      console.error('Error loading trusted devices:', error);
      toast.error('Failed to load trusted devices');
    } finally {
      setLoading(false);
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

  const isCurrentDevice = (device: TrustedDevice) => {
    try {
      const currentFingerprint = generateDeviceFingerprint();
      return device.deviceId === currentFingerprint.deviceId;
    } catch {
      return false;
    }
  };

  const toggleDetails = (deviceId: string) => {
    setShowDetails(prev => ({
      ...prev,
      [deviceId]: !prev[deviceId]
    }));
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
            Trusted Devices
          </h2>
          <p className="text-gray-600 mt-1">
            Manage devices that can access your account without re-authentication
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">Total Devices</p>
              <p className="text-2xl font-bold text-blue-600">{devices.length}</p>
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
              <p className="text-2xl font-bold text-green-600">
                {devices.filter(d => d.isActive && new Date() < d.expiresAt).length}
              </p>
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
              <p className="text-2xl font-bold text-orange-600">
                {devices.filter(d => new Date() > d.expiresAt).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Devices List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Your Trusted Devices</h3>
        
        {devices.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No trusted devices</h3>
            <p className="text-gray-600">
              When you check "Trust this device" during login, your devices will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device);
              const isCurrent = isCurrentDevice(device);
              const isExpired = new Date() > device.expiresAt;
              const showDetail = showDetails[device.id];
              
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
                          {isCurrent && (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                              Current Device
                            </span>
                          )}
                          {isExpired && (
                            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                              Expired
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Last seen {formatDistanceToNow(device.lastSeen, { addSuffix: true })}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {device.location.city || device.location.ipAddress}
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
                      
                      {!isCurrent && (
                        <button
                          onClick={() => handleRevokeDevice(device.id)}
                          disabled={revokingId === device.id}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600 disabled:opacity-50"
                          title="Revoke access"
                        >
                          {revokingId === device.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
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
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-900">Security Notice</h4>
            <p className="text-sm text-amber-700 mt-1">
              Trusted devices can access your account without re-authentication. 
              If you suspect unauthorized access, revoke all trusted devices and change your password.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
