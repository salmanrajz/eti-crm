import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, NumberPool } from '../../types';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  Phone, 
  User2, 
  Calendar,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Eye,
  Hash,
  Package,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface TeamReservedNumbersProps {
  user: User;
}

interface ReservedNumberWithAgent extends NumberPool {
  agentName: string;
  agentEmail: string;
}

export function TeamReservedNumbers({ user }: TeamReservedNumbersProps) {
  const [reservedNumbers, setReservedNumbers] = useState<ReservedNumberWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    field: keyof ReservedNumberWithAgent;
    direction: 'asc' | 'desc';
  }>({
    field: 'reservedAt',
    direction: 'desc'
  });
  const [expandedNumbers, setExpandedNumbers] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  useEffect(() => {
   // console.log('TeamReservedNumbers: User data:', { id: user.id, name: user.name, teamId: user.teamId, role: user.role });
    loadTeamMembers();
  }, [user]);

  useEffect(() => {
    if (teamMembers.length > 0) {
      loadReservedNumbers();
    } else if (teamMembers.length === 0 && user.teamId) {
      // If no team members found, still try to load numbers to see if there are any
     // console.log('No team members found, loading all reserved numbers for debugging');
      loadReservedNumbers();
    }
  }, [teamMembers]);

  const loadTeamMembers = async () => {
    try {
    //  console.log('Loading team members for teamId:', user.teamId);
      const usersQuery = query(
        collection(db, 'users'),
        where('teamId', '==', user.teamId),
        where('role', '==', 'agent')
      );
      const usersSnapshot = await getDocs(usersQuery);
      const members = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
     // console.log('Found team members:', members.length, members.map(m => ({ id: m.id, name: m.name })));
      setTeamMembers(members);
    } catch (error) {
     // console.error('Error loading team members:', error);
    }
  };

  const loadReservedNumbers = () => {
    try {
     // console.log('Loading reserved numbers for team members:', teamMembers.map(m => ({ id: m.id, name: m.name })));
      
      const numbersQuery = query(
        collection(db, 'numberPool'),
        where('status', '==', 'reserved'),
        orderBy('reservedAt', 'desc')
      );

      const unsubscribe = onSnapshot(numbersQuery, async (snapshot) => {
        const numbers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as NumberPool[];

       // console.log('All reserved numbers:', numbers.length);
       // console.log('Team member IDs:', teamMembers.map(member => member.id));

        // Filter numbers reserved by team members
        const teamMemberIds = teamMembers.map(member => member.id);
        let teamReservedNumbers;
        
        if (teamMembers.length === 0) {
          // If no team members found, show all reserved numbers for debugging
          //console.log('No team members found, showing all reserved numbers');
          teamReservedNumbers = numbers;
        } else {
          teamReservedNumbers = numbers.filter(number => {
            const isReservedByTeamMember = number.reservedBy && teamMemberIds.includes(number.reservedBy);
            if (isReservedByTeamMember) {
              //console.log('Found team reserved number:', number.number, 'by:', number.reservedBy);
            }
            return isReservedByTeamMember;
          });
        }

       // console.log('Team reserved numbers:', teamReservedNumbers.length);

        // Enrich with agent information
        const enrichedNumbers: ReservedNumberWithAgent[] = teamReservedNumbers.map(number => {
          const agent = teamMembers.find(member => member.id === number.reservedBy);
          return {
            ...number,
            agentName: agent?.name || (number.reservedBy ? `Agent ${number.reservedBy}` : 'Unknown Agent'),
            agentEmail: agent?.email || 'Unknown Email'
          };
        });

        setReservedNumbers(enrichedNumbers);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      //console.error('Error loading reserved numbers:', error);
      setLoading(false);
    }
  };

  const handleSort = (field: keyof ReservedNumberWithAgent) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleExpanded = (numberId: string) => {
    setExpandedNumbers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(numberId)) {
        newSet.delete(numberId);
      } else {
        newSet.add(numberId);
      }
      return newSet;
    });
  };

  const filteredAndSortedNumbers = reservedNumbers
    .filter(number => {
      const matchesSearch = 
        number.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        number.agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        number.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        number.code?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || number.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const aValue = a[sortConfig.field];
      const bValue = b[sortConfig.field];
      
      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return 0;
    });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'reserved':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-800',
          icon: CheckCircle2,
          gradient: 'from-blue-50 to-blue-100'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          icon: Hash,
          gradient: 'from-gray-50 to-gray-100'
        };
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl shadow-lg border border-blue-100 p-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center mb-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg mr-4">
                <Phone className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Team Reserved Numbers
                </h2>
                <p className="text-gray-600 mt-1 text-lg">
                  Monitor all numbers currently reserved by your team members
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="bg-white/80 backdrop-blur-sm text-blue-800 px-6 py-3 rounded-xl text-lg font-semibold shadow-md border border-blue-200">
              {reservedNumbers.length} Reserved
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search by number, agent, category, or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 bg-gray-50/50 focus:bg-white text-lg placeholder-gray-400"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-6 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 bg-gray-50/50 focus:bg-white text-lg font-medium"
            >
              <option value="all">All Status</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Numbers List */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 mr-2 text-blue-500" />
                    Number
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center">
                    <User2 className="h-4 w-4 mr-2 text-green-500" />
                    Agent
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-2 text-purple-500" />
                    Category
                  </div>
                </th>
                <th 
                  className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors group"
                  onClick={() => handleSort('reservedAt')}
                >
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-orange-500" />
                    Reserved At
                    {sortConfig.field === 'reservedAt' && (
                      sortConfig.direction === 'asc' ? 
                        <ChevronUp className="h-4 w-4 ml-2 text-blue-500" /> : 
                        <ChevronDown className="h-4 w-4 ml-2 text-blue-500" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-indigo-500" />
                    Status
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center">
                    <Eye className="h-4 w-4 mr-2 text-gray-500" />
                    Actions
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              <AnimatePresence>
                {filteredAndSortedNumbers.map((number) => {
                  const isExpanded = expandedNumbers.has(number.id);
                  const statusStyle = getStatusStyle(number.status);
                  const StatusIcon = statusStyle.icon;
                  
                  return (
                    <motion.tr
                      key={number.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all duration-200 group"
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="p-1.5 bg-blue-100 rounded-lg mr-2 group-hover:bg-blue-200 transition-colors">
                            <Phone className="h-3 w-3 text-blue-600" />
                          </div>
                          <span className="text-sm font-semibold text-gray-900">
                            {number.number}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="p-1.5 bg-green-100 rounded-lg mr-2 group-hover:bg-green-200 transition-colors">
                            <User2 className="h-3 w-3 text-green-600" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {number.agentName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {number.agentEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="p-1.5 bg-purple-100 rounded-lg mr-2 group-hover:bg-purple-200 transition-colors">
                            <Package className="h-3 w-3 text-purple-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {number.category || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="p-1.5 bg-orange-100 rounded-lg mr-2 group-hover:bg-orange-200 transition-colors">
                            <Calendar className="h-3 w-3 text-orange-600" />
                          </div>
                          <div className="text-sm text-gray-900">
                            {number.reservedAt ? (
                              <div>
                                <div className="font-semibold text-sm">
                                  {format(number.reservedAt instanceof Date ? number.reservedAt : number.reservedAt.toDate(), 'MMM dd, yyyy')}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {format(number.reservedAt instanceof Date ? number.reservedAt : number.reservedAt.toDate(), 'HH:mm:ss')}
                                </div>
                              </div>
                            ) : (
                              'N/A'
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={clsx(
                          "inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold shadow-sm",
                          statusStyle.bg,
                          statusStyle.text
                        )}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {number.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => toggleExpanded(number.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {filteredAndSortedNumbers.length === 0 && (
          <div className="text-center py-16">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-6">
              <Phone className="h-12 w-12 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No reserved numbers</h3>
            <p className="text-gray-500 text-lg">
              {searchTerm || filterStatus !== 'all' 
                ? 'No numbers match your current filters.' 
                : 'Your team members haven\'t reserved any numbers yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {filteredAndSortedNumbers.map((number) => {
          if (!expandedNumbers.has(number.id)) return null;
          
          return (
            <motion.div
              key={`details-${number.id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg border border-gray-200/50 p-8"
            >
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg mr-4">
                  <Phone className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Number Details: {number.number}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <Package className="h-5 w-5 mr-2 text-purple-500" />
                    Basic Information
                  </h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Number:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.number}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Category:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.category || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Code:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.code || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Group:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.group || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <User2 className="h-5 w-5 mr-2 text-green-500" />
                    Reservation Details
                  </h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Reserved By:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.agentName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Email:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.agentEmail}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Reserved At:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {number.reservedAt ? 
                          (number.reservedAt instanceof Date ? number.reservedAt : number.reservedAt.toDate()).toLocaleString() :
                          'N/A'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Expires At:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {number.expiresAt ? 
                          (number.expiresAt instanceof Date ? number.expiresAt : number.expiresAt.toDate()).toLocaleString() :
                          'N/A'
                        }
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <CheckCircle2 className="h-5 w-5 mr-2 text-indigo-500" />
                    Status Information
                  </h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Status:</span>
                      <span className={clsx(
                        "inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-semibold shadow-sm",
                        getStatusStyle(number.status).bg,
                        getStatusStyle(number.status).text
                      )}>
                        {number.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Reservation Count:</span>
                      <span className="text-sm font-semibold text-gray-900">{number.reservationCount || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Last Status Change:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {number.lastStatusChange ? 
                          format(number.lastStatusChange instanceof Date ? number.lastStatusChange : number.lastStatusChange.toDate(), 'MMM dd, yyyy HH:mm:ss') :
                          'N/A'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
