import { format, addMonths } from 'date-fns';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

const MONTHLY_LEAVE_ACCRUAL = 1.5; // 1.5 days per month

// Cache for performance optimization
const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

function getCacheKey(type: string, ...params: string[]): string {
  return `${type}:${params.join(':')}`;
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export interface LeaveBalance {
  totalAccrued: number;
  totalUsed: number;
  availableBalance: number;
  firstAttendanceMonth: string | null;
  monthsOfService: number;
}

/**
 * Find the first month when the employee had any attendance marked
 * First checks for a manually set employment start date, then falls back to attendance data
 */
export async function getFirstAttendanceMonth(userId: string): Promise<string | null> {
  const cacheKey = getCacheKey('firstAttendance', userId);
  const cached = getFromCache<string | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    // First check if there's a manually set employment start date
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      if (userData.employmentStartMonth) {
        setCache(cacheKey, userData.employmentStartMonth);
        return userData.employmentStartMonth;
      }
    }
    
    // Fallback to first attendance record
    const attendanceQuery = query(
      collection(db, 'attendance'),
      where('userId', '==', userId),
      orderBy('month', 'asc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(attendanceQuery);
    
    if (!querySnapshot.empty) {
      const firstDoc = querySnapshot.docs[0];
      const result = firstDoc.data().month;
      setCache(cacheKey, result);
      return result;
    }
    
    setCache(cacheKey, null);
    return null;
  } catch (error) {
    console.error('Error finding first attendance month:', error);
    return null;
  }
}

/**
 * Get leave usage for a specific month from attendance data
 */
export async function getMonthlyLeaveUsage(userId: string, month: string): Promise<number> {
  const cacheKey = getCacheKey('monthlyLeaveUsage', userId, month);
  const cached = getFromCache<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const docRef = doc(db, 'attendance', `${userId}_${month}`);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      setCache(cacheKey, 0);
      return 0;
    }
    
    const days = docSnap.data().days || {};
    const usage = (Object.values(days) as string[]).reduce((acc, status) => {
      if (status === 'paid_leave') return acc + 1;
      if (status === 'halfday_leave') return acc + 0.5;
      return acc;
    }, 0);
    
    setCache(cacheKey, usage);
    return usage;
  } catch (error) {
    console.error('Error getting monthly leave usage:', error);
    return 0;
  }
}

/**
 * Get leave usage from approved leave applications for a specific month
 */
export async function getMonthlyApplicationsUsage(userId: string, month: string): Promise<number> {
  const cacheKey = getCacheKey('monthlyApplicationsUsage', userId, month);
  const cached = getFromCache<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);
    
    const applicationsQuery = query(
      collection(db, 'leaveApplications'),
      where('userId', '==', userId),
      where('status', '==', 'approved'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    
    const querySnapshot = await getDocs(applicationsQuery);
    
    const usage = querySnapshot.docs.reduce((acc, doc) => {
      const data = doc.data();
      return acc + (data.halfday ? 0.5 : 1);
    }, 0);
    
    setCache(cacheKey, usage);
    return usage;
  } catch (error) {
    console.error('Error getting monthly applications usage:', error);
    return 0;
  }
}

/**
 * Calculate total leave usage from a specific month to current month
 */
export async function getTotalLeaveUsage(userId: string, fromMonth: string, toMonth: string): Promise<number> {
  const cacheKey = getCacheKey('totalLeaveUsage', userId, fromMonth, toMonth);
  const cached = getFromCache<number>(cacheKey);
  if (cached !== null) return cached;

  let totalUsage = 0;
  let currentMonth = fromMonth;
  
  // Batch process months for better performance
  const months: string[] = [];
  while (currentMonth <= toMonth) {
    months.push(currentMonth);
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = addMonths(new Date(year, month - 1), 1);
    currentMonth = format(nextDate, 'yyyy-MM');
  }
  
  // Process months in parallel
  const usagePromises = months.map(async (month) => {
    const [attendanceUsage, applicationsUsage] = await Promise.all([
      getMonthlyLeaveUsage(userId, month),
      getMonthlyApplicationsUsage(userId, month)
    ]);
    
    // Take the higher of the two to avoid double counting
    return Math.max(attendanceUsage, applicationsUsage);
  });
  
  const usages = await Promise.all(usagePromises);
  totalUsage = usages.reduce((acc, usage) => acc + usage, 0);
  
  setCache(cacheKey, totalUsage);
  return totalUsage;
}

/**
 * Calculate the number of months between two month strings (inclusive)
 */
function getMonthsBetween(fromMonth: string, toMonth: string): number {
  const [fromYear, fromMonthNum] = fromMonth.split('-').map(Number);
  const [toYear, toMonthNum] = toMonth.split('-').map(Number);
  
  const fromDate = new Date(fromYear, fromMonthNum - 1);
  const toDate = new Date(toYear, toMonthNum - 1);
  
  let months = 0;
  let current = new Date(fromDate);
  
  while (current <= toDate) {
    months++;
    current = addMonths(current, 1);
  }
  
  return months;
}

/**
 * Calculate comprehensive leave balance with yearly reset carry forward
 * Leaves carry forward within the same calendar year but reset in January
 */
export async function calculateLeaveBalance(userId: string, forMonth: string): Promise<LeaveBalance> {
  const cacheKey = getCacheKey('leaveBalance', userId, forMonth);
  const cached = getFromCache<LeaveBalance>(cacheKey);
  if (cached !== null) return cached;

  try {
    const firstAttendanceMonth = await getFirstAttendanceMonth(userId);
    
    if (!firstAttendanceMonth) {
      const result = {
        totalAccrued: 0,
        totalUsed: 0,
        availableBalance: 0,
        firstAttendanceMonth: null,
        monthsOfService: 0
      };
      setCache(cacheKey, result);
      return result;
    }
    
    // If requesting for a month before first attendance, return zero balance
    if (forMonth < firstAttendanceMonth) {
      const result = {
        totalAccrued: 0,
        totalUsed: 0,
        availableBalance: 0,
        firstAttendanceMonth,
        monthsOfService: 0
      };
      setCache(cacheKey, result);
      return result;
    }
    
    // Get the year of the requested month
    const [forYear] = forMonth.split('-').map(Number);
    
    // Determine start month for calculations (January of current year or first attendance, whichever is later)
    const currentYearStart = `${forYear}-01`;
    const effectiveStartMonth = firstAttendanceMonth > currentYearStart ? firstAttendanceMonth : currentYearStart;
    
    // Calculate months of service within the current year only
    const monthsInCurrentYear = getMonthsBetween(effectiveStartMonth, forMonth);
    
    // Calculate total accrued leave for the current year
    const totalAccrued = monthsInCurrentYear * MONTHLY_LEAVE_ACCRUAL;
    
    // Calculate total used leave from start of year (or first attendance) to requested month
    const totalUsed = await getTotalLeaveUsage(userId, effectiveStartMonth, forMonth);
    
    // Calculate available balance
    const availableBalance = Math.max(0, totalAccrued - totalUsed);
    
    // Calculate total months of service since first employment (for display purposes)
    const totalMonthsOfService = getMonthsBetween(firstAttendanceMonth, forMonth);
    
    const result = {
      totalAccrued,
      totalUsed,
      availableBalance: Number(availableBalance.toFixed(1)),
      firstAttendanceMonth,
      monthsOfService: totalMonthsOfService
    };
    
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error calculating leave balance:', error);
    return {
      totalAccrued: 0,
      totalUsed: 0,
      availableBalance: 0,
      firstAttendanceMonth: null,
      monthsOfService: 0
    };
  }
}

/**
 * Calculate available leave for a specific month considering yearly reset carry forward
 * Excludes the usage of a specific day (for attendance marking)
 */
export async function getAvailableLeaveForMonth(
  userId: string, 
  month: string, 
  excludeDay?: string
): Promise<number> {
  const cacheKey = getCacheKey('availableLeaveForMonth', userId, month, excludeDay || 'none');
  const cached = getFromCache<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const firstAttendanceMonth = await getFirstAttendanceMonth(userId);
    
    if (!firstAttendanceMonth || month < firstAttendanceMonth) {
      setCache(cacheKey, 0);
      return 0;
    }
    
    // Get the year of the requested month
    const [monthYear] = month.split('-').map(Number);
    
    // Determine start month for calculations (January of current year or first attendance, whichever is later)
    const currentYearStart = `${monthYear}-01`;
    const effectiveStartMonth = firstAttendanceMonth > currentYearStart ? firstAttendanceMonth : currentYearStart;
    
    // Calculate total accrued up to this month within the current year
    const monthsInCurrentYear = getMonthsBetween(effectiveStartMonth, month);
    const totalAccrued = monthsInCurrentYear * MONTHLY_LEAVE_ACCRUAL;
    
    // Calculate total used up to this month (excluding the specific day) within current year only
    let totalUsed = 0;
    let currentMonth = effectiveStartMonth;
    
    while (currentMonth <= month) {
      const [attendanceUsage, applicationsUsage] = await Promise.all([
        getMonthlyLeaveUsage(userId, currentMonth),
        getMonthlyApplicationsUsage(userId, currentMonth)
      ]);
      
      let monthUsage = Math.max(attendanceUsage, applicationsUsage);
      
      // If this is the target month and we need to exclude a specific day
      if (currentMonth === month && excludeDay) {
        const docRef = doc(db, 'attendance', `${userId}_${month}`);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const days = docSnap.data().days || {};
          const dayStatus = days[excludeDay];
          
          if (dayStatus === 'paid_leave') {
            monthUsage = Math.max(0, monthUsage - 1);
          } else if (dayStatus === 'halfday_leave') {
            monthUsage = Math.max(0, monthUsage - 0.5);
          }
        }
      }
      
      totalUsed += monthUsage;
      
      // Move to next month
      const [year, monthNum] = currentMonth.split('-').map(Number);
      const nextDate = addMonths(new Date(year, monthNum - 1), 1);
      currentMonth = format(nextDate, 'yyyy-MM');
    }
    
    const result = Math.max(0, Number((totalAccrued - totalUsed).toFixed(1)));
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error calculating available leave for month:', error);
    return 0;
  }
}

/**
 * Clear cache for a specific user (useful when data changes)
 */
export function clearUserCache(userId: string): void {
  const keysToDelete: string[] = [];
  for (const [key] of cache) {
    if (key.includes(userId)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => cache.delete(key));
}

/**
 * Clear all cache (useful for memory management)
 */
export function clearAllCache(): void {
  cache.clear();
} 