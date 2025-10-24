import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Calendar,
  Phone,
  Package,
  User2,
  MessageSquare,
  ArrowRight,
  Filter,
  Search,
  Eye,
  AlertTriangle,
  CheckSquare,
  Hash,
  CheckCircle2,
  Users,
  UserCheck
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import type { Lead, User, CoordinatorType } from '../../types';
import { motion } from 'framer-motion';
import { StruckNumbers, useStruckNumbersForCoordinator } from './StruckNumbers';

interface CoordinatorDashboardProps {
  user: User;
}

const PAGE_SIZES = [10, 20, 40, 80, 120] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  verified: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: CheckCircle,
  },
  rejected: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: XCircle,
  },
  pending_verification: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: Clock,
  },
  pending_coordinator: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Clock,
  },
  follow_up: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: Clock,
  },
  activated: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Zap,
  }
};

// Update StatusCheck interface
interface StatusCheck {
  id: string;
  numberId: string;
  number: string;
  requestedBy: string;
  requestedAt: Date;
  status?: 'pending' | 'available' | 'unavailable' | null;
  respondedAt?: Date;
  respondedBy?: string;
  expiresAt?: Date | null;
}

// Helper function to get coordinator group display name
const getCoordinatorGroupDisplay = (coordinatorType: CoordinatorType): string => {
  switch (coordinatorType) {
    case 'g1': return 'Group G1';
    case 'g2': return 'Group G2';
    case 'g3': return 'Group G3';
    case 'all': return 'All Groups (G1-G5)';
    default: return 'Unknown Group';
  }
};

// Helper function to check if a lead belongs to coordinator's group
const isLeadInCoordinatorGroup = (lead: Lead, coordinatorType: CoordinatorType): boolean => {
  if (!lead.plans || lead.plans.length === 0) return false;
  
  // Get all unique groups from the lead's plans
  const leadGroups = new Set(lead.plans.map(plan => plan.group).filter(Boolean));
  
  switch (coordinatorType) {
    case 'g1':
      return leadGroups.has('G1');
    case 'g2':
      return leadGroups.has('G2');
    case 'g3':
      return leadGroups.has('G3');
    case 'all':
      // All groups coordinator can handle any group
      return true;
    default:
      return false;
  }
};

export function CoordinatorDashboard({ user }: CoordinatorDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    verified: 0,
    assigned: 0,
    activated: 0,
    followUp: 0,
    rejected: 0,
    yesterday: 0
  });
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actionType, setActionType] = useState<'assign' | 'activate' | 'followup' | 'assign_verifier' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<typeof PAGE_SIZES[number]>(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [statusChecks, setStatusChecks] = useState<StatusCheck[]>([]);
  const [showStatusChecks, setShowStatusChecks] = useState(false);
  const [showStruckNumbers, setShowStruckNumbers] = useState(false);
  const { struckNumbers, loading: struckLoading } = useStruckNumbersForCoordinator();

  // Get the current status from URL params
  const currentStatus = searchParams.get('status') || 'verified';
  
  // Get coordinator type from user
  const coordinatorType = user.coordinatorType || 'all';

  useEffect(() => {
    loadCoordinatorData();
  }, [user, currentStatus, coordinatorType]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  // Load status checks for coordinators
  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, 'statusChecks'),
      where('status', '==', 'pending'),
      orderBy('requestedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const checks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          numberId: data.numberId,
          number: data.number,
          requestedBy: data.requestedBy,
          requestedAt: data.requestedAt?.toDate(),
          status: data.status,
          respondedAt: data.respondedAt?.toDate(),
          respondedBy: data.respondedBy,
          expiresAt: data.expiresAt?.toDate()
        };
      }) as StatusCheck[];
      setStatusChecks(checks);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // Filter leads based on search term and status
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === '' || 
      lead.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.customerNumber.includes(searchTerm) ||
      lead.plans?.some(plan => plan.number.includes(searchTerm));
    
    let matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    if (!matchesStatus && statusFilter === 'yesterday') {
      const now = new Date();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      matchesStatus = !!(lead.createdAt && lead.createdAt >= yesterdayStart && lead.createdAt <= yesterdayEnd);
    }
    
    return matchesSearch && matchesStatus;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const stats = [
    {
      name: 'Unassigned Leads',
      value: metrics.verified,
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      status: 'verified'
    },
    {
      name: 'Assigned Leads',
      value: metrics.assigned,
      icon: Clock,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      status: 'assigned'
    },
    {
      name: 'Activated Leads',
      value: metrics.activated,
      icon: Zap,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      status: 'activated'
    },
    {
      name: 'Follow Up',
      value: metrics.followUp,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      status: 'follow_up'
    },
    {
      name: 'Rejected Leads',
      value: metrics.rejected,
      icon: XCircle,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      status: 'rejected'
    },
    {
      name: 'Yesterday Leads',
      value: metrics.yesterday,
      icon: Calendar,
      color: 'bg-gray-500',
      textColor: 'text-gray-600',
      status: 'yesterday'
    }
  ];

  async function loadCoordinatorData() {
    try {
      setLoading(true);
      
      // Query for all leads to get accurate counts
      const allLeadsQuery = query(
        collection(db, 'leads'),
        orderBy('createdAt', 'desc')
      );
      const allLeadsSnapshot = await getDocs(allLeadsQuery);
      const allLeadsData = allLeadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Filter leads based on coordinator's group assignment
      const coordinatorLeads = allLeadsData.filter(lead => 
        isLeadInCoordinatorGroup(lead, coordinatorType)
      );

      // For non-All Groups coordinators, exclude pending_coordinator status leads
      const filteredCoordinatorLeads = (coordinatorType !== 'all' && coordinatorType !== undefined)
        ? coordinatorLeads.filter(lead => lead.status !== 'pending_coordinator')
        : coordinatorLeads;

      // Get current month's start and end dates
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);

      // Filter activated leads for current month and count each number as a separate activation
      const currentMonthActivatedLeads = filteredCoordinatorLeads.filter(lead => 
        lead.status === 'activated' && 
        lead.updatedAt >= startOfMonth && 
        lead.updatedAt <= endOfMonth
      );

      // Calculate total activations by counting the number of plans in each activated lead
      const totalActivations = currentMonthActivatedLeads.reduce((count, lead) => {
        return count + (lead.plans?.length || 0);
      }, 0);

      // Calculate metrics from coordinator's leads only
      const metrics = {
        totalLeads: filteredCoordinatorLeads.length,
        verified: filteredCoordinatorLeads.filter(l => l.status === 'verified').length,
        assigned: filteredCoordinatorLeads.filter(l => l.status === 'assigned').length,
        activated: totalActivations, // Use the total number of activations
        followUp: filteredCoordinatorLeads.filter(l => l.status === 'follow_up').length,
        rejected: filteredCoordinatorLeads.filter(l => l.status === 'rejected').length,
        yesterday: filteredCoordinatorLeads.filter(l => l.createdAt && l.createdAt >= yesterdayStart && l.createdAt <= yesterdayEnd).length
      };

      setMetrics(metrics);

      // Then filter leads based on current status (including special 'yesterday')
      let filteredLeads: Lead[] = filteredCoordinatorLeads;
      if (currentStatus !== 'all') {
        if (currentStatus === 'yesterday') {
          filteredLeads = filteredCoordinatorLeads.filter(lead => lead.createdAt && lead.createdAt >= yesterdayStart && lead.createdAt <= yesterdayEnd);
        } else {
          filteredLeads = filteredCoordinatorLeads.filter(lead => lead.status === currentStatus);
        }
      }

      setLeads(filteredLeads);
    } catch (error) {
      console.error('Error loading coordinator data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  async function handleLeadAction(lead: Lead, action: 'assign' | 'activate' | 'followup') {
    setSelectedLead(lead);
    setActionType(action);
    setActionNote('');
    setShowActionDialog(true);
  }

  async function confirmAction() {
    if (!selectedLead || !actionType) return;

    try {
      const leadRef = doc(db, 'leads', selectedLead.id);

      let updates: any = {
        coordinatorId: user.id,
        coordinatorNotes: actionNote,
        updatedAt: new Date()
      };

      if (actionType === 'assign_verifier') {
        // Find appropriate verifier based on lead's groups
        const leadGroups = [...new Set(selectedLead.plans?.map(plan => plan.group) || [])];
        let assignedVerifierId: string | null = null;

        if (leadGroups.length === 1) {
          // Single group - find specific verifier
          const targetGroup = leadGroups[0]?.toLowerCase(); // Normalize to lowercase
          try {
            const verifiersQuery = query(
              collection(db, 'users'),
              where('role', '==', 'verifier')
            );
            const verifiersSnapshot = await getDocs(verifiersQuery);
            const verifiers = verifiersSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as User[];

            // Filter verifiers that can handle this group
            const eligibleVerifiers = verifiers.filter(v => {
              const verifierGroups = v.verifierGroups || [];
              const hasAllGroups = verifierGroups.includes('all') || verifierGroups.length === 0;
              if (hasAllGroups) return true;

              // Check if verifier's groups include the target group
              return verifierGroups.some(group => group.toLowerCase() === targetGroup);
            });

            // Prefer specific group verifiers over 'all' group verifiers
            const specificVerifier = eligibleVerifiers.find(v => {
              const verifierGroups = v.verifierGroups || [];
              return verifierGroups.some(group => group.toLowerCase() === targetGroup);
            });
            const allGroupVerifier = eligibleVerifiers.find(v => {
              const verifierGroups = v.verifierGroups || [];
              return verifierGroups.includes('all') || verifierGroups.length === 0;
            });

            assignedVerifierId = specificVerifier?.id || allGroupVerifier?.id || null;
          } catch (error) {
            console.error('Error finding verifier:', error);
          }
        }

        updates = {
          ...updates,
          status: 'pending_verification',
          ...(assignedVerifierId && { verifierId: assignedVerifierId })
        };
      } else {
        updates = {
          ...updates,
          status: actionType === 'assign' ? 'assigned' :
                  actionType === 'activate' ? 'activated' : 'follow_up'
        };
      }

      // Update lead status
      await updateDoc(leadRef, updates);

      // Update all numbers in the lead's plans
      if (selectedLead.plans && selectedLead.plans.length > 0) {
        const updatePromises = selectedLead.plans.map(plan => {
          const numberRef = doc(db, 'numberPool', plan.numberId);
          return updateDoc(numberRef, {
            status: updates.status,
            lastStatusChange: new Date(),
            leadId: selectedLead.id
          });
        });
        
        await Promise.all(updatePromises);
      }

      // Create notification for the agent
      if (selectedLead.agentId) {
        let statusMessage = '';
        if (updates.status === 'activated') {
          statusMessage = 'Lead Activated';
        } else if (updates.status === 'assigned') {
          statusMessage = 'Lead Assigned';
        } else if (updates.status === 'follow_up') {
          statusMessage = 'Lead Marked for Follow-up';
        } else if (updates.status === 'pending_verification') {
          statusMessage = 'Lead Assigned to Verifier';
        }

        const notificationRef = await addDoc(collection(db, 'notifications'), {
          userId: selectedLead.agentId,
          type: 'lead_update',
          title: 'Lead Status Update',
          message: `${statusMessage} by ${user.name}`,
          read: false,
          createdAt: new Date(),
          data: {
            leadId: selectedLead.id
          }
        });

        console.log('Created notification for agent:', {
          agentId: selectedLead.agentId,
          notificationId: notificationRef.id,
          status: statusMessage
        });
      }

      toast.success(
        actionType === 'assign' ? 'Lead assigned successfully' :
        actionType === 'activate' ? 'Lead activated successfully' :
        actionType === 'assign_verifier' ? 'Lead assigned to verifier successfully' :
        'Lead marked for follow-up'
      );

      setShowActionDialog(false);
      loadCoordinatorData();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    }
  }

  const handleViewLead = (lead: Lead) => {
    navigate(`/dashboard/leads/${lead.id}`);
  };

  const handleStatClick = (status: string) => {
    setSearchParams({ status });
  };

  // Update handleStatusResponse function
  const handleStatusResponse = async (check: StatusCheck, status: 'available' | 'unavailable') => {
    if (!user?.id) return;

    try {
      const checkRef = doc(db, 'statusChecks', check.id);
      const updateData: any = {
        status,
        respondedAt: serverTimestamp(),
        respondedBy: user.id
      };

      // If marking as available, 24 hrs expiration
      if (status === 'available') {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        updateData.expiresAt = expiresAt;
      }

      await updateDoc(checkRef, updateData);

      // Send notification to the requesting agent
      await addDoc(collection(db, 'notifications'), {
        userId: check.requestedBy,
        type: 'status_check_response',
        title: 'Status Check Response',
        message: `Your status check for number ${check.number} has been marked as ${status}`,
        read: false,
        createdAt: serverTimestamp(),
        numberId: check.numberId
      });

      // Remove the check from the local state immediately
      setStatusChecks(prev => prev.filter(c => c.id !== check.id));

      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  // Add StatusChecksSection component
  const StatusChecksSection = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-6 mb-12"
    >
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="px-8 py-6 bg-gradient-to-r from-blue-500 to-indigo-600">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Status Check Requests</h3>
              <p className="mt-1 text-blue-100 text-sm">Manage number status check requests</p>
            </div>
            <div className="p-2 bg-white/10 rounded-lg">
              <CheckSquare className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {statusChecks.map((check) => (
              <motion.div
                key={check.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                      <Hash className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{check.number}</h4>
                      <p className="text-xs text-gray-500">
                        Requested {formatDistanceToNow(check.requestedAt)} ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleStatusResponse(check, 'available')}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-50 to-green-100 text-green-600 rounded-lg hover:from-green-100 hover:to-green-200 transition-all duration-200"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Available
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleStatusResponse(check, 'unavailable')}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-lg hover:from-red-100 hover:to-red-200 transition-all duration-200"
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Unavailable
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
            {statusChecks.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No pending status check requests
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Action Dialog */}
      {showActionDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {actionType === 'assign' ? 'Assign Lead' :
               actionType === 'activate' ? 'Activate Lead' :
               actionType === 'assign_verifier' ? 'Assign to Verifier' :
               'Mark for Follow-up'}
            </h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                rows={4}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 resize-none"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Add any notes about this action..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowActionDialog(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className={clsx(
                  "px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors",
                  actionType === 'assign' ? 'bg-indigo-600 hover:bg-indigo-700' :
                  actionType === 'activate' ? 'bg-green-600 hover:bg-green-700' :
                  actionType === 'assign_verifier' ? 'bg-purple-600 hover:bg-purple-700' :
                  'bg-orange-600 hover:bg-orange-700'
                )}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.name}!
            </h1>
            <div className="mt-2 flex items-center gap-4">
              <p className="text-lg text-gray-600">
                Here's an overview of leads requiring coordination.
              </p>
              <div className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 rounded-full text-sm font-medium">
                <Users className="h-4 w-4 mr-1.5" />
                {getCoordinatorGroupDisplay(coordinatorType)}
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {coordinatorType === 'g1' && 'You are assigned to handle leads with G1 group numbers only.'}
              {coordinatorType === 'g2' && 'You are assigned to handle leads with G2 group numbers only.'}
              {coordinatorType === 'g3' && 'You are assigned to handle leads with G3 group numbers only.'}
              {coordinatorType === 'all' && 'You are assigned to handle leads from all groups (G1, G2, G3, G4, G5).'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {coordinatorType === 'all' && (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowStatusChecks(!showStatusChecks)}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <CheckSquare className="h-5 w-5 mr-2" />
                  Status Check Requests
                  {statusChecks.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
                      {statusChecks.length}
                    </span>
                  )}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowStruckNumbers((prev) => !prev)}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Struck Numbers
                  <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
                    {struckLoading ? '...' : struckNumbers.length}
                  </span>
                </motion.button>
              </>
            )}
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600">
              <Calendar className="h-5 w-5" />
              <span>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
            </div>
          </div>
        </div>
      </div>

      {showStruckNumbers && coordinatorType === 'all' && (
        <div className="mt-8">
          <StruckNumbers struckNumbers={struckNumbers} loading={struckLoading} userId={user.id} />
        </div>
      )}

      {/* Show StatusChecksSection only when showStatusChecks is true and coordinator is All Groups */}
      {showStatusChecks && coordinatorType === 'all' && <StatusChecksSection />}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <button
            key={stat.status}
            onClick={() => handleStatClick(stat.status)}
            className={`bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
              currentStatus === stat.status ? 'ring-2 ring-indigo-500' : ''
            }`}
          >
          <div className="flex items-center">
              <div className={`p-3 rounded-xl ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">{stat.name}</h3>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
        </div>
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Filter className="h-5 w-5 text-gray-400" />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-4 py-2 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="assigned">Assigned</option>
            <option value="activated">Activated</option>
            <option value="follow_up">Follow Up</option>
            {coordinatorType === 'all' && (
              <option value="pending_coordinator">Pending Coordinator</option>
            )}
          </select>
        </div>

        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
            className="pl-4 pr-4 py-2 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {paginatedLeads.map((lead) => {
                const StatusIcon = STATUS_STYLES[lead.status]?.icon || Clock;
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center">
                          <User2 className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {lead.customerName}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <Phone className="h-3.5 w-3.5 mr-1" />
                            {lead.customerNumber}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div key={index} className="flex items-center">
                            <Phone className="h-4 w-4 mr-2 text-indigo-500" />
                            <span className="text-sm font-medium text-gray-900">{plan.number}</span>
                            <span className={clsx(
                              "ml-2 px-2 py-0.5 text-xs rounded-full",
                              plan.category === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                              plan.category === 'Platinum' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                            )}>
                              {plan.category}
                            </span>
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No number selected</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div key={index} className="flex items-center">
                            <span className={clsx(
                              "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                              plan.group === 'G1' ? 'bg-blue-100 text-blue-800' :
                              plan.group === 'G2' ? 'bg-green-100 text-green-800' :
                              plan.group === 'G3' ? 'bg-purple-100 text-purple-800' :
                              plan.group === 'G4' ? 'bg-yellow-100 text-yellow-800' :
                              plan.group === 'G5' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            )}>
                              {plan.group || 'No Group'}
                            </span>
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No group assigned</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div key={index} className="flex items-center">
                            <Package className="h-4 w-4 mr-2 text-indigo-500" />
                            <span className={clsx(
                              "px-2 py-0.5 text-xs rounded-full",
                              plan.plan === 'Premium' ? 'bg-purple-100 text-purple-800' :
                              plan.plan === 'VIP' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            )}>
                              {plan.plan}
                            </span>
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No plan selected</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center",
                        STATUS_STYLES[lead.status]?.bg || 'bg-gray-100',
                        STATUS_STYLES[lead.status]?.text || 'text-gray-800'
                      )}>
                        <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
                        {lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(lead.updatedAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {/* View Details Link */}
                        <Link
                          to={`/dashboard/leads/${lead.id}`}
                          className="inline-flex items-center text-indigo-600 hover:text-indigo-900 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="ml-1">View details</span>
                        </Link>

                        {/* Action Buttons */}
                        {lead.status === 'pending_coordinator' && (
                          <>
                            <button
                              onClick={() => handleLeadAction(lead, 'assign_verifier')}
                              className="inline-flex items-center px-2.5 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-xs font-medium"
                              title="Assign to Verifier"
                            >
                              <User2 className="h-3.5 w-3.5 mr-1" />
                              Assign Verifier
                            </button>
                            <button
                              onClick={() => handleLeadAction(lead, 'assign')}
                              className="inline-flex items-center px-2.5 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-xs font-medium"
                              title="Assign Lead"
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              Assign
                            </button>
                          </>
                        )}

                        {lead.status === 'assigned' && (
                          <>
                            <button
                              onClick={() => handleLeadAction(lead, 'activate')}
                              className="inline-flex items-center px-2.5 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-xs font-medium"
                              title="Activate Lead"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Activate
                            </button>
                            <button
                              onClick={() => handleLeadAction(lead, 'followup')}
                              className="inline-flex items-center px-2.5 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-xs font-medium"
                              title="Mark for Follow-up"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                              Follow-up
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredLeads.length)} of {filteredLeads.length} leads
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
