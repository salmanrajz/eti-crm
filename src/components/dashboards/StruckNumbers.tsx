import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, claimNumberFunction } from '../../lib/firebase';
import { NumberPoolType, User } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { 
  AlertTriangle, 
  Hash, 
  Clock, 
  User2, 
  CheckCircle, 
  XCircle, 
  Star, 
  Zap, 
  Shield,
  TrendingUp,
  Activity,
  Users,
  Timer,
  Bell,
  ChevronRight,
  Filter,
  Search,
  SortAsc,
  SortDesc,
  RefreshCw,
  Eye,
  AlertOctagon
} from 'lucide-react';
import { format, subHours } from 'date-fns';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

interface StruckNumbersProps {
  struckNumbers: NumberPoolType[];
  loading: boolean;
  userId: string;
}

interface StrikeLimit {
  remainingStrikes: number;
  lastStrikeTime: Date | null;
  canStrike: boolean;
}

const getStatusConfig = (status: string) => {
  const configs = {
    verified: {
      color: 'from-emerald-500 to-green-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      icon: CheckCircle,
      label: 'VERIFIED',
      description: 'Successfully verified'
    },
    rejected: {
      color: 'from-red-500 to-rose-600',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      icon: XCircle,
      label: 'REJECTED',
      description: 'Verification rejected'
    },
    pending_verification: {
      color: 'from-amber-500 to-yellow-600',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
      icon: Clock,
      label: 'PENDING',
      description: 'Awaiting verification'
    },
    follow_up: {
      color: 'from-orange-500 to-amber-600',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-700',
      icon: Star,
      label: 'FOLLOW UP',
      description: 'Requires follow-up'
    },
    activated: {
      color: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      icon: Zap,
      label: 'ACTIVATED',
      description: 'Successfully activated'
    }
  };

  return configs[status as keyof typeof configs] || {
    color: 'from-gray-500 to-gray-600',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    icon: Activity,
    label: status.toUpperCase(),
    description: 'Unknown status'
  };
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={clsx(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ring-1 ring-inset",
        config.bgColor,
        config.textColor,
        "ring-current/20"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
    </motion.div>
  );
};

const NumberCard = ({ number, index }: { number: NumberPoolType; index: number }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRequestingOpen, setIsRequestingOpen] = useState(false);
  const [openRequested, setOpenRequested] = useState(false);
  const [isClaimingNumber, setIsClaimingNumber] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const config = getStatusConfig(number.status);
  const Icon = config.icon;

  const pendingClaims = (number.claims || []).filter((claim: any) => claim.status === 'pending').length;
  const lastClaimTime = (number.claims || [])[(number.claims || []).length - 1]?.claimedAt;

  // Check if a pending request already exists for this number and user
  useEffect(() => {
    let unsub = false;
    async function checkPendingRequest() {
      if (!user?.id) return;
      const q = query(
        collection(db, 'setOpenRequests'),
        where('numberId', '==', number.id),
        where('requestedBy', '==', user.id),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      if (!unsub) setOpenRequested(!snapshot.empty);
    }
    checkPendingRequest();
    return () => { unsub = true; };
  }, [number.id, user?.id]);

  const handleViewDetails = async () => {
    try {
      // Find the lead that contains this number
      // For agents, only search their own leads; for coordinators, search all leads
      let leadsQuery;
      if (user?.role === 'agent') {
        leadsQuery = query(
          collection(db, 'leads'),
          where('agentId', '==', user.id)
        );
      } else {
        leadsQuery = query(collection(db, 'leads'));
      }
      
      const leadsSnapshot = await getDocs(leadsQuery);
      let leadId = null;
      leadsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.plans && Array.isArray(data.plans)) {
          const hasNumber = data.plans.some((plan: any) => plan.numberId === number.id);
          if (hasNumber) {
            leadId = doc.id;
          }
        }
      });
      if (leadId) {
        navigate(`/dashboard/leads/${leadId}`);
      } else {
        // If no lead found, just expand the details
        setIsExpanded(!isExpanded);
      }
    } catch (error) {
      console.error('Error finding lead for number:', error);
      // Fallback to expanding details
      setIsExpanded(!isExpanded);
    }
  };

  const handleRequestOpen = async () => {
    if (!user?.id) return;
    setIsRequestingOpen(true);
    try {
      await addDoc(collection(db, 'setOpenRequests'), {
        numberId: number.id,
        number: number.number,
        requestedBy: user.id,
        requestedByName: user.name,
        requestedAt: serverTimestamp(),
        status: 'pending',
        strikes: (number.claims || []).length,
        numberStatus: number.status
      });
      setOpenRequested(true);
      toast.success('Open request sent to admin successfully');
    } catch (error) {
      console.error('Error requesting open:', error);
      toast.error('Failed to send open request');
    } finally {
      setIsRequestingOpen(false);
    }
  };

  const handleClaimNumber = async () => {
    if (!user?.id) return;
    setIsClaimingNumber(true);
    
    try {
      // Call the Cloud Function
      const result = await claimNumberFunction({
        numberId: number.id,
        userId: user.id
      });
      
      console.log('Claim result:', result.data);
      toast.success('Number claimed successfully');
      
      // Refresh the page or update the UI as needed
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Error claiming number:', error);
      toast.error('Failed to claim number. Please try again.');
    } finally {
      setIsClaimingNumber(false);
    }
  };

  // Check if user is coordinator
  const isCoordinator = user?.role === 'coordinator';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="group relative"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300" />
      
      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-2xl transition-all duration-300 overflow-hidden"
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 via-orange-50/30 to-amber-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Alert indicator */}
        <div className="absolute top-4 right-4">
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-3 h-3 bg-gradient-to-r from-red-500 to-orange-500 rounded-full shadow-lg"
          />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="p-3 bg-gradient-to-br from-red-100 to-orange-100 rounded-xl shadow-sm ring-2 ring-white"
              >
                <Hash className="w-6 h-6 text-red-600" />
              </motion.div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-red-600 transition-colors duration-200">
                  {number.number}
                </h3>
                <p className="text-sm text-gray-500 font-medium">{number.category}</p>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border border-red-100/50"
            >
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-red-600" />
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Strikes</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-red-700">{pendingClaims}</span>
                <span className="text-xs text-red-500">pending</span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100/50"
            >
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Last Claim</span>
              </div>
              <div className="text-xs font-bold text-orange-700">
                {lastClaimTime ? format(lastClaimTime, 'd MMM , yy h:mm a') : 'No claims'}
              </div>
            </motion.div>
          </div>

          {/* Status Badge - Centered */}
          <div className="flex justify-center mb-4">
            <StatusBadge status={number.status} />
          </div>

          {/* Action Button */}
          <div className="flex flex-col gap-3 mt-4">
            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleViewDetails}
              className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-2xl font-semibold shadow-md hover:shadow-xl transition-all duration-200 group/btn border-0 outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
              style={{ fontSize: '1rem', letterSpacing: '0.01em' }}
            >
              <span className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                View Lead Details
              </span>
              <ChevronRight className="w-5 h-5" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClaimNumber}
              disabled={isClaimingNumber}
              className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-2xl font-semibold shadow-md hover:shadow-xl transition-all duration-200 group/btn border-0 outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontSize: '1rem', letterSpacing: '0.01em' }}
            >
              <span className="flex items-center gap-2">
                {isClaimingNumber ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
                {isClaimingNumber ? 'Processing...' : 'Claim Number'}
              </span>
              <ChevronRight className="w-5 h-5" />
            </motion.button>

            {isCoordinator && (
              <motion.button
                whileHover={{ scale: openRequested ? 1 : 1.03, y: openRequested ? 0 : -2 }}
                whileTap={{ scale: openRequested ? 1 : 0.98 }}
                onClick={openRequested ? undefined : handleRequestOpen}
                className={`w-full flex items-center justify-between px-5 py-3 rounded-2xl font-semibold shadow-md transition-all duration-200 group/btn border-0 outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2
                  ${openRequested ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-xl'}`}
                disabled={openRequested || isRequestingOpen}
                style={{ fontSize: '1rem', letterSpacing: '0.01em' }}
              >
                <span className="flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5" />
                  {openRequested ? 'Pending' : 'Request to Set Open'}
                </span>
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export function useStrikeLimit(userId: string): StrikeLimit {
  const [strikeLimit, setStrikeLimit] = useState<StrikeLimit>({
    remainingStrikes: 2,
    lastStrikeTime: null,
    canStrike: true
  });

  useEffect(() => {
    if (!userId) return;
    checkStrikeLimit();
  }, [userId]);

  async function checkStrikeLimit() {
    try {
      // Get all claims made by this agent in the last 24 hours
      const twentyFourHoursAgo = Timestamp.fromDate(subHours(new Date(), 24));
      
      const claimsQuery = query(
        collection(db, 'numberPool'),
        where('claims', '!=', null)
      );
      
      const numbersSnapshot = await getDocs(claimsQuery);
      let strikeCount = 0;
      let lastStrikeTime: Date | null = null;

      numbersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const claims = data.claims || [];
        
        claims.forEach((claim: any) => {
          if (claim.userId === userId && claim.claimedAt?.toDate() > twentyFourHoursAgo.toDate()) {
            strikeCount++;
            const claimTime = claim.claimedAt.toDate();
            if (!lastStrikeTime || claimTime > lastStrikeTime) {
              lastStrikeTime = claimTime;
            }
          }
        });
      });

      const remainingStrikes = Math.max(0, 2 - strikeCount);
      
      setStrikeLimit({
        remainingStrikes,
        lastStrikeTime,
        canStrike: remainingStrikes > 0
      });
    } catch (error) {
      console.error('Error checking strike limit:', error);
    }
  }

  return strikeLimit;
}

export function useStruckNumbers(userId: string) {
  const [struckNumbers, setStruckNumbers] = useState<NumberPoolType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadStruckNumbers();
    // eslint-disable-next-line
  }, [userId]);

  async function loadStruckNumbers() {
    setLoading(true);
    try {
      // Get all leads for this agent
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', userId)
      );
      const leadsSnapshot = await getDocs(leadsQuery);
      
      // Get all number IDs from the agent's leads
      const numberIds = new Set<string>();
      leadsSnapshot.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.plans)) {
          data.plans.forEach((plan: any) => {
            if (plan.numberId) numberIds.add(plan.numberId);
          });
        }
      });

      // Get all numbers that have claims and are in the agent's leads
      const numbersQuery = query(
        collection(db, 'numberPool'),
        where('claims', '!=', null),
        orderBy('claims', 'desc')
      );
      const numbersSnapshot = await getDocs(numbersQuery);
      
      const struckNumbers = numbersSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            lastStatusChange: data.lastStatusChange?.toDate(),
            claims: (data.claims || []).map((claim: any) => ({
              ...claim,
              claimedAt: claim.claimedAt?.toDate()
            }))
          } as NumberPoolType;
        })
        .filter(number => 
          // Only include numbers that:
          // 1. Are in the agent's leads
          numberIds.has(number.id) && 
          // 2. Have pending claims from other agents
          (number.claims || []).some((claim: any) => 
            claim.userId !== userId && 
            claim.status === 'pending'
          ) &&
          // 3. Are not activated
          number.status !== 'activated'
        );

      setStruckNumbers(struckNumbers);
    } catch (error) {
      console.error('Error loading struck numbers:', error);
    } finally {
      setLoading(false);
    }
  }

  return { struckNumbers, loading };
}

export function useStruckNumbersForCoordinator() {
  const [struckNumbers, setStruckNumbers] = useState<NumberPoolType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStruckNumbers();
  }, []);

  async function loadStruckNumbers() {
    setLoading(true);
    try {
      // Get all numbers that have claims (struck numbers)
      const numbersQuery = query(
        collection(db, 'numberPool'),
        where('claims', '!=', null),
        orderBy('claims', 'desc')
      );
      const numbersSnapshot = await getDocs(numbersQuery);
      
      const struckNumbers = numbersSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            lastStatusChange: data.lastStatusChange?.toDate(),
            claims: (data.claims || []).map((claim: any) => ({
              ...claim,
              claimedAt: claim.claimedAt?.toDate()
            }))
          } as NumberPoolType;
        })
        .filter(number => 
          // Include numbers that:
          // 1. Have pending claims from any agents
          (number.claims || []).some((claim: any) => 
            claim.status === 'pending'
          ) &&
          // 2. Are not activated
          number.status !== 'activated'
        );

      setStruckNumbers(struckNumbers);
    } catch (error) {
      console.error('Error loading struck numbers for coordinator:', error);
    } finally {
      setLoading(false);
    }
  }

  return { struckNumbers, loading };
}

export function StruckNumbers({ struckNumbers, loading, userId }: StruckNumbersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'number' | 'claims' | 'time'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Filter and sort numbers
  const filteredNumbers = useMemo(() => {
    return struckNumbers
    .filter(number => {
        const matchesSearch = number.number.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || number.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
        if (sortBy === 'number') {
          return sortOrder === 'asc' 
            ? a.number.localeCompare(b.number)
            : b.number.localeCompare(a.number);
        } else if (sortBy === 'claims') {
          const aClaims = (a.claims || []).length;
          const bClaims = (b.claims || []).length;
          return sortOrder === 'asc' ? aClaims - bClaims : bClaims - aClaims;
        } else {
          const aTime = a.lastStatusChange instanceof Date ? a.lastStatusChange : new Date(0);
          const bTime = b.lastStatusChange instanceof Date ? b.lastStatusChange : new Date(0);
          return sortOrder === 'asc' 
            ? aTime.getTime() - bTime.getTime()
            : bTime.getTime() - aTime.getTime();
      }
      });
  }, [struckNumbers, searchTerm, sortBy, sortOrder, filterStatus]);

  if (loading) {
    return (
          <div className="animate-pulse space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl h-32" />
              ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative"
    >
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-orange-500/5 rounded-3xl blur-3xl" />
      
      <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl overflow-hidden border border-white/50">
        {/* Header with gradient background */}
        <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-orange-600">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" />
                Struck Numbers
              </h3>
              <p className="mt-1 text-red-100 text-sm">
                Numbers from your leads have been struck by other agents. Please take immediate action to Activate them, or you risk losing these numbers.
              </p>
            </div>
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className="p-3 bg-white/10 rounded-xl"
            >
              <Shield className="h-7 w-7 text-white" />
            </motion.div>
          </div>
        </div>

        {/* Search and filters */}
        <div className="p-4 bg-gradient-to-br from-red-50 to-orange-50 border-b border-red-100/50">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search numbers..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            
            {/* Status filter */}
            <div className="relative w-full sm:w-auto">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-4 w-4 text-gray-400" />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="block w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 appearance-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
                <option value="follow_up">Follow Up</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </div>
            
            {/* Sort */}
            <div className="relative w-full sm:w-auto">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {sortOrder === 'asc' ? (
                  <SortAsc className="h-4 w-4 text-gray-400" />
                ) : (
                  <SortDesc className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'number' | 'claims' | 'time')}
                className="block w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 appearance-none"
              >
                <option value="time">Sort by Time</option>
                <option value="number">Sort by Number</option>
                <option value="claims">Sort by Claims</option>
              </select>
              <div 
                className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                <RefreshCw className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Numbers list */}
        <div className="p-6">
          {filteredNumbers.length === 0 ? (
            <div className="text-center py-12">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4"
              >
                <Search className="h-8 w-8 text-red-400" />
              </motion.div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No matching numbers</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredNumbers.map((number, index) => (
                <NumberCard key={number.id} number={number} index={index} />
              ))}
            </div>
          )}
        </div>

        {/* Footer with stats */}
        <div className="px-6 py-4 bg-gradient-to-br from-red-50 to-orange-50 border-t border-red-100/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="p-2 bg-red-100 rounded-lg"
              >
                <Bell className="h-5 w-5 text-red-600" />
              </motion.div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {filteredNumbers.length} struck {filteredNumbers.length === 1 ? 'number' : 'numbers'} found
                </p>
                <p className="text-xs text-gray-500">
                  Take action to protect your numbers
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}