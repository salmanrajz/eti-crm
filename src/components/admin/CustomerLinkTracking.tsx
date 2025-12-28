/**
 * ===============================================================================
 * CUSTOMER LINK TRACKING COMPONENT - ADMIN TOOL
 * ===============================================================================
 * 
 * This component provides comprehensive tracking and analytics for customer
 * portal links. It displays detailed information about link generation, usage,
 * submissions, and all related activities.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE STATISTICS
 *    - Total links created
 *    - Total submissions received
 *    - Active vs inactive links
 *    - Links with OTP vs without
 *    - Average submissions per link
 * 
 * 2. DETAILED LINK INFORMATION
 *    - Link creator (agent name and ID)
 *    - Creation date and time
 *    - Last used date and time
 *    - Usage count (number of times opened)
 *    - OTP status and expiration
 *    - Allowed groups
 *    - Link status (active/inactive)
 * 
 * 3. SUBMISSION TRACKING
 *    - Submissions per link
 *    - Submission status
 *    - Submission dates
 *    - Customer information
 * 
 * 4. ACTIVITY LOGS
 *    - Link creation events
 *    - OTP generation/regeneration
 *    - Link activation/deactivation
 *    - Link access events
 *    - Submission events
 * 
 * 5. EXPORT FUNCTIONALITY
 *    - Export link data to CSV
 *    - Export submission data to CSV
 *    - Export activity logs
 * 
 * USAGE:
 * This component is accessible from the Admin Dashboard and provides
 * comprehensive insights into customer portal link usage and performance.
 * ===============================================================================
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, where, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AgentLink } from '../../types';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { 
  Link2, 
  Users, 
  Activity, 
  TrendingUp, 
  Eye, 
  Download,
  RefreshCw,
  Calendar,
  Key,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  BarChart3,
  Filter,
  Search,
  X,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';

interface CustomerLinkTrackingProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LinkStats {
  totalLinks: number;
  activeLinks: number;
  inactiveLinks: number;
  linksWithOTP: number;
  linksWithoutOTP: number;
  totalSubmissions: number;
  totalUsageCount: number;
  averageSubmissionsPerLink: number;
  averageUsagePerLink: number;
}

interface LinkWithDetails extends AgentLink {
  submissionsCount: number;
  submissions: any[];
  agentDetails?: {
    name: string;
    teamName?: string;
  };
}

export function CustomerLinkTracking({ isOpen, onClose }: CustomerLinkTrackingProps) {
  const [links, setLinks] = useState<LinkWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<LinkStats>({
    totalLinks: 0,
    activeLinks: 0,
    inactiveLinks: 0,
    linksWithOTP: 0,
    linksWithoutOTP: 0,
    totalSubmissions: 0,
    totalUsageCount: 0,
    averageSubmissionsPerLink: 0,
    averageUsagePerLink: 0
  });
  const [selectedLink, setSelectedLink] = useState<LinkWithDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'usageCount' | 'lastUsedAt' | 'agentName'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Load all links and submissions (optimized with batch queries)
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Step 1: Load all agent links in parallel with all submissions
      const [linksSnapshot, allSubmissionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'agentLinks'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'customerPortalSubmissions'), orderBy('submittedAt', 'desc')))
      ]);
      
      // Step 2: Group submissions by linkId for O(1) lookup
      const submissionsByLinkId = new Map<string, any[]>();
      allSubmissionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const linkId = data.linkId;
        if (linkId) {
          if (!submissionsByLinkId.has(linkId)) {
            submissionsByLinkId.set(linkId, []);
          }
          submissionsByLinkId.get(linkId)!.push({
            id: doc.id,
            ...data,
            submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : data.submittedAt,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
          });
        }
      });
      
      // Step 3: Collect unique agent IDs and team IDs
      const uniqueAgentIds = new Set<string>();
      const uniqueTeamIds = new Set<string>();
      const agentIdToTeamId = new Map<string, string>();
      
      linksSnapshot.docs.forEach(linkDoc => {
        const linkData = linkDoc.data();
        if (linkData.agentId) {
          uniqueAgentIds.add(linkData.agentId);
        }
      });
      
      // Step 4: Load all agents in batches (Firestore 'in' query limit is 10)
      const agentIdsArray = Array.from(uniqueAgentIds);
      const agentMap = new Map<string, any>();
      const agentPromises: Promise<void>[] = [];
      
      for (let i = 0; i < agentIdsArray.length; i += 10) {
        const batch = agentIdsArray.slice(i, i + 10);
        agentPromises.push(
          Promise.all(batch.map(agentId => getDoc(doc(db, 'users', agentId))))
            .then(agentDocs => {
              agentDocs.forEach((agentDoc, idx) => {
                if (agentDoc.exists()) {
                  const agentData = agentDoc.data();
                  agentMap.set(batch[idx], agentData);
                  if (agentData.teamId) {
                    uniqueTeamIds.add(agentData.teamId);
                    agentIdToTeamId.set(batch[idx], agentData.teamId);
                  }
                }
              });
            })
        );
      }
      
      await Promise.all(agentPromises);
      
      // Step 5: Load all teams in batches
      const teamIdsArray = Array.from(uniqueTeamIds);
      const teamMap = new Map<string, string>();
      const teamPromises: Promise<void>[] = [];
      
      for (let i = 0; i < teamIdsArray.length; i += 10) {
        const batch = teamIdsArray.slice(i, i + 10);
        teamPromises.push(
          Promise.all(batch.map(teamId => getDoc(doc(db, 'teams', teamId))))
            .then(teamDocs => {
              teamDocs.forEach((teamDoc, idx) => {
                if (teamDoc.exists()) {
                  teamMap.set(batch[idx], teamDoc.data().name || 'Unknown');
                }
              });
            })
        );
      }
      
      await Promise.all(teamPromises);
      
      // Step 6: Build links data with all information
      const linksData: LinkWithDetails[] = linksSnapshot.docs.map(linkDoc => {
        const linkData = linkDoc.data();
        const linkId = linkData.linkId;
        
        // Get submissions for this link
        const submissions = submissionsByLinkId.get(linkId) || [];
        
        // Get agent details
        let agentDetails: { name: string; teamName?: string } | undefined;
        if (linkData.agentId) {
          const agentData = agentMap.get(linkData.agentId);
          if (agentData) {
            const teamId = agentIdToTeamId.get(linkData.agentId);
            agentDetails = {
              name: agentData.name || 'Unknown',
              teamName: teamId ? (teamMap.get(teamId) || agentData.teamName) : agentData.teamName
            };
          }
        }
        
        return {
          id: linkDoc.id,
          ...linkData,
          createdAt: linkData.createdAt?.toDate ? linkData.createdAt.toDate() : linkData.createdAt,
          updatedAt: linkData.updatedAt?.toDate ? linkData.updatedAt.toDate() : linkData.updatedAt,
          otpExpiresAt: linkData.otpExpiresAt?.toDate ? linkData.otpExpiresAt.toDate() : linkData.otpExpiresAt,
          lastUsedAt: linkData.lastUsedAt?.toDate ? linkData.lastUsedAt.toDate() : linkData.lastUsedAt,
          expiresAt: linkData.expiresAt?.toDate ? linkData.expiresAt.toDate() : linkData.expiresAt,
          allowedGroups: Array.isArray(linkData.allowedGroups) ? linkData.allowedGroups : [],
          submissionsCount: submissions.length,
          submissions,
          agentDetails
        } as LinkWithDetails;
      });

      setLinks(linksData);
      calculateStats(linksData);
    } catch (error) {
      console.error('Error loading customer link data:', error);
      toast.error('Failed to load customer link data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Calculate statistics
  const calculateStats = (linksData: LinkWithDetails[]) => {
    const totalLinks = linksData.length;
    const activeLinks = linksData.filter(l => l.isActive).length;
    const inactiveLinks = totalLinks - activeLinks;
    const linksWithOTP = linksData.filter(l => l.otp).length;
    const linksWithoutOTP = totalLinks - linksWithOTP;
    const totalSubmissions = linksData.reduce((sum, l) => sum + l.submissionsCount, 0);
    const totalUsageCount = linksData.reduce((sum, l) => sum + (l.usageCount || 0), 0);
    const averageSubmissionsPerLink = totalLinks > 0 ? (totalSubmissions / totalLinks) : 0;
    const averageUsagePerLink = totalLinks > 0 ? (totalUsageCount / totalLinks) : 0;

    setStats({
      totalLinks,
      activeLinks,
      inactiveLinks,
      linksWithOTP,
      linksWithoutOTP,
      totalSubmissions,
      totalUsageCount,
      averageSubmissionsPerLink,
      averageUsagePerLink
    });
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Delete link handler
  const handleDeleteLink = async (link: LinkWithDetails) => {
    if (!window.confirm(`Are you sure you want to delete this link?\n\nLink ID: ${link.linkId || 'N/A'}\nAgent: ${link.agentDetails?.name || link.agentName || 'Unknown'}\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'agentLinks', link.id));
      toast.success('Link deleted successfully');
      
      // Remove from local state and recalculate stats
      setLinks(prevLinks => {
        const updatedLinks = prevLinks.filter(l => l.id !== link.id);
        calculateStats(updatedLinks);
        return updatedLinks;
      });
      
      // Close details modal if it's open for this link
      if (selectedLink?.id === link.id) {
        setSelectedLink(null);
      }
    } catch (error) {
      console.error('Error deleting link:', error);
      toast.error('Failed to delete link');
    }
  };

  // Filtered and sorted links
  const filteredLinks = useMemo(() => {
    let filtered = links;

    // Apply status filter
    if (filterStatus === 'active') {
      filtered = filtered.filter(l => l.isActive);
    } else if (filterStatus === 'inactive') {
      filtered = filtered.filter(l => !l.isActive);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const normalizedSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(link => 
        (link.linkId || '').toLowerCase().includes(normalizedSearch) ||
        link.agentName?.toLowerCase().includes(normalizedSearch) ||
        link.agentDetails?.name?.toLowerCase().includes(normalizedSearch) ||
        link.agentDetails?.teamName?.toLowerCase().includes(normalizedSearch) ||
        (link.allowedGroups || []).some(g => g.toLowerCase().includes(normalizedSearch))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case 'createdAt':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case 'usageCount':
          aValue = a.usageCount || 0;
          bValue = b.usageCount || 0;
          break;
        case 'lastUsedAt':
          aValue = a.lastUsedAt || new Date(0);
          bValue = b.lastUsedAt || new Date(0);
          break;
        case 'agentName':
          aValue = a.agentDetails?.name || a.agentName || '';
          bValue = b.agentDetails?.name || b.agentName || '';
          break;
        default:
          aValue = a.createdAt;
          bValue = b.createdAt;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [links, searchTerm, filterStatus, sortBy, sortDirection]);

  // Export links to CSV
  const handleExportLinks = () => {
    const headers = ['Link ID', 'Agent Name', 'Team', 'Created At', 'Status', 'Allowed Groups', 'Usage Count', 'Last Used', 'Submissions', 'Has OTP', 'OTP Expires At'];
    const rows = filteredLinks.map(link => [
      link.linkId || 'N/A',
      link.agentDetails?.name || link.agentName || 'Unknown',
      link.agentDetails?.teamName || 'N/A',
      link.createdAt ? format(link.createdAt, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
      link.isActive ? 'Active' : 'Inactive',
      (link.allowedGroups || []).join(', ') || 'N/A',
      (link.usageCount || 0).toString(),
      link.lastUsedAt ? format(link.lastUsedAt, 'yyyy-MM-dd HH:mm:ss') : 'Never',
      link.submissionsCount.toString(),
      link.otp ? 'Yes' : 'No',
      link.otpExpiresAt ? format(link.otpExpiresAt, 'yyyy-MM-dd HH:mm:ss') : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-links-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Links exported to CSV');
  };

  // Export submissions to CSV
  const handleExportSubmissions = () => {
    const allSubmissions = filteredLinks.flatMap(link => 
      (link.submissions || []).map(sub => ({
        ...sub,
        linkId: link.linkId || 'N/A',
        agentName: link.agentDetails?.name || link.agentName || 'Unknown',
        teamName: link.agentDetails?.teamName || 'N/A'
      }))
    );

    const headers = ['Link ID', 'Agent Name', 'Team', 'Submission ID', 'Customer Name', 'Customer Phone', 'Submitted At', 'Status', 'Numbers Selected'];
    const rows = allSubmissions.map(sub => [
      sub.linkId,
      sub.agentName,
      sub.teamName,
      sub.id,
      sub.customerName || 'N/A',
      sub.customerPhone || 'N/A',
      sub.submittedAt ? format(sub.submittedAt, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
      sub.status || 'pending',
      sub.plans?.length || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-submissions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Submissions exported to CSV');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col m-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Customer Link Tracking</h2>
              <p className="text-sm text-gray-500">Comprehensive analytics for customer portal links</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRefreshing(true);
                loadData();
              }}
              disabled={refreshing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Total Links</span>
              </div>
              <p className="text-2xl font-bold text-blue-900">{stats.totalLinks}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </div>
              <p className="text-2xl font-bold text-green-900">{stats.activeLinks}</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-gray-700">Inactive</span>
              </div>
              <p className="text-2xl font-bold text-red-900">{stats.inactiveLinks}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Submissions</span>
              </div>
              <p className="text-2xl font-bold text-purple-900">{stats.totalSubmissions}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-5 w-5 text-orange-600" />
                <span className="text-sm font-medium text-gray-700">Total Views</span>
              </div>
              <p className="text-2xl font-bold text-orange-900">{stats.totalUsageCount}</p>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Links with OTP</div>
              <p className="text-xl font-bold text-gray-900">{stats.linksWithOTP}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Avg Submissions/Link</div>
              <p className="text-xl font-bold text-gray-900">{stats.averageSubmissionsPerLink.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Avg Views/Link</div>
              <p className="text-xl font-bold text-gray-900">{stats.averageUsagePerLink.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Links without OTP</div>
              <p className="text-xl font-bold text-gray-900">{stats.linksWithoutOTP}</p>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by link ID, agent name, team, or group..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <select
              value={`${sortBy}-${sortDirection}`}
              onChange={(e) => {
                const [field, direction] = e.target.value.split('-');
                setSortBy(field as any);
                setSortDirection(direction as 'asc' | 'desc');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="usageCount-desc">Most Used</option>
              <option value="usageCount-asc">Least Used</option>
              <option value="lastUsedAt-desc">Recently Used</option>
              <option value="lastUsedAt-asc">Never Used</option>
              <option value="agentName-asc">Agent Name (A-Z)</option>
              <option value="agentName-desc">Agent Name (Z-A)</option>
            </select>
          </div>

          {/* Links Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Link ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Agent</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Team</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Groups</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Views</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Submissions</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">OTP</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Last Used</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredLinks.map((link) => (
                      <tr key={link.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">
                          {link.linkId || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {link.agentDetails?.name || link.agentName || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {link.agentDetails?.teamName || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap gap-1">
                            {(link.allowedGroups || []).map((group, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs">
                                {group}
                              </span>
                            ))}
                            {(link.allowedGroups || []).length === 0 && (
                              <span className="text-gray-400 text-xs">N/A</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {link.isActive ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {link.usageCount || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <button
                            onClick={() => setSelectedLink(link)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {link.submissionsCount}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {link.otp ? (
                            <div className="flex items-center gap-1">
                              <Key className="h-4 w-4 text-emerald-600" />
                              {link.otpExpiresAt && (
                                <span className="text-xs text-gray-500">
                                  {new Date() > link.otpExpiresAt ? (
                                    <span className="text-red-600">Expired</span>
                                  ) : (
                                    <span className="text-green-600">Valid</span>
                                  )}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">No OTP</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {link.createdAt ? format(link.createdAt, 'MMM d, yyyy HH:mm') : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {link.lastUsedAt ? format(link.lastUsedAt, 'MMM d, yyyy HH:mm') : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedLink(link)}
                              className="text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => handleDeleteLink(link)}
                              className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                              title="Delete link"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredLinks.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No links found matching your criteria.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Link Details Modal */}
        {selectedLink && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Link Details: {selectedLink.linkId || 'N/A'}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteLink(selectedLink)}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-600 hover:text-red-700 transition-colors"
                    title="Delete link"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setSelectedLink(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Agent</label>
                    <p className="text-sm text-gray-900">{selectedLink.agentDetails?.name || selectedLink.agentName || 'Unknown'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Team</label>
                    <p className="text-sm text-gray-900">{selectedLink.agentDetails?.teamName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <p className="text-sm">
                      {selectedLink.isActive ? (
                        <span className="text-green-600 font-medium">Active</span>
                      ) : (
                        <span className="text-gray-600 font-medium">Inactive</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Allowed Groups</label>
                    <p className="text-sm text-gray-900">{(selectedLink.allowedGroups || []).join(', ') || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Created At</label>
                    <p className="text-sm text-gray-900">
                      {selectedLink.createdAt ? format(selectedLink.createdAt, 'MMM d, yyyy HH:mm:ss') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Last Used</label>
                    <p className="text-sm text-gray-900">
                      {selectedLink.lastUsedAt ? format(selectedLink.lastUsedAt, 'MMM d, yyyy HH:mm:ss') : 'Never'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Usage Count</label>
                    <p className="text-sm text-gray-900">{selectedLink.usageCount || 0}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">OTP Status</label>
                    <p className="text-sm text-gray-900">
                      {selectedLink.otp ? (
                        selectedLink.otpExpiresAt ? (
                          new Date() > selectedLink.otpExpiresAt ? (
                            <span className="text-red-600">Expired</span>
                          ) : (
                            <span className="text-green-600">Valid until {format(selectedLink.otpExpiresAt, 'MMM d, HH:mm')}</span>
                          )
                        ) : (
                          <span className="text-gray-600">No expiration</span>
                        )
                      ) : (
                        <span className="text-gray-400">No OTP</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Submissions ({selectedLink.submissionsCount || 0})</h4>
                  {(selectedLink.submissions || []).length > 0 ? (
                    <div className="space-y-3">
                      {(selectedLink.submissions || []).map((submission: any) => (
                        <div key={submission.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-medium text-gray-600">Customer</label>
                              <p className="text-sm text-gray-900">{submission.customerName || 'N/A'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Phone</label>
                              <p className="text-sm text-gray-900">{submission.customerPhone || 'N/A'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Submitted At</label>
                              <p className="text-sm text-gray-900">
                                {submission.submittedAt ? format(submission.submittedAt, 'MMM d, yyyy HH:mm:ss') : 'N/A'}
                              </p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Status</label>
                              <p className="text-sm">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  submission.status === 'lead_submitted' ? 'bg-green-100 text-green-800' :
                                  submission.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {submission.status || 'pending'}
                                </span>
                              </p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">Numbers Selected</label>
                              <p className="text-sm text-gray-900">{submission.plans?.length || 0}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No submissions yet</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
