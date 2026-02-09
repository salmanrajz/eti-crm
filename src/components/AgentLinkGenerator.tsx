/**
 * ===============================================================================
 * AGENT LINK GENERATOR COMPONENT
 * ===============================================================================
 * 
 * Allows agents to generate unique customer portal links with group-based
 * number filtering. Customers can use these links to search numbers, select
 * plans, and submit lead information.
 * 
 * ===============================================================================
 */

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, addDoc, query, where, getDocs, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AgentLink } from '../types';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Copy, Trash2, Check, X, Settings, ExternalLink, Key, Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';

interface AgentLinkGeneratorProps {
  agentId: string;
  agentName: string;
}

interface LinkItemProps {
  link: AgentLink;
  onCopyLink: (linkId: string) => void;
  onToggleActive: (link: AgentLink) => void;
  onDelete: (linkId: string) => void;
  onGenerateNewOTP: (linkId: string) => void;
  copiedLinkId: string | null;
  generatingOTPFor: string | null;
  newlyGeneratedOTPFor: string | null;
  otpValidityHours: number | null;
  useCustomDate?: boolean;
  customExpiryDate?: string;
}

function LinkItem({ link, onCopyLink, onToggleActive, onDelete, onGenerateNewOTP, copiedLinkId, generatingOTPFor, newlyGeneratedOTPFor, otpValidityHours, useCustomDate, customExpiryDate }: LinkItemProps) {
  // Automatically show OTP if it was just generated for this link
  const [showOTP, setShowOTP] = useState(newlyGeneratedOTPFor === link.id);
  const url = `${window.location.origin}/customer/${link.linkId}`;
  
  // Update showOTP when a new OTP is generated for this link
  useEffect(() => {
    if (newlyGeneratedOTPFor === link.id) {
      setShowOTP(true);
    }
  }, [newlyGeneratedOTPFor, link.id]);
  
  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-gray-600 truncate">{url}</code>
            {!link.isActive && (
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">Inactive</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 space-y-0.5">
            {link.note && (
              <div className="text-sm font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded mb-1">
                📝 {link.note}
              </div>
            )}
            <div>
              Groups: {link.allowedGroups.join(', ')}
            </div>
            {link.allowedCategories && link.allowedCategories.length > 0 && (
              <div>
                Categories: {link.allowedCategories.join(', ')}
              </div>
            )}
            {link.trustedCustomers && (
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Trusted Customers</span>
              </div>
            )}
            <div>
              Used: {link.usageCount || 0} times • Created: {format(link.createdAt, 'MMM d, yyyy')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => onCopyLink(link.linkId)}
            className="p-2 hover:bg-emerald-100 rounded-lg transition-colors"
            title="Copy link"
          >
            {copiedLinkId === link.linkId ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <button
            onClick={() => onToggleActive(link)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title={link.isActive ? 'Deactivate' : 'Activate'}
          >
            <Settings className={`w-4 h-4 ${link.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
          </button>
          <button
            onClick={() => onDelete(link.id)}
            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
            title="Delete link"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </div>
      {link.otp && (
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-gray-700">OTP:</span>
              {showOTP ? (
                <span className="text-sm font-mono font-bold text-emerald-600">
                  {link.otp}
                </span>
              ) : (
                <span className="text-sm font-mono text-gray-400">••••••</span>
              )}
              {link.otpExpiresAt && (
                <span className="text-xs text-gray-500">
                  (Expires: {format(new Date(link.otpExpiresAt), 'MMM d, h:mm a')})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowOTP(!showOTP)}
                className="p-1.5 hover:bg-emerald-100 rounded transition-colors"
                title={showOTP ? 'Hide OTP' : 'Show OTP'}
              >
                {showOTP ? (
                  <EyeOff className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-gray-600" />
                )}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(link.otp!);
                  toast.success('OTP copied!');
                }}
                className="p-1.5 hover:bg-emerald-100 rounded transition-colors"
                title="Copy OTP"
              >
                <Copy className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          </div>
          <motion.button
            onClick={() => onGenerateNewOTP(link.id)}
            disabled={generatingOTPFor === link.id}
            whileHover={{ scale: generatingOTPFor === link.id ? 1 : 1.02 }}
            whileTap={{ scale: generatingOTPFor === link.id ? 1 : 0.98 }}
            className={`w-full px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
              generatingOTPFor === link.id
                ? 'bg-emerald-400 text-white cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm hover:shadow-md'
            }`}
            title={
              useCustomDate && customExpiryDate 
                ? `Generate new OTP (valid until ${new Date(customExpiryDate).toLocaleDateString()})` 
                : otpValidityHours 
                  ? `Generate new OTP (valid for ${otpValidityHours} hours)` 
                  : 'Generate new OTP'
            }
          >
            {generatingOTPFor === link.id ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
            <Key className="w-3 h-3" />
                <span>Generate New OTP</span>
              </>
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}

export function AgentLinkGenerator({ agentId, agentName }: AgentLinkGeneratorProps) {
  const { user } = useAuthStore();
  const [showDialog, setShowDialog] = useState(false);
  const [links, setLinks] = useState<AgentLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [generatingOTPFor, setGeneratingOTPFor] = useState<string | null>(null);
  const [newlyGeneratedOTPFor, setNewlyGeneratedOTPFor] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [duplicateLink, setDuplicateLink] = useState<AgentLink | null>(null);
  const [newlyGeneratedLinkId, setNewlyGeneratedLinkId] = useState<string | null>(null);

  // Available number categories for customer portal (same across groups)
  const allCategories = [
    'Standard',
    'Silver',
    'Silver Plus',
    'Gold',
    'Gold Plus',
    'Platinum'
  ] as const;

  // Get available groups based on agent's allowedGroups
  const availableGroups = useMemo(() => {
    const allGroups = ['G1', 'G2', 'G3'];
    // If agent has allowedGroups, only show those groups
    if (user?.role === 'agent' && user?.allowedGroups && user.allowedGroups.length > 0) {
      return allGroups.filter(group => user.allowedGroups!.includes(group));
    }
    // If no restrictions, show all groups
    return allGroups;
  }, [user?.role, user?.allowedGroups]);

  // Initialize selectedGroups with agent's allowed groups (or first available group)
  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    if (user?.role === 'agent' && user?.allowedGroups && user.allowedGroups.length > 0) {
      return [...user.allowedGroups];
    }
    return availableGroups.length > 0 ? [availableGroups[0]] : [];
  });

  // Category selection for the link (what customer can see)
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    // Default: all categories enabled so existing behavior is preserved
    return [...allCategories];
  });

  // OTP validity selection (2 hours, 6 hours, or custom date for admins)
  const [otpValidityHours, setOtpValidityHours] = useState<number | null>(2);
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');
  const [useCustomDate, setUseCustomDate] = useState(false);
  
  // Note field for tracking who the link is for
  const [linkNote, setLinkNote] = useState<string>('');
  // Trusted customers: after OTP, show open numbers directly
  const [trustedCustomers, setTrustedCustomers] = useState(false);

  // Update selectedGroups when availableGroups changes
  useEffect(() => {
    if (user?.role === 'agent' && user?.allowedGroups && user.allowedGroups.length > 0) {
      // Filter selectedGroups to only include allowed groups
      const validGroups = selectedGroups.filter(group => user.allowedGroups!.includes(group));
      if (validGroups.length !== selectedGroups.length) {
        setSelectedGroups(validGroups.length > 0 ? validGroups : [...user.allowedGroups]);
      }
    }
  }, [user?.allowedGroups, availableGroups]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    loadLinks();
  }, [agentId]);

  const loadLinks = async () => {
    try {
      const q = query(
        collection(db, 'agentLinks'),
        where('agentId', '==', agentId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const linksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        expiresAt: doc.data().expiresAt?.toDate() || undefined,
        otpExpiresAt: doc.data().otpExpiresAt?.toDate() || undefined,
        lastUsedAt: doc.data().lastUsedAt?.toDate() || undefined,
      })) as AgentLink[];
      setLinks(linksData);
      return linksData;
    } catch (error) {
      console.error('Error loading links:', error);
      toast.error('Failed to load links');
      return [];
    }
  };

  const generateLinkId = () => {
    // Generate a unique 8-character alphanumeric ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const generateOTP = () => {
    // Generate a 6-digit numeric OTP
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleGenerateLink = async () => {
    if (selectedGroups.length === 0) {
      toast.error('Please select at least one group');
      return;
    }

    if (selectedCategories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }

    if (useCustomDate && !customExpiryDate) {
      toast.error('Please select an expiration date');
      return;
    }

    // Check if a link with the same parameters already exists
    const existingLink = links.find(link => {
      // Compare groups (order doesn't matter)
      const linkGroups = [...(link.allowedGroups || [])].sort().join(',');
      const selectedGroupsSorted = [...selectedGroups].sort().join(',');
      
      // Compare categories (order doesn't matter)
      const linkCategories = [...(link.allowedCategories || [])].sort().join(',');
      const selectedCategoriesSorted = [...selectedCategories].sort().join(',');
      
      // Compare trusted customers
      if ((link.trustedCustomers || false) !== trustedCustomers) {
        return false;
      }
      
      // Groups and categories must match
      if (linkGroups !== selectedGroupsSorted || linkCategories !== selectedCategoriesSorted) {
        return false;
      }
      
      // Compare OTP validity periods by calculating the duration
      // Get the selected OTP validity hours
      let selectedOtpHours: number | null = null;
      if (useCustomDate && customExpiryDate) {
        // For custom date, calculate hours from now to the custom date
        const customDate = new Date(customExpiryDate);
        customDate.setHours(23, 59, 59, 999);
        const hoursUntilCustom = Math.round((customDate.getTime() - Date.now()) / (1000 * 60 * 60));
        selectedOtpHours = hoursUntilCustom;
      } else if (otpValidityHours && typeof otpValidityHours === 'number') {
        selectedOtpHours = otpValidityHours;
      }
      
      // Calculate the existing link's OTP validity hours
      let existingOtpHours: number | null = null;
      if (link.otpExpiresAt) {
        const expiresAt = new Date(link.otpExpiresAt);
        const createdAt = link.createdAt ? new Date(link.createdAt) : new Date();
        existingOtpHours = Math.round((expiresAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      }
      
      // If OTP validity is different, allow new link
      if (selectedOtpHours !== existingOtpHours) {
        return false;
      }
      
      // All parameters match - this is a duplicate
      return true;
    });

    if (existingLink) {
      setDuplicateLink(existingLink);
      return;
    }

    setLoading(true);
    try {
      const linkId = generateLinkId();
      const otp = generateOTP();
      // Set OTP expiration based on selected validity
      let otpExpiresAt: Date | null = null;
      if (useCustomDate && customExpiryDate) {
        // Use custom date selected by admin
        const selectedDate = new Date(customExpiryDate);
        // Set to end of day (23:59:59)
        selectedDate.setHours(23, 59, 59, 999);
        otpExpiresAt = selectedDate;
      } else if (otpValidityHours && typeof otpValidityHours === 'number') {
        // Use hours (2, 6 hours, or 30 days = 720 hours)
        if (otpValidityHours === 30 * 24) {
          // 1 month = 30 days, set to end of day
          const expiryDate = new Date(Date.now() + otpValidityHours * 60 * 60 * 1000);
          expiryDate.setHours(23, 59, 59, 999);
          otpExpiresAt = expiryDate;
        } else {
          // 2 or 6 hours
          otpExpiresAt = new Date(Date.now() + otpValidityHours * 60 * 60 * 1000);
        }
      }
      
      const linkData: any = {
        agentId,
        agentName,
        linkId,
        allowedGroups: selectedGroups,
        allowedCategories: selectedCategories,
        isActive: true,
        otp,
        otpExpiresAt: otpExpiresAt || null,
        trustedCustomers: trustedCustomers,
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
      };
      
      // Only add note if it's not empty
      if (linkNote.trim()) {
        linkData.note = linkNote.trim();
      }

      const docRef = await addDoc(collection(db, 'agentLinks'), linkData);
      setLinkNote(''); // Reset note after generating
      setUseCustomDate(false); // Reset custom date
      setCustomExpiryDate(''); // Reset custom date value
      setOtpValidityHours(2); // Reset to default
      setNewlyGeneratedLinkId(docRef.id); // Store the new link ID for success popup
      setTrustedCustomers(false); // Reset after generating
      await loadLinks();
      // Scroll to the newly generated link after a short delay
      setTimeout(() => {
        const linkElement = document.getElementById(`link-${docRef.id}`);
        if (linkElement) {
          linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight the link briefly
          linkElement.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'rounded-lg');
          setTimeout(() => {
            linkElement.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2');
          }, 3000);
        }
      }, 200);
    } catch (error) {
      console.error('Error generating link:', error);
      toast.error('Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNewOTP = async (linkId: string) => {
    setGeneratingOTPFor(linkId);
    try {
      const newOTP = generateOTP();
      // Set OTP expiration based on selected validity
      let otpExpiresAt: Date | null = null;
      if (useCustomDate && customExpiryDate) {
        // Use custom date selected by admin
        const selectedDate = new Date(customExpiryDate);
        selectedDate.setHours(23, 59, 59, 999);
        otpExpiresAt = selectedDate;
      } else if (otpValidityHours && typeof otpValidityHours === 'number') {
        // Use hours (2 or 6 hours)
        otpExpiresAt = new Date(Date.now() + otpValidityHours * 60 * 60 * 1000);
      }
      
      await updateDoc(doc(db, 'agentLinks', linkId), {
        otp: newOTP,
        otpExpiresAt: otpExpiresAt || null,
        updatedAt: new Date(),
      });
      toast.success('New OTP generated successfully!');
      // Mark this link as having a newly generated OTP so it shows automatically
      setNewlyGeneratedOTPFor(linkId);
      await loadLinks();
      // Keep the OTP visible - user can manually hide it if needed
      // The flag will be cleared when component unmounts or when a new OTP is generated for a different link
    } catch (error) {
      console.error('Error generating new OTP:', error);
      toast.error('Failed to generate new OTP');
    } finally {
      setGeneratingOTPFor(null);
    }
  };

  const copyToClipboard = (linkId: string) => {
    const url = `${window.location.origin}/customer/${linkId}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(linkId);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const toggleLinkActive = async (link: AgentLink) => {
    try {
      await updateDoc(doc(db, 'agentLinks', link.id), {
        isActive: !link.isActive,
        updatedAt: new Date(),
      });
      toast.success(`Link ${link.isActive ? 'deactivated' : 'activated'}`);
      loadLinks();
    } catch (error) {
      console.error('Error toggling link:', error);
      toast.error('Failed to update link');
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return;

    try {
      await deleteDoc(doc(db, 'agentLinks', linkId));
      toast.success('Link deleted');
      loadLinks();
    } catch (error) {
      console.error('Error deleting link:', error);
      toast.error('Failed to delete link');
    }
  };

  const toggleGroup = (group: string) => {
    // Only allow toggling groups that are in availableGroups
    if (!availableGroups.includes(group)) {
      return;
    }
    setSelectedGroups(prev =>
      prev.includes(group)
        ? prev.filter(g => g !== group)
        : [...prev, group]
    );
  };

  return (
    <>
      {/* Generate Link Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowDialog(true)}
        className="inline-flex items-center justify-center px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-sm border border-emerald-100/50 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-xl hover:shadow-emerald-500/20 transition-all duration-300 group"
      >
        <div className="flex items-center">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-1.5 rounded-lg mr-2 group-hover:scale-110 transition-transform duration-300">
            <Link2 className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          </div>
          <div className="text-left">
            <span className="block text-xs font-semibold text-gray-900">Customer Link</span>
            <span className="hidden sm:block text-[10px] text-gray-600">Generate portal link</span>
          </div>
        </div>
      </motion.button>

      {/* Dialog - Rendered via Portal to ensure it's above everything */}
      {isMounted && typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {showDialog && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 10000 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto relative"
                style={{ zIndex: 10001 }}
            >
              <div className="sticky top-0 bg-gradient-to-r from-emerald-500 to-teal-600 p-3 sm:p-4 md:p-6 rounded-t-xl sm:rounded-t-2xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-white">Generate Customer Portal Link</h2>
                    <p className="text-emerald-50 mt-0.5 sm:mt-1 text-xs sm:text-sm hidden sm:block">Share this link with customers to let them select numbers and plans</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowDialog(false);
                      setLinkNote(''); // Reset note when closing
                      setUseCustomDate(false); // Reset custom date
                      setCustomExpiryDate(''); // Reset custom date value
                      setOtpValidityHours(2); // Reset to default
                      setTrustedCustomers(false); // Reset trusted customers
                    }}
                    className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
                {/* Warning Banner */}
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-amber-900 mb-0.5 sm:mb-1">Security Warning</h4>
                      <p className="text-xs sm:text-sm text-amber-800 leading-tight">
                        <strong>Share this link only with trusted customers.</strong> This link provides access to number selection and lead submission. Keep it confidential and do not share publicly.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Group Selection */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
                    Select Number Groups to Show
                  </label>
                  {availableGroups.length === 0 ? (
                    <div className="p-2.5 sm:p-3 md:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs sm:text-sm text-yellow-700">
                        No groups available. Please contact your administrator to assign group access.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                        {availableGroups.map(group => (
                          <motion.button
                            key={group}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleGroup(group)}
                            className={`p-2.5 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border-2 transition-all ${
                              selectedGroups.includes(group)
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-lg'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                            }`}
                          >
                            <div className="font-bold text-base sm:text-lg">{group}</div>
                            {selectedGroups.includes(group) && (
                              <Check className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 sm:mt-1 mx-auto" />
                            )}
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">
                        Only numbers from selected groups will be visible to customers
                      </p>
                    </>
                  )}
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
                    Select Number Categories to Show
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                    {allCategories.map(category => {
                      const isSelected = selectedCategories.includes(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => {
                            setSelectedCategories(prev =>
                              prev.includes(category)
                                ? prev.filter(c => c !== category)
                                : [...prev, category]
                            );
                          }}
                          className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border text-xs sm:text-sm font-medium transition-all ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">
                    Customers will only see numbers from the selected categories within the chosen groups.
                  </p>
                </div>

                {/* OTP Validity Selection */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
                    OTP Validity Period
                  </label>
                  <div className={`grid gap-2 sm:gap-3 ${user?.role === 'admin' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setOtpValidityHours(2);
                        setUseCustomDate(false);
                      }}
                      className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl border-2 transition-all ${
                        otpValidityHours === 2 && !useCustomDate
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-lg'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="font-bold text-sm sm:text-base md:text-lg">2 Hours</div>
                      <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 opacity-90">Standard</div>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setOtpValidityHours(6);
                        setUseCustomDate(false);
                      }}
                      className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl border-2 transition-all ${
                        otpValidityHours === 6 && !useCustomDate
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-lg'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="font-bold text-sm sm:text-base md:text-lg">6 Hours</div>
                      <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 opacity-90">Extended</div>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setOtpValidityHours(30 * 24); // 30 days = 720 hours
                        setUseCustomDate(false);
                      }}
                      className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl border-2 transition-all ${
                        otpValidityHours === 30 * 24 && !useCustomDate
                          ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-600 shadow-lg'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="font-bold text-sm sm:text-base md:text-lg">1 Month</div>
                      <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 opacity-90">Long-term</div>
                    </motion.button>
                    {user?.role === 'admin' && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setUseCustomDate(true);
                          setOtpValidityHours(null);
                        }}
                        className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl border-2 transition-all ${
                          useCustomDate
                            ? 'bg-gradient-to-br from-purple-500 to-pink-600 text-white border-purple-600 shadow-lg'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        <div className="font-bold text-sm sm:text-base md:text-lg">Custom Date</div>
                        <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 opacity-90">Admin Only</div>
                      </motion.button>
                    )}
                  </div>
                  {user?.role === 'admin' && useCustomDate && (
                    <div className="mt-2 sm:mt-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">
                        Select Expiration Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={customExpiryDate}
                        onChange={(e) => {
                          setCustomExpiryDate(e.target.value);
                        }}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-white border-2 border-purple-200 rounded-lg sm:rounded-xl focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all text-xs sm:text-sm text-gray-900"
                        required={useCustomDate}
                      />
                      {customExpiryDate && (
                        <p className="text-[10px] sm:text-xs text-purple-600 mt-1">
                          OTP will expire on: {new Date(customExpiryDate).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  {otpValidityHours === 30 * 24 && !useCustomDate && (
                    <div className="mt-2 sm:mt-3 bg-amber-50 border-2 border-amber-300 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3">
                      <div className="flex items-start gap-1.5 sm:gap-2">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-amber-900 mb-0.5 sm:mb-1">Warning: Long-term OTP</p>
                          <p className="text-[10px] sm:text-xs text-amber-800 leading-tight">
                            This OTP will remain valid for 1 month. <strong>Only share with trusted customers.</strong> Ensure you have proper security measures in place.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">
                    Choose how long the OTP will remain valid for customer access
                    {user?.role === 'admin' && <span className="hidden sm:inline"> (Admins can select a custom expiration date)</span>}
                  </p>
                </div>

                {/* Trusted Customers Checkbox */}
                <div className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/50">
                  <input
                    type="checkbox"
                    id="trustedCustomers"
                    checked={trustedCustomers}
                    onChange={(e) => setTrustedCustomers(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="trustedCustomers" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 font-semibold text-gray-800">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      Trusted Customers
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      After OTP, show open numbers directly.
                    </p>
                  </label>
                </div>

                {/* Note Field */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
                    Note (Optional)
                  </label>
                  <textarea
                    value={linkNote}
                    onChange={(e) => setLinkNote(e.target.value)}
                    placeholder="e.g., Link for Mohammad - Dubai customer"
                    className="w-full px-2.5 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition-all duration-200 text-xs sm:text-sm text-gray-900 placeholder-gray-500 resize-none"
                    rows={2}
                    maxLength={200}
                  />
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">
                    Add a note to track who this link is for (e.g., customer name, company, etc.)
                  </p>
                </div>

                {/* Generate Button */}
                <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4 border-t">
                    <button
                      onClick={() => {
                        setShowDialog(false);
                        setLinkNote(''); // Reset note when closing
                        setUseCustomDate(false); // Reset custom date
                        setCustomExpiryDate(''); // Reset custom date value
                        setOtpValidityHours(2); // Reset to default
                      }}
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 bg-gray-100 text-gray-700 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-colors text-xs sm:text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerateLink}
                      disabled={loading || selectedGroups.length === 0}
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg sm:rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                      {loading ? 'Generating...' : links.length > 0 ? 'Generate New Link' : 'Generate Link'}
                    </button>
                </div>

                {/* Existing Links */}
                {links.length > 0 && (
                  <div className="pt-3 sm:pt-4 border-t">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Your Links</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {links.map(link => (
                        <div key={link.id} id={`link-${link.id}`} className="transition-all duration-300">
                          <LinkItem
                            link={link}
                          onCopyLink={copyToClipboard}
                          onToggleActive={toggleLinkActive}
                          onDelete={handleDeleteLink}
                          onGenerateNewOTP={handleGenerateNewOTP}
                          copiedLinkId={copiedLinkId}
                          generatingOTPFor={generatingOTPFor}
                          newlyGeneratedOTPFor={newlyGeneratedOTPFor}
                          otpValidityHours={otpValidityHours}
                          useCustomDate={useCustomDate}
                          customExpiryDate={customExpiryDate}
                        />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* Duplicate Link Modal */}
      {isMounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {duplicateLink && (
            <div className="fixed inset-0 z-[10002] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 10002 }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto relative"
                style={{ zIndex: 10003 }}
              >
                <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-600 p-3 sm:p-4 md:p-6 rounded-t-xl sm:rounded-t-2xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base sm:text-lg md:text-xl font-bold text-white">Link Already Exists</h2>
                      <p className="text-amber-50 mt-0.5 sm:mt-1 text-xs sm:text-sm">You already have a link with these parameters</p>
                    </div>
                    <button
                      onClick={() => setDuplicateLink(null)}
                      className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </button>
                  </div>
                </div>

                <div className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
                  <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div>
                      <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                        Portal Link
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200 text-xs sm:text-sm font-mono text-gray-800 break-all">
                          {`${window.location.origin}/customer/${duplicateLink.linkId}`}
                        </code>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/customer/${duplicateLink.linkId}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link copied!');
                          }}
                          className="p-1.5 sm:p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex-shrink-0"
                          title="Copy link"
                        >
                          <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                        Groups
                      </label>
                      <p className="text-xs sm:text-sm text-gray-900 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200">
                        {duplicateLink.allowedGroups.join(', ')}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                        Categories
                      </label>
                      <p className="text-xs sm:text-sm text-gray-900 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200">
                        {duplicateLink.allowedCategories && duplicateLink.allowedCategories.length > 0
                          ? duplicateLink.allowedCategories.join(', ')
                          : 'All categories'}
                      </p>
                    </div>

                    {duplicateLink.note && (
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                          Note
                        </label>
                        <p className="text-xs sm:text-sm text-gray-900 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200">
                          {duplicateLink.note}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                          Used
                        </label>
                        <p className="text-xs sm:text-sm text-gray-900 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200">
                          {duplicateLink.usageCount || 0} times
                        </p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                          Created
                        </label>
                        <p className="text-xs sm:text-sm text-gray-900 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200">
                          {format(duplicateLink.createdAt, 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>

                    {duplicateLink.otpExpiresAt && (
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                          OTP Expires
                        </label>
                        <p className="text-xs sm:text-sm text-gray-900 bg-white px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-200">
                          {format(duplicateLink.otpExpiresAt, 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium ${
                        duplicateLink.isActive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {duplicateLink.isActive ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:gap-3 pt-2 border-t">
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/customer/${duplicateLink.linkId}`;
                        navigator.clipboard.writeText(url);
                        toast.success('Link copied!');
                      }}
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg sm:rounded-xl transition-colors text-xs sm:text-sm font-medium"
                    >
                      Copy Link
                    </button>
                    <button
                      onClick={() => setDuplicateLink(null)}
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg sm:rounded-xl hover:bg-gray-200 transition-colors text-xs sm:text-sm font-medium"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Success Modal */}
      {isMounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {newlyGeneratedLinkId && (
            <div className="fixed inset-0 z-[10004] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 10004 }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-lg w-full relative"
                style={{ zIndex: 10005 }}
              >
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-3 sm:p-4 md:p-6 rounded-t-xl sm:rounded-t-2xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                        <Check className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-base sm:text-lg md:text-xl font-bold text-white">Link Generated Successfully!</h2>
                        <p className="text-emerald-50 mt-0.5 text-xs sm:text-sm">Your new link has been created</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setNewlyGeneratedLinkId(null)}
                      className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </button>
                  </div>
                </div>

                <div className="p-3 sm:p-4 md:p-6">
                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center">
                    <p className="text-xs sm:text-sm text-emerald-800 mb-2">
                      Your link has been added to the "Your Links" section below.
                    </p>
                    <p className="text-[10px] sm:text-xs text-emerald-700">
                      Scroll down to view and manage your link.
                    </p>
                  </div>

                  <button
                    onClick={() => setNewlyGeneratedLinkId(null)}
                    className="w-full mt-3 sm:mt-4 px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg sm:rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all text-xs sm:text-sm font-medium shadow-lg"
                  >
                    Got it
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

