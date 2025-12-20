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
import { collection, addDoc, query, where, getDocs, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AgentLink } from '../types';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Copy, Trash2, Check, X, Settings, ExternalLink, Key, Eye, EyeOff } from 'lucide-react';
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
}

function LinkItem({ link, onCopyLink, onToggleActive, onDelete, onGenerateNewOTP, copiedLinkId }: LinkItemProps) {
  const [showOTP, setShowOTP] = useState(false);
  const url = `${window.location.origin}/customer/${link.linkId}`;
  
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
          <div className="text-xs text-gray-500 mt-1">
            Groups: {link.allowedGroups.join(', ')} • 
            Used: {link.usageCount || 0} times • 
            Created: {format(link.createdAt, 'MMM d, yyyy')}
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
          <button
            onClick={() => onGenerateNewOTP(link.id)}
            className="w-full px-3 py-1.5 text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
            title="Generate new OTP (valid for 30 minutes)"
          >
            <Key className="w-3 h-3" />
            Generate New OTP
          </button>
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
  const [generatedOTP, setGeneratedOTP] = useState<string | null>(null);
  const [newLinkId, setNewLinkId] = useState<string | null>(null);

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
    } catch (error) {
      console.error('Error loading links:', error);
      toast.error('Failed to load links');
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

    setLoading(true);
    try {
      const linkId = generateLinkId();
      const otp = generateOTP();
      // Set OTP expiration to 30 minutes from now
      const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const linkData = {
        agentId,
        agentName,
        linkId,
        allowedGroups: selectedGroups,
        isActive: true,
        otp,
        otpExpiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
      };

      await addDoc(collection(db, 'agentLinks'), linkData);
      setGeneratedOTP(otp);
      setNewLinkId(linkId);
      toast.success('Link generated successfully!');
      loadLinks();
    } catch (error) {
      console.error('Error generating link:', error);
      toast.error('Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNewOTP = async (linkId: string) => {
    try {
      const newOTP = generateOTP();
      // Set OTP expiration to 30 minutes from now
      const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await updateDoc(doc(db, 'agentLinks', linkId), {
        otp: newOTP,
        otpExpiresAt,
        updatedAt: new Date(),
      });
      toast.success('New OTP generated successfully!');
      loadLinks();
    } catch (error) {
      console.error('Error generating new OTP:', error);
      toast.error('Failed to generate new OTP');
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

      {/* Dialog */}
      <AnimatePresence>
        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-emerald-500 to-teal-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Generate Customer Portal Link</h2>
                    <p className="text-emerald-50 mt-1">Share this link with customers to let them select numbers and plans</p>
                  </div>
                  <button
                    onClick={() => setShowDialog(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Group Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Select Number Groups to Show
                  </label>
                  {availableGroups.length === 0 ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-700">
                        No groups available. Please contact your administrator to assign group access.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {availableGroups.map(group => (
                          <motion.button
                            key={group}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleGroup(group)}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              selectedGroups.includes(group)
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-600 shadow-lg'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                            }`}
                          >
                            <div className="font-bold text-lg">{group}</div>
                            {selectedGroups.includes(group) && (
                              <Check className="w-5 h-5 mt-1 mx-auto" />
                            )}
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Only numbers from selected groups will be visible to customers
                      </p>
                    </>
                  )}
                </div>

                {/* Existing Links */}
                {links.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Your Links</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {links.map(link => (
                        <LinkItem
                          key={link.id}
                          link={link}
                          onCopyLink={copyToClipboard}
                          onToggleActive={toggleLinkActive}
                          onDelete={handleDeleteLink}
                          onGenerateNewOTP={handleGenerateNewOTP}
                          copiedLinkId={copiedLinkId}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Generated Link & OTP Display */}
                {generatedOTP && newLinkId && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200 p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Link Generated Successfully!</h3>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                          Portal Link
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-white px-4 py-3 rounded-lg border border-emerald-200 text-sm font-mono text-gray-800 break-all">
                            {`${window.location.origin}/customer/${newLinkId}`}
                          </code>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/customer/${newLinkId}`;
                              navigator.clipboard.writeText(url);
                              toast.success('Link copied!');
                            }}
                            className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                            title="Copy link"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
                          Access OTP (Share with Customer)
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white px-4 py-3 rounded-lg border-2 border-emerald-300">
                            <span className="text-2xl font-black text-emerald-600 tracking-wider font-mono">
                              {generatedOTP}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(generatedOTP);
                              toast.success('OTP copied!');
                            }}
                            className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                            title="Copy OTP"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          ⚠️ Important: Share this OTP with your customer. They will need it to access the portal.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setGeneratedOTP(null);
                        setNewLinkId(null);
                        setShowDialog(false);
                      }}
                      className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all font-medium shadow-lg"
                    >
                      Done
                    </button>
                  </motion.div>
                )}

                {/* Generate Button */}
                {!generatedOTP && (
                  <div className="flex gap-3 pt-4 border-t">
                    <button
                      onClick={() => setShowDialog(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerateLink}
                      disabled={loading || selectedGroups.length === 0}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                      {loading ? 'Generating...' : 'Generate Link'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

