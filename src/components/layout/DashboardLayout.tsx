/**
 * ===============================================================================
 * DASHBOARD LAYOUT COMPONENT - MAIN APPLICATION LAYOUT AND NAVIGATION
 * ===============================================================================
 * 
 * This component serves as the main layout wrapper for the entire CRM dashboard
 * system. It provides navigation, notifications, user management, and responsive
 * design features across all dashboard pages and functionality.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE NAVIGATION SYSTEM
 *    - Responsive sidebar navigation with role-based menu items
 *    - Top navigation bar with quick access buttons and tools
 *    - Mobile bottom navigation bar for optimal mobile experience
 *    - Active state management and route-based highlighting
 * 
 * 2. REAL-TIME NOTIFICATION SYSTEM
 *    - Live notification updates via Firestore listeners
 *    - Notification sound support with user interaction requirements
 *    - Mobile-optimized swipe gestures for notification dismissal
 *    - Notification categorization (system vs chat messages)
 *    - Bulk notification management and clearing
 * 
 * 3. USER INTERFACE AND MANAGEMENT
 *    - User menu with profile information and logout functionality
 *    - Role-based access control and navigation visibility
 *    - User authentication state integration
 *    - Secure logout with proper state cleanup
 * 
 * 4. RESPONSIVE DESIGN AND INTERACTIONS
 *    - Mobile-first responsive design with touch-optimized interactions
 *    - Glass morphism effects and modern UI styling
 *    - Hover states and smooth transitions for desktop
 *    - Touch gestures and swipe interactions for mobile
 * 
 * 5. INTEGRATED TOOLS AND MODALS
 *    - MAR Strip integration for agent performance tracking
 *    - WhatsApp lookup and DNC management tools
 *    - Notice board and delivery schedule access
 *    - Translation chat integration for multilingual support
 * 
 * USAGE:
 * This component wraps all dashboard routes and provides the consistent
 * layout, navigation, and shared functionality across the entire CRM system.
 * ===============================================================================
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { Users, PhoneCall, ClipboardList, Settings, Menu, X, UserCog, LogOut, Building2, Upload, LayoutDashboard, Bell, MessageSquare, Volume2, VolumeX, User, Phone, Hash, Activity, ChevronDown, Star, PlusCircle, Calendar, Moon, Sun } from 'lucide-react';
import { logUserSessionAction, getUserAgentInfo, getDeviceInfo } from '../../utils/userSessionLogging';
import { initializeSessionTracking } from '../../utils/sessionTracker';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { useAuthStore } from '../../store/authStore';
import { auth } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, writeBatch, getDoc, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Notification, Lead } from '../../types';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import TranslationChat from '../TranslationChat';
import { MARStrip } from '../MARStrip';
import NoticeBoard from '../NoticeBoard';
import { DNCCheckModal } from '../modals/DNCCheckModal';
const DNCManagement = lazy(() => import('../admin/DNCManagement').then((m) => ({ default: m.DNCManagement })));
import { clearAllStorage } from '../../utils/clearStorage';
import { BroadcastPoster } from '../BroadcastPoster';

/**
 * ===============================================================================
 * MAIN DASHBOARD LAYOUT COMPONENT
 * ===============================================================================
 * 
 * The main layout component that provides:
 * - Navigation structure (sidebar, top bar, mobile bottom bar)
 * - Real-time notification system with sound and visual alerts
 * - User menu and authentication management
 * - Responsive design with mobile-optimized interactions
 * - Integration with various CRM tools and modals
 */
export function DashboardLayout() {
  // ===============================================================================
  // STATE MANAGEMENT FOR LAYOUT AND INTERACTIONS
  // ===============================================================================
  
  // Navigation and UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  // Universal dark mode
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('force_dark_mode') === '1'; } catch { return false; }
  });

  useEffect(() => {
    try {
      if (isDarkMode) localStorage.setItem('force_dark_mode', '1');
      else localStorage.removeItem('force_dark_mode');
    } catch {}
  }, [isDarkMode]);
  
  // Notification system state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);
  
  // Data and modal state
  const [leadDetails, setLeadDetails] = useState<Record<string, Lead>>({});
  const [showNoticeBoard, setShowNoticeBoard] = useState(false);
  const [dncModalOpen, setDncModalOpen] = useState(false);
  const [dncDefaultTab, setDncDefaultTab] = useState<'single' | 'multiple'>('single');
  const [dncManagementOpen, setDncManagementOpen] = useState(false);
  
  // Timeout management for hover interactions
  const [notificationTimeout, setNotificationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [userMenuTimeout, setUserMenuTimeout] = useState<NodeJS.Timeout | null>(null);
  const [sidebarTimeout, setSidebarTimeout] = useState<NodeJS.Timeout | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMouseOverSidebarRef = useRef(false);
  
  // Mobile touch interaction state
  const [isDraggingNotif, setIsDraggingNotif] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  
  // ===============================================================================
  // AUTHENTICATION AND ROUTING
  // ===============================================================================
  
  const { user, isAdmin, isManager } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  
  // ===============================================================================
  // REFS AND UTILITIES
  // ===============================================================================
  
  const notificationSound = useRef<HTMLAudioElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const lastNotificationIds = useRef<Set<string>>(new Set());
  
  /**
   * Utility function to detect mobile devices
   * Used for conditional rendering and interaction handling
   */
  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 640;

  // ===============================================================================
  // MOBILE TOUCH INTERACTION HANDLERS
  // ===============================================================================
  
  /**
   * Handles touch start events for notification panel swipe-to-close functionality
   * Only activates drag if touch starts within the top 36px to avoid conflicts with scrolling
   */
  const handleNotifTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile()) return;
    // Prevent bubbling to the bell wrapper (which toggles the panel)
    e.stopPropagation();
    if (e.touches && e.touches.length > 0) {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const touchY = e.touches[0].clientY;
      const distanceFromTop = touchY - rect.top;
      // Begin drag only if user starts near the top area (e.g., 36px) to avoid fighting with scroll
      if (distanceFromTop <= 36) {
        setIsDraggingNotif(true);
        setDragStartY(touchY);
        setDragOffsetY(0);
      } else {
        setIsDraggingNotif(false);
      }
    }
  };

  /**
   * Handles touch move events for notification panel drag gesture
   * Updates the drag offset for visual feedback during swipe
   */
  const handleNotifTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile() || !isDraggingNotif || dragStartY === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - dragStartY;
    setDragOffsetY(delta);
  };

  /**
   * Handles touch end events for notification panel swipe-to-close functionality
   * Closes the panel if drag distance exceeds threshold (80px)
   */
  const handleNotifTouchEnd = () => {
    if (!isMobile()) return;
    const threshold = 80;
    if (Math.abs(dragOffsetY) > threshold) {
      setShowNotifications(false);
    }
    setIsDraggingNotif(false);
    setDragStartY(null);
    setDragOffsetY(0);
  };

  // ===============================================================================
  // EVENT HANDLERS AND EFFECTS
  // ===============================================================================
  
  /**
   * Click outside handler for notification panel (desktop only)
   * On mobile, the panel closes via swipe gestures
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (isMobile()) return;
      if (showNotifications && notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  /**
   * User interaction handler to enable audio notifications
   * Required for browser autoplay policies - audio can only play after user interaction
   */
  const handleUserInteraction = useCallback(() => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true);
      // Initialize audio after user interaction
      if (!notificationSound.current) {
        notificationSound.current = new Audio('/notification.mp3');
      }
    }
  }, [hasUserInteracted]);

  // Add event listeners for user interaction
  useEffect(() => {
    const events = ['click', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [handleUserInteraction]);

  // ===============================================================================
  // REAL-TIME NOTIFICATION SYSTEM
  // ===============================================================================
  
  // Initialize session tracking when user is logged in
  useEffect(() => {
    if (user) {
      const cleanup = initializeSessionTracking();
      return cleanup; // Cleanup on unmount or user change
    }
  }, [user]);
  
  /**
   * Sets up real-time notification listener via Firestore
   * Handles notification updates, sound alerts, and automatic panel display
   */
  useEffect(() => {
    if (!user) {
      console.log('No user found, clearing notifications and skipping setup');
      setNotifications([]);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.id),
        where('read', '==', false),
        orderBy('createdAt', 'desc')
      );

      unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const changes = snapshot.docChanges();
          const newNotifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || new Date()
          })) as Notification[];

          // Check for newly added notifications to trigger sound and auto-show
          const addedDocs = changes.filter(change => change.type === 'added');
          if (addedDocs.length > 0 && hasUserInteracted) {
            // Only play sound if user has interacted and sound is not muted
            if (notificationSound.current && !isMuted) {
              notificationSound.current.play().catch(error => {
                console.warn('Failed to play notification sound:', error);
              });
            }
            setShowNotifications(true);
          }

          setNotifications(newNotifications);
        },
        (error) => {
          // Suppress permission denied errors during logout
          if (error.code !== 'permission-denied') {
            console.error('Error in notification listener:', error);
            toast.error('Failed to load notifications');
          }
        }
      );

    } catch (error: any) {
      // Suppress permission denied errors during logout
      if (error?.code !== 'permission-denied') {
        console.error('Error setting up notification listener:', error);
        toast.error('Failed to set up notifications');
      }
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      // Clear notifications when component unmounts or user changes
      setNotifications([]);
    };
  }, [user, isMuted, hasUserInteracted]);

  useEffect(() => {
    const fetchLeadDetails = async () => {
      const leadIds = notifications
        .filter(n => n.data?.leadId)
        .map(n => n.data?.leadId)
        .filter((id): id is string => id !== undefined);

      const newLeadDetails: Record<string, Lead> = { ...leadDetails };
      
      for (const leadId of leadIds) {
        if (!newLeadDetails[leadId]) {
          try {
            const leadDoc = await getDoc(doc(db, 'leads', leadId));
            if (leadDoc.exists()) {
              newLeadDetails[leadId] = {
                id: leadDoc.id,
                ...leadDoc.data()
              } as Lead;
            }
          } catch (error) {
            console.error('Error fetching lead details:', error);
          }
        }
      }
      
      setLeadDetails(newLeadDetails);
    };

    fetchLeadDetails();
  }, [notifications]);

  // ===============================================================================
  // NOTIFICATION HANDLERS
  // ===============================================================================
  
  /**
   * Handles individual notification clicks with navigation and read status updates
   * Navigates to relevant lead or number pool pages based on notification data
   */
  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.read) {
        await updateDoc(doc(db, 'notifications', notification.id), {
          read: true
        });
      }
      
      if (notification.data?.leadId) {
        navigate(`/dashboard/leads/${notification.data.leadId}`);
      } else if (notification.data?.numberId) {
        // Navigate to the number pool page and open the chat
        navigate(`/dashboard/numbers?numberId=${notification.data.numberId}`);
      }
      
      if (!isMobile()) {
        setShowNotifications(false);
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
      toast.error('Failed to process notification');
    }
  };

  /**
   * Clears all notifications at once using Firestore batch operations
   * Prevents multiple simultaneous clear operations with loading state
   */
  const handleClearAllNotifications = async () => {
    if (isClearingNotifications) return; // Prevent multiple clicks
    
    try {
      setIsClearingNotifications(true);
      const batch = writeBatch(db);
      notifications.forEach(notification => {
        if (!notification.read) {
          const notificationRef = doc(db, 'notifications', notification.id);
          batch.update(notificationRef, { read: true });
        }
      });
      await batch.commit();
      toast.success('All notifications cleared');
      if (!isMobile()) {
        setShowNotifications(false);
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Failed to clear notifications');
    } finally {
      setIsClearingNotifications(false);
    }
  };

  /**
   * Clears individual notification by marking it as read
   */
  const handleClearNotification = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
      toast.success('Notification cleared');
    } catch (error) {
      console.error('Error clearing notification:', error);
      toast.error('Failed to clear notification');
    }
  };

  // ===============================================================================
  // AUTHENTICATION HANDLERS
  // ===============================================================================
  
  /**
   * Handles user logout with proper state cleanup and Firebase sign out
   * Prevents listener errors by clearing state before authentication change
   * Clears all browser storage, cache, and IndexedDB for security
   */
  const handleLogout = async () => {
    try {
      // Log logout before clearing state
      if (user) {
        const sessionId = sessionStorage.getItem('currentSessionId');
        const sessionStartTime = sessionStorage.getItem('sessionStartTime');
        let duration: number | undefined;
        
        if (sessionStartTime) {
          duration = Math.floor((Date.now() - parseInt(sessionStartTime)) / 1000);
        }
        
        await logUserSessionAction(
          user.id,
          user.name || user.email || 'Unknown',
          user.role,
          'logout',
          'User logged out',
          {
            userEmail: user.email,
            page: window.location.pathname,
            userAgent: getUserAgentInfo(),
            deviceInfo: getDeviceInfo(),
            sessionId: sessionId || undefined,
            duration: duration
          }
        );
      }
      
      // Clear all state before signing out to prevent listener errors
      setNotifications([]);
      setLeadDetails({});
      setShowNotifications(false);
      setShowUserMenu(false);
      setDncModalOpen(false);
      setDncManagementOpen(false);
      setShowNoticeBoard(false);
      
      // Clear any timeouts
      if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        setNotificationTimeout(null);
      }
      if (userMenuTimeout) {
        clearTimeout(userMenuTimeout);
        setUserMenuTimeout(null);
      }
      if (sidebarTimeout) {
        clearTimeout(sidebarTimeout);
        setSidebarTimeout(null);
      }
      
      // Add a small delay to allow Firebase listeners to clean up
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Sign out from Firebase - this clears auth state
      await auth.signOut();
      
      // Clear only application data, NOT Firebase databases
      // Firebase needs its IndexedDB to function properly
      localStorage.clear();
      sessionStorage.clear();
      
      toast.success('Logged out successfully');
      // Do not force a full reload here; ProtectedRoute will navigate to /login once auth is cleared
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error('Failed to log out');
    }
  };

  // ===============================================================================
  // NAVIGATION CONFIGURATION
  // ===============================================================================
  
  /**
   * Navigation menu configuration with role-based visibility
   * Dynamically shows/hides menu items based on user permissions
   */
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Number Pool', href: '/dashboard/numbers', icon: PhoneCall },
    { name: 'Leads', href: '/dashboard/leads', icon: ClipboardList },
    ...(isAdmin() ? [
      { name: 'User Management', href: '/dashboard/admin/users', icon: UserCog },
      { name: 'Team Management', href: '/dashboard/admin/teams', icon: Building2 },
      { name: 'Upload Numbers', href: '/dashboard/admin/numbers/upload', icon: Upload }
    ] : []),
    ...(isManager() ? [
      { name: 'Bonus Management', href: '/dashboard/bonus-management', icon: Star }
    ] : []),
    ...(user?.role !== 'agent' && user?.role !== 'freelancer' ? [
      { name: 'Settings', href: '/dashboard/settings', icon: Settings }
    ] : []),
  ];

  // ===============================================================================
  // NOTIFICATION RENDERING
  // ===============================================================================
  
  /**
   * Renders individual notification content with lead details and proper formatting
   * Displays different styles for chat messages vs system notifications
   */
  const renderNotificationContent = (notification: Notification) => {
    const lead = notification.data?.leadId ? leadDetails[notification.data.leadId] : null;
    const isChatMessage = notification.type === 'chat_message';
    
    return (
      <div className="space-y-2">
        {/* Compact Header with inline badge */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900 leading-tight flex-1 pr-2">
            {notification.title}
          </h4>
          <div className={clsx(
            "flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
            isChatMessage ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
          )}>
            <MessageSquare className="h-3 w-3 mr-1" />
            {isChatMessage ? "Chat" : "System"}
          </div>
        </div>

        {/* Compact Lead Information with icons */}
        {lead && (
          <div className="bg-gray-50 rounded-md p-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-gray-600 font-medium">
                <User className="h-3 w-3" />
                <span>{lead.customerName}</span>
              </div>
              <div className="flex items-center space-x-1 text-gray-800">
                <Phone className="h-3 w-3" />
                <span>{lead.customerNumber}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-indigo-600 font-medium">
                <Hash className="h-3 w-3" />
                <span>{lead.plans?.[0]?.number || 'No number'}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity className="h-3 w-3" />
                <span className={clsx(
                  "px-1.5 py-0.5 rounded text-xs font-medium",
                  getStatusColor(lead.status)
                )}>
                  {lead.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Compact Message with icon */}
        <div className={clsx(
          "p-2 rounded-md text-xs leading-relaxed",
          isChatMessage 
            ? "bg-red-50 border border-red-200 text-red-800" 
            : "bg-blue-50 border border-blue-200 text-blue-800"
        )}>
          <div className="flex items-start space-x-1.5">
            <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <p className="whitespace-pre-wrap break-words flex-1">
              {notification.message}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ===============================================================================
  // MAIN RENDER - COMPLETE LAYOUT STRUCTURE
  // ===============================================================================
  
  /**
   * Main layout render providing:
   * - Top navigation bar with glass morphism effects
   * - Responsive sidebar with hover interactions
   * - Notification system with mobile swipe gestures
   * - User menu and authentication controls
   * - Main content area with outlet for page components
   * - Mobile bottom navigation bar
   * - Integrated modals and tools
   */
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eff3ff] via-[#e4e7ff] to-[#fef6ff]">

      {/* Universal dark-mode overlay — uses backdrop-filter so it inverts every
          compositor layer (including framer-motion transform layers) at the GPU
          compositing stage, which CSS filter on <html> cannot reach. */}
      {isDarkMode && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483646,
            backdropFilter: 'invert(1) hue-rotate(180deg)',
            WebkitBackdropFilter: 'invert(1) hue-rotate(180deg)',
            pointerEvents: 'none',
            background: 'transparent',
          }}
        />
      )}

      {/* Top Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="bg-white/80 backdrop-blur-lg border-b border-gray-200/80 shadow-sm">
          <div className="flex h-12 items-center justify-between px-4">
            {/* Left side */}
            <div className="flex items-center space-x-4">
                <div 
                  className="relative py-8 px-6 -my-2 -mx-2"
                  onMouseEnter={() => {
                    // Clear any pending close timeout
                    if (sidebarTimeout) {
                      clearTimeout(sidebarTimeout);
                      setSidebarTimeout(null);
                    }
                    setIsSidebarOpen(true);
                  }}
                  onMouseLeave={() => {
                    // Only auto-close on desktop, with a delay to allow mouse to move to sidebar
                    // Increased delay to 300ms to give more time to reach sidebar
                    if (window.innerWidth >= 768) {
                      const timeout = setTimeout(() => setIsSidebarOpen(false), 300);
                      setSidebarTimeout(timeout);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(open => !open)}
                    className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors relative z-10"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-semibold text-gray-900"></h1>
              </div>
              {/* Navigation Buttons */}
              <div className="hidden md:flex items-center space-x-2 ml-4">
                <Link
                  to="/dashboard"
                  className={clsx(
                    "group relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ease-out touch-manipulation",
                    "active:scale-95 active:transition-transform active:duration-100"
                  )}
                >
                  {/* Glass effect overlay */}
                  <div className={clsx(
                    "absolute inset-0 rounded-xl transition-all duration-300 ease-out",
                    location.pathname === '/dashboard'
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 border-indigo-400/60 shadow-indigo-500/20"
                      : "bg-gradient-to-r from-white/60 to-white/30 backdrop-blur-sm border-white/40 shadow-lg group-hover:from-white/80 group-hover:to-white/60 group-hover:shadow-xl group-hover:border-white/60"
                  )} />
                  
                  <div className={clsx(
                    "relative z-10 flex items-center space-x-2",
                    location.pathname === '/dashboard' ? "text-white" : "text-gray-600"
                  )}>
                    <LayoutDashboard className="h-4 w-4 transition-transform duration-300 group-active:scale-110" />
                    <span>Dashboard</span>
                  </div>
                </Link>
                <Link
                  to="/dashboard/numbers"
                  className={clsx(
                    "group relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ease-out touch-manipulation",
                    "active:scale-95 active:transition-transform active:duration-100"
                  )}
                >
                  {/* Glass effect overlay */}
                  <div className={clsx(
                    "absolute inset-0 rounded-xl transition-all duration-300 ease-out",
                    location.pathname === '/dashboard/numbers'
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 border-indigo-400/60 shadow-indigo-500/20"
                      : "bg-gradient-to-r from-white/60 to-white/30 backdrop-blur-sm border-white/40 shadow-lg group-hover:from-white/80 group-hover:to-white/60 group-hover:shadow-xl group-hover:border-white/60"
                  )} />
                  
                  <div className={clsx(
                    "relative z-10 flex items-center space-x-2",
                    location.pathname === '/dashboard/numbers' ? "text-white" : "text-gray-600"
                  )}>
                    <PhoneCall className="h-4 w-4 transition-transform duration-300 group-active:scale-110" />
                    <span>Number Pool</span>
                  </div>
                </Link>
                <Link
                  to="/dashboard/leads"
                  className={clsx(
                    "group relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ease-out touch-manipulation",
                    "active:scale-95 active:transition-transform active:duration-100"
                  )}
                >
                  {/* Glass effect overlay */}
                  <div className={clsx(
                    "absolute inset-0 rounded-xl transition-all duration-300 ease-out",
                    location.pathname === '/dashboard/leads'
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 border-indigo-400/60 shadow-indigo-500/20"
                      : "bg-gradient-to-r from-white/60 to-white/30 backdrop-blur-sm border-white/40 shadow-lg group-hover:from-white/80 group-hover:to-white/60 group-hover:shadow-xl group-hover:border-white/60"
                  )} />
                  
                  <div className={clsx(
                    "relative z-10 flex items-center space-x-2",
                    location.pathname === '/dashboard/leads' ? "text-white" : "text-gray-600"
                  )}>
                    <ClipboardList className="h-4 w-4 transition-transform duration-300 group-active:scale-110" />
                    <span>Leads</span>
                  </div>
                </Link>
                {(user?.role === 'agent' || user?.role === 'freelancer') && (
                <Link
                  to="/dashboard/leads/create"
                  className={clsx(
                    "group relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ease-out touch-manipulation",
                    "active:scale-95 active:transition-transform active:duration-100"
                  )}
                >
                  {/* Glass effect overlay */}
                  <div className={clsx(
                    "absolute inset-0 rounded-xl transition-all duration-300 ease-out",
                    location.pathname === '/dashboard/leads/create'
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 border-indigo-400/60 shadow-indigo-500/20"
                      : "bg-gradient-to-r from-white/60 to-white/30 backdrop-blur-sm border-white/40 shadow-lg group-hover:from-white/80 group-hover:to-white/60 group-hover:shadow-xl group-hover:border-white/60"
                  )} />
                  
                  <div className={clsx(
                    "relative z-10 flex items-center space-x-2",
                    location.pathname === '/dashboard/leads/create' ? "text-white" : "text-gray-600"
                  )}>
                    <PlusCircle className="h-4 w-4 transition-transform duration-300 group-active:scale-110" />
                    <span>Submit Lead</span>
                  </div>
                </Link>
                )}
              </div>
            </div>

            {/* MAR Strip for Agents - Integrated in Header */}
            {user && user.role === 'agent' && location.pathname !== '/dashboard' && (
              <div className="hidden lg:flex items-center mx-4">
                <MARStrip user={user} />
              </div>
            )}

            {/* Right side items */}
            <div className="flex items-center space-x-4 relative"> {/* <-- add relative here for user menu */}
              {/* Dark mode toggle */}
              <button
                type="button"
                onClick={() => setIsDarkMode(d => !d)}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white/60 transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Delivery Schedule Button in header (hidden for agents, moved to sidebar) */}
              {user?.role !== 'agent' && (
              <button
                className="group relative px-3 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 ease-out touch-manipulation active:scale-95 active:transition-transform active:duration-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 flex items-center justify-center"
                onClick={() => setShowNoticeBoard(true)}
                aria-label="Open Delivery Schedule Notice Board"
              >
                {/* Glass effect overlay */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 backdrop-blur-sm border border-indigo-400/60 shadow-lg shadow-indigo-500/20 transition-all duration-300 ease-out group-hover:shadow-xl group-hover:shadow-indigo-500/30 group-hover:border-indigo-300/80" />
                
                <div className="relative z-10 flex items-center sm:space-x-2">
                  <Calendar className="w-4 h-4 transition-transform duration-300 group-active:scale-110" />
                  <span className="hidden sm:inline whitespace-nowrap">Schedule</span>
                </div>
              </button>
              )}
              
              {/* WhatsApp & DNC Buttons - Only for Agents and Freelancers */}
              {(user?.role === 'agent' || user?.role === 'freelancer') && (
                <>
                  <button
                    onClick={() => {
                      setDncDefaultTab('single');
                      setDncModalOpen(true);
                    }}
                    className="group relative px-3 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 ease-out touch-manipulation active:scale-95 active:transition-transform active:duration-100 focus:outline-none focus:ring-2 focus:ring-green-300 flex items-center justify-center"
                    aria-label="WhatsApp Lookup"
                  >
                    {/* Glass effect overlay */}
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 backdrop-blur-sm border border-green-400/60 shadow-lg shadow-green-500/20 transition-all duration-300 ease-out group-hover:shadow-xl group-hover:shadow-green-500/30 group-hover:border-green-300/80" />
                    
                    <div className="relative z-10 flex items-center sm:space-x-2">
                      <MessageSquare className="w-4 h-4 transition-transform duration-300 group-active:scale-110" />
                      <span className="hidden sm:inline whitespace-nowrap">WhatsApp Lookup</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setDncManagementOpen(true)}
                    className="group relative px-3 py-2 rounded-xl text-white text-sm font-medium transition-all duration-300 ease-out touch-manipulation active:scale-95 active:transition-transform active:duration-100 focus:outline-none focus:ring-2 focus:ring-red-300 flex items-center justify-center"
                    aria-label="DNC Management"
                  >
                    {/* Glass effect overlay */}
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-500 to-red-600 backdrop-blur-sm border border-red-400/60 shadow-lg shadow-red-500/20 transition-all duration-300 ease-out group-hover:shadow-xl group-hover:shadow-red-500/30 group-hover:border-red-300/80" />
                    
                    <div className="relative z-10 flex items-center sm:space-x-2">
                      <svg className="w-4 h-4 transition-transform duration-300 group-active:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                      </svg>
                      <span className="hidden sm:inline whitespace-nowrap">DNC</span>
                    </div>
                  </button>
                </>
              )}
              
              {/* Notifications - Fixed hover area including dropdown */}
              <div className="relative">
                <div
                  onMouseEnter={() => {
                    if (notificationTimeout) clearTimeout(notificationTimeout);
                    setShowNotifications(true);
                  }}
                  onMouseLeave={() => {
                    // Longer delay to allow smooth transition to dropdown
                    const timeout = setTimeout(() => setShowNotifications(false), 500);
                    setNotificationTimeout(timeout);
                  }}
                  onTouchStart={() => {
                    // Toggle notifications on touch for mobile
                    setShowNotifications(!showNotifications);
                  }}
                  className="relative"
                >
                  <button
                    className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors relative touch-manipulation"
                  >
                    <Bell className="h-5 w-5" />
                    {notifications.length > 0 && (
                      <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
                    )}
                  </button>

                  {/* FIXED: Notification Dropdown now inside hover area */}
                  {showNotifications && (
                    <div 
                      ref={notificationsRef}
                      className="fixed sm:absolute sm:top-full sm:mt-2 top-16 right-4 left-4 sm:right-0 sm:left-auto bg-white rounded-2xl shadow-2xl border border-gray-200 max-h-[calc(100vh-5rem)] flex flex-col z-[60] p-4 w-auto sm:w-96"
                      style={{ transform: isMobile() ? `translateY(${dragOffsetY}px)` : undefined, transition: isDraggingNotif ? 'none' : 'transform 200ms ease' }}
                      onTouchStart={handleNotifTouchStart}
                      onTouchMove={handleNotifTouchMove}
                      onTouchEnd={handleNotifTouchEnd}
                      onMouseEnter={() => {
                        // Clear timeout when mouse enters dropdown
                        if (!isMobile() && notificationTimeout) clearTimeout(notificationTimeout);
                      }}
                      onMouseLeave={() => {
                        // Auto-hide after 3 seconds when mouse leaves dropdown
                        if (!isMobile()) {
                          const timeout = setTimeout(() => setShowNotifications(false), 3000);
                          setNotificationTimeout(timeout);
                        }
                      }}
                    >
                      {/* Drag handle for mobile */}
                      <div className="sm:hidden flex justify-center mb-2">
                        <div className="h-1.5 w-12 rounded-full bg-gray-300" />
                      </div>
                      <div className="pb-4 border-b border-gray-200 flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => setIsMuted(!isMuted)}
                              className="p-1.5 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </button>
                            {notifications.some(n => !n.read) && (
                              <button
                                onClick={handleClearAllNotifications}
                                disabled={isClearingNotifications}
                                className="text-sm text-gray-500 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isClearingNotifications ? 'Clearing...' : 'Clear all'}
                              </button>
                            )}
                            {/* Mobile close button */}
                            <button
                              onClick={() => setShowNotifications(false)}
                              className="p-1.5 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors sm:hidden"
                              aria-label="Close notifications"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center text-gray-500">
                            No new notifications
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {notifications.map((notification) => (
                              <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className="bg-white rounded-xl shadow p-4 mb-3 hover:bg-gray-50 cursor-pointer transition-colors break-all whitespace-pre-line"
                              >
                                {renderNotificationContent(notification)}
                                <div className="mt-2 text-xs text-gray-500">
                                  {format(notification.createdAt, 'MMM d, h:mm a')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* User Menu */}
              <div className="relative"
                onMouseEnter={() => {
                  if (window.innerWidth < 768) return; // desktop hover only
                  if (userMenuTimeout) clearTimeout(userMenuTimeout);
                  setShowUserMenu(true);
                }}
                onMouseLeave={() => {
                  if (window.innerWidth < 768) return; // desktop hover only
                  const timeout = setTimeout(() => setShowUserMenu(false), 300);
                  setUserMenuTimeout(timeout);
                }}
              >
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  className="flex items-center space-x-2 p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-indigo-600">
                      {user?.email?.[0].toUpperCase()}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </button>

                {showUserMenu && (
                  <>
                    {/* Invisible backdrop to close on outside tap (mobile) */}
                    <div className="fixed inset-0 z-10 md:hidden" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p className="text-sm font-medium bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        {user?.name || user?.email}
                      </p>
                      <p className="text-xs text-gray-500">{isAdmin() ? 'Administrator' : 'User'}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setIsLogoutDialogOpen(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        className={clsx(
          "sidebar-container fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out",
          !isSidebarOpen && "-translate-x-full"
        )}
        onMouseEnter={() => {
          // Mark that mouse is over sidebar
          isMouseOverSidebarRef.current = true;
          // Clear any pending close timeout when mouse enters sidebar
          if (sidebarTimeout) {
            clearTimeout(sidebarTimeout);
            setSidebarTimeout(null);
          }
          // Only auto-open on desktop (md and up)
          if (window.innerWidth >= 768) {
            setIsSidebarOpen(true);
          }
        }}
        onMouseMove={() => {
          // Keep sidebar open as long as mouse is moving within sidebar
          isMouseOverSidebarRef.current = true;
          if (sidebarTimeout) {
            clearTimeout(sidebarTimeout);
            setSidebarTimeout(null);
          }
        }}
        onMouseLeave={() => {
          // Mark that mouse left sidebar
          isMouseOverSidebarRef.current = false;
          // Only auto-close on desktop (md and up), with increased delay
          // Use a longer delay (1000ms) and double-check mouse position before closing
          if (window.innerWidth >= 768) {
            const timeout = setTimeout(() => {
              // Double-check: only close if mouse is still not over sidebar
              if (!isMouseOverSidebarRef.current && sidebarRef.current) {
                setIsSidebarOpen(false);
              }
            }, 1000);
            setSidebarTimeout(timeout);
          }
        }}
      >
        {/* Extended hover area at top to bridge gap with hamburger */}
        <div 
          className="absolute top-0 left-0 right-0 h-20 -mt-20"
          onMouseEnter={(e) => {
            e.stopPropagation();
            isMouseOverSidebarRef.current = true;
            // Clear any pending close timeout
            if (sidebarTimeout) {
              clearTimeout(sidebarTimeout);
              setSidebarTimeout(null);
            }
            setIsSidebarOpen(true);
          }}
        />
        <div 
          className="h-16 flex items-center justify-between px-4 border-b border-gray-200"
          onMouseEnter={() => {
            isMouseOverSidebarRef.current = true;
            // Keep sidebar open when hovering over header
            if (sidebarTimeout) {
              clearTimeout(sidebarTimeout);
              setSidebarTimeout(null);
            }
            if (window.innerWidth >= 768) {
              setIsSidebarOpen(true);
            }
          }}
        >
          <h2 className="text-xl font-semibold text-gray-900">Menu</h2>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav 
          className="p-4 space-y-2"
          onMouseEnter={() => {
            isMouseOverSidebarRef.current = true;
            // Keep sidebar open when hovering over navigation
            if (sidebarTimeout) {
              clearTimeout(sidebarTimeout);
              setSidebarTimeout(null);
            }
            if (window.innerWidth >= 768) {
              setIsSidebarOpen(true);
            }
          }}
        >
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onMouseEnter={() => {
                  isMouseOverSidebarRef.current = true;
                  // Keep sidebar open when hovering over navigation items
                  if (sidebarTimeout) {
                    clearTimeout(sidebarTimeout);
                    setSidebarTimeout(null);
                  }
                  if (window.innerWidth >= 768) {
                    setIsSidebarOpen(true);
                  }
                }}
                onClick={() => {
                  // Auto-close sidebar on mobile when navigation item is clicked
                  if (window.innerWidth < 768) {
                    setIsSidebarOpen(false);
                  }
                }}
                className={clsx(
                  "group relative flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out touch-manipulation",
                  "active:scale-95 active:transition-transform active:duration-100"
                )}
              >
                {/* Glass effect overlay */}
                <div className={clsx(
                  "absolute inset-0 rounded-xl transition-all duration-300 ease-out",
                  "bg-gradient-to-r from-white/40 to-white/20 backdrop-blur-sm",
                  "border border-white/30 shadow-md",
                  isActive
                    ? "bg-gradient-to-r from-indigo-100/80 to-indigo-50/60 border-indigo-200/60 shadow-indigo-200/50"
                    : "group-active:from-white/60 group-active:to-white/40 group-active:shadow-lg group-active:border-white/50"
                )} />
                
                {/* Content */}
                <div className={clsx(
                  "relative z-10 flex items-center space-x-3",
                  isActive ? "text-indigo-600" : "text-gray-600"
                )}>
                  <item.icon className="h-5 w-5 transition-transform duration-300 group-active:scale-110" />
                  <span className="font-medium transition-all duration-300">{item.name}</span>
                </div>
              </Link>
            );
          })}

          {user?.role === 'agent' && (
            <button
              type="button"
              onClick={() => {
                setShowNoticeBoard(true);
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setIsSidebarOpen(false);
                }
              }}
              className="group relative flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out touch-manipulation w-full text-left active:scale-95 active:transition-transform active:duration-100"
            >
              <div className="absolute inset-0 rounded-xl transition-all duration-300 ease-out bg-gradient-to-r from-white/40 to-white/20 backdrop-blur-sm border border-white/30 shadow-md group-hover:from-white/60 group-hover:to-white/40 group-hover:shadow-lg group-hover:border-white/50" />
              <div className={clsx(
                "relative z-10 flex items-center space-x-3",
                "text-gray-600 group-active:text-gray-700 group-hover:text-gray-700"
              )}>
                <Calendar className="h-5 w-5 transition-transform duration-300 group-active:scale-110" />
                <span className="font-medium transition-all duration-300">Schedule</span>
              </div>
            </button>
          )}
        </nav>
      </div>

      {/* Main Content */}
      <div className={clsx(
        "transition-all duration-200 ease-in-out",
        // Only apply margin on desktop (md and up), not on mobile
        isSidebarOpen ? "md:ml-64" : "md:ml-0",
        "px-0 sm:px-4 md:px-6 lg:px-8 pt-12"
      )}>
        <div className="min-h-screen w-full max-w-7xl mx-auto flex flex-col">
          <div className="flex-1">
          <Outlet />
          </div>
          
          {/* Minimalist Footer */}
          <footer className="mt-0 pt-1.5 pb-20 md:pb-2 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded text-xs sm:text-sm">CRM</span>
                <span className="hidden sm:inline text-gray-400">Customer Relationship Management •</span>
                <span>v1.0</span>
              </div>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </footer>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <nav
        className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          contain: 'layout style',
          isolation: 'isolate',
        }}
        aria-label="Main navigation"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/70 shadow-[0_-2px_20px_rgba(0,0,0,0.06)]" aria-hidden />
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent pointer-events-none" aria-hidden />

        {/* Items */}
        <div className="relative flex items-stretch justify-around" style={{ height: '60px' }}>
          {[
            { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard' },
            { to: '/dashboard/numbers', icon: PhoneCall,        label: 'Numbers'   },
            { to: '/dashboard/leads',   icon: ClipboardList,   label: 'Leads'     },
          ].map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className="group relative flex flex-col items-center justify-center flex-1 touch-manipulation select-none active:scale-95 transition-transform duration-150"
              >
                {/* Sliding active pill */}
                {isActive && (
                  <motion.div
                    layoutId="mobileNavPill"
                    className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-indigo-50 border border-indigo-100/80"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}

                {/* Icon */}
                <motion.div
                  animate={isActive ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="relative z-10 mb-0.5"
                >
                  <Icon
                    strokeWidth={isActive ? 2.5 : 1.8}
                    className={clsx(
                      'w-[22px] h-[22px] transition-colors duration-200',
                      isActive ? 'text-indigo-600' : 'text-gray-400 group-active:text-gray-600'
                    )}
                  />
                  {/* Glow under icon when active */}
                  {isActive && (
                    <div className="absolute inset-0 bg-indigo-400/25 blur-[6px] -z-10 rounded-full" />
                  )}
                </motion.div>

                {/* Label */}
                <span
                  className={clsx(
                    'relative z-10 text-[10px] font-semibold leading-none tracking-tight transition-colors duration-200',
                    isActive ? 'text-indigo-600' : 'text-gray-400 group-active:text-gray-600'
                  )}
                >
                  {label}
                </span>

                {/* Active dot at very top edge */}
                {isActive && (
                  <motion.div
                    layoutId="mobileNavDot"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Logout Confirmation Dialog */}
      <Transition appear show={isLogoutDialogOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsLogoutDialogOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Confirm Sign Out
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      Are you sure you want to sign out? Any unsaved changes will be lost.
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end space-x-3">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setIsLogoutDialogOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        setIsLogoutDialogOpen(false);
                        handleLogout();
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Toaster
        position={window.innerWidth < 640 ? 'bottom-center' : 'top-right'}
        toastOptions={{
          className: 'fixed left-0 right-0 bottom-4 w-full max-w-full rounded-xl shadow-lg text-center break-all whitespace-pre-line text-sm sm:text-base px-2 py-3 sm:px-6 sm:py-4 z-[9999] mx-0',
          style: {
            background: '#222',
            color: '#fff',
            fontSize: window.innerWidth < 640 ? '1rem' : '1.05rem',
            borderRadius: '1rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          },
          duration: 4000,
        }}
      />
      
      {/* AI Assistant Floating Button */}
      <TranslationChat />

      {/* NoticeBoard Modal Popup */}
      {showNoticeBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 animate-fade-in">
          <NoticeBoard onClose={() => setShowNoticeBoard(false)} />
        </div>
      )}

      {/* WhatsApp Number Lookup Modal */}
      <DNCCheckModal 
        isOpen={dncModalOpen} 
        onClose={() => setDncModalOpen(false)} 
        defaultTab={dncDefaultTab}
      />

      {/* DNC Management Modal */}
      {dncManagementOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl px-5 py-4 text-sm text-gray-600 shadow-lg">Loading DNC Management...</div>
            </div>
          }
        >
          <DNCManagement
            isOpen={dncManagementOpen}
            onClose={() => setDncManagementOpen(false)}
          />
        </Suspense>
      )}

      {/* Broadcast Poster (global premium announcement) */}
      <BroadcastPoster />
    </div>
  );
}

/**
 * ===============================================================================
 * UTILITY FUNCTION - STATUS COLOR MAPPING
 * ===============================================================================
 * 
 * Maps lead status strings to appropriate Tailwind CSS color classes
 * Used for consistent status display throughout the notification system
 */
function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'verified':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'pending_verification':
      return 'bg-yellow-100 text-yellow-800';
    case 'non_verified':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
