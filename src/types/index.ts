/**
 * ===============================================================================
 * TYPE DEFINITIONS - CRM SYSTEM TYPE DEFINITIONS
 * ===============================================================================
 * 
 * This module contains all TypeScript type definitions and interfaces used
 * throughout the CRM system. It ensures type safety and provides clear
 * contracts for data structures across the application.
 * 
 * MAIN CATEGORIES:
 * 
 * 1. USER MANAGEMENT TYPES
 *    - UserRole: Defines all possible user roles in the system
 *    - User: Main user interface with role-based properties
 * 
 * 2. NUMBER POOL TYPES
 *    - NumberStatus: All possible states for phone numbers in the pool
 *    - NumberPool: Core number pool document structure
 *    - NumberPoolType: Extended number pool type with additional fields
 * 
 * 3. LEAD MANAGEMENT TYPES
 *    - Lead: Complete lead structure with customer and plan information
 *    - CustomerNumber: Customer contact number structure
 *    - VerificationMedia: Media attachments for lead verification
 * 
 * 4. TEAM AND PERFORMANCE TYPES
 *    - Team: Team structure with manager and member relationships
 *    - CommissionConfig: Commission configuration per team
 *    - PerformanceMetrics: User performance tracking data
 * 
 * 5. COMMUNICATION TYPES
 *    - ChatMessage: In-app messaging system structure
 *    - Notification: System notification structure
 * 
 * 6. BUSINESS OPERATIONS TYPES
 *    - Invoice interfaces for billing and payroll
 *    - Plan and PlanCategory for service/product management
 *    - TrustedDevice for security and device management
 * 
 * USAGE:
 * Import specific types or interfaces as needed in components and services.
 * All types are designed to match Firestore document structures exactly.
 * ===============================================================================
 */

// ===============================================================================
// USER ROLE AND PERMISSION TYPES
// ===============================================================================

/**
 * Defines all possible user roles in the CRM system
 * Each role has specific permissions and access levels
 */
export type UserRole = 'agent' | 'verifier' | 'coordinator' | 'manager' | 'admin' | 'freelancer';

/**
 * Defines coordinator group types that determine which number groups
 * a coordinator can manage
 */
export type CoordinatorType = 'g1' | 'g2' | 'g3' | 'all';

/**
 * Optional list of team IDs a coordinator is responsible for.
 * When set, coordinator can see leads from these teams regardless of number group.
 */
export type CoordinatorTeams = string[];

/**
 * Defines verifier group types that determine which number groups
 * a verifier can process
 */
export type VerifierType = 'g1' | 'g2' | 'g3' | 'all';

/**
 * Array of verifier groups that a verifier can handle
 * Allows verifiers to work with multiple groups
 */
export type VerifierGroups = VerifierType[];

// ===============================================================================
// NUMBER POOL STATUS TYPES
// ===============================================================================

/**
 * Defines all possible states for phone numbers in the number pool
 * Each status represents a specific stage in the number lifecycle
 */
export type NumberStatus =
  | 'open'                    // Available for reservation
  | 'reserved'               // Temporarily reserved by an agent
  | 'pending_verification'   // Awaiting verification by verifier
  | 'verified'              // Successfully verified
  | 'assigned'              // Assigned to a customer/lead
  | 'activated'             // Active and in use
  | 'follow_up'             // Requires follow-up action
  | 'later'                 // Marked for later action
  | 'rejected'              // Rejected during verification
  | 'claimed'               // Claimed by an agent
  | 'non_verified'   // Non verified (previously follow-up verification)
  | 'returned';      // Returned/deleted from the pool

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  allowedGroups?: string[]; // Groups the user is allowed to access (e.g., G1/G2)
  teamId?: string; // For agents
  managerId?: string; // For agents
  phoneNumbers?: string[]; // Array of phone numbers for managers
  coordinatorType?: CoordinatorType; // For coordinators - which groups they handle
  coordinatorTeams?: CoordinatorTeams; // For coordinators - which teams' leads they can see
  verifierGroups?: VerifierGroups; // For verifiers - which groups they handle (multiple groups)
  managedTeams?: string[]; // For multi-team managers - array of team IDs they can manage
  isActive?: boolean; // User active status - inactive users cannot login (default: true)
  createdAt: Date;
  updatedAt: Date;
}

export interface NumberPool {
  id: string;
  number: string;
  category: 'Standard' | 'Silver' | 'Silver Plus' | 'Gold' | 'Gold Plus' | 'Platinum';
  code: string;
  group?: string; // Group field for future use
  passcode?: string; // Optional passcode field for coordinators and admins
  teamVisibility?: string; // Team ID for restricted visibility (coordinators only)
  visibleToFreelancers?: boolean; // Control visibility for freelancer users
  status: NumberStatus;
  reservedBy?: string;
  reservedAt?: Date;
  lastStatusChange: Date;
  createdAt?: Date; // Timestamp when the number was added to the pool
  expiresAt?: Date; // For reserved numbers
  claimingAgentId?: string;
  claimingStartedAt?: Date;
  claimingExpiresAt?: Date;
  originalAgentId?: string;
  originalReservedAt?: Date;
  originalExpiresAt?: Date;
  reservationCount?: number; // Number of times this number has been reserved
  claimCount?: number; // Number of times this number has been claimed
  leadId?: string; // Lead ID when number is assigned to a lead
  claimQueue?: {
    agentId: string;
    claimedAt: Date;
  }[]; // Queue of agents who have claimed the number
  statusCheck?: {
    status: 'available' | 'unavailable' | 'pending';
    expiresAt?: Date;
  };
  last2Digits?: string; // Last 2 digits for "ends with" search
  last3Digits?: string; // Last 3 digits for "ends with" search
  last4Digits?: string; // Last 4 digits for "ends with" search
  last5Digits?: string; // Last 5 digits for "ends with" search
  struckThrough?: boolean; // Indicates if number should be displayed with strike-through (active number)
}

export interface NumberPoolType {
  id: string;
  number: string;
  initials?: string;
  category: string;
  code: string;
  group?: string;
  passcode?: string; // Optional passcode field for coordinators and admins
  teamVisibility?: string; // Team ID for restricted visibility (coordinators only)
  visibleToFreelancers?: boolean; // Control visibility for freelancer users
  status: NumberStatus;
  reservedBy?: string;
  reservedAt?: Date;
  expiresAt?: Date;
  lastStatusChange?: Date;
  claimingAgentId?: string;
  claimingStartedAt?: Date;
  claimingExpiresAt?: Date;
  originalAgentId?: string;
  originalReservedAt?: Date;
  originalExpiresAt?: Date;
  lastClaimedAt?: Date;
  claimedAt?: Date;
  leadId?: string; // Lead ID when number is assigned to a lead
  claims?: Array<{
    userId: string;
    claimedAt: Date;
    status: 'pending' | 'completed' | 'cancelled';
  }>;
  claimQueue?: Array<{
    agentId: string;
    claimedAt: Date;
  }>;
  last2Digits?: string; // Last 2 digits for "ends with" search
  last3Digits?: string; // Last 3 digits for "ends with" search
  last4Digits?: string; // Last 4 digits for "ends with" search
  last5Digits?: string; // Last 5 digits for "ends with" search
  struckThrough?: boolean; // Indicates if number should be displayed with strike-through (active number)
}

/**
 * Deleted/Returned Number - stores numbers that were deleted from numberPool
 * Contains all original number data plus deletion metadata
 */
export interface DeletedNumber extends NumberPool {
  deletedAt: Date;
  originalId: string;
  originalCollection: 'numberPool';
  status: 'returned';
}

/**
 * Activated Number - stores numbers that were activated from numberPool
 * Contains all original number data plus activation metadata
 */
export interface ActivatedNumber extends NumberPool {
  activatedAt: Date;
  activatedBy: string;
  originalId: string;
  originalCollection: 'numberPool';
  leadId: string; // The lead that activated this number
  status: 'activated';
}

export interface CustomerNumber {
  number: string;
  alternativeNumber?: string;
}

interface VerificationMedia {
  url: string;
  type: 'image' | 'video' | 'audio' | 'pdf';
  name: string;
  azureUrl?: string;
}

export interface Lead {
  id: string;
  numberId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  plan: string;
  status: string;
  agentId: string;
  agentName?: string;
  teamName?: string;
  verifierId: string;
  coordinatorId: string;
  assignmentId: string;
  teamId: string;
  managerId: string | null;
  managerAssigned?: boolean; // True when manager has assigned the verified lead
  managerNotes?: string; // Manager's assignment notes
  manager?: {
    id: string;
    name: string;
    role: UserRole;
    phoneNumbers?: string[];
    phoneNumber?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  startDate: Date;
  notes: string;
  followUpDate: Date;
  verificationNotes: string;
  coordinatorNotes: string;
  rejectionReason: string;
  customerNumber: string;
  country: string;
  customerAge: number;
  productType: string;
  gender: string;
  emirate: string;
  area: string;
  hasEmirateId: boolean;
  advancePayment: boolean;
  language: string;
  sharedWith: string[];
  latitude: number;
  longitude: number;
  locationUrl: string;
  confirmLocationUrl: boolean;
  startTime: string;
  numberType: string;
  remarks: string;
  homeWifiEmail?: string;
  homeWifiId?: string;
  plans: {
    numberId: string;
    number: string;
    plan: string;
    category: string;
    group?: string;
    type: string;
    status: string;
  }[];
  verificationMedia: (string | VerificationMedia)[];
  customerNumbers?: CustomerNumber[];
  etisalatLeadId?: string;
  scheduledFor?: Date; // Date when lead should appear in unassigned for coordinator
  leadNumber?: string; // Sequential lead number in format: TEAMNAME-SEQUENCE-MMMYY (e.g., ETS-100-NOV25)
  leadNumberGeneratedAt?: Date; // Timestamp when lead number was generated
  pendingVerificationAtLocation?: boolean; // True when verifier verified at location - lead proceeds to coordinator but still pending verification
  verifiedAt?: Date; // Timestamp when lead was verified
  followUpAt?: Date; // Timestamp when lead status changed to follow_up
}

export interface ChatMessage {
  id: string;
  leadId?: string;
  numberId?: string;
  userId: string;
  userRole: UserRole;
  message: string;
  createdAt: Date;
  readBy: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file' | 'pdf';
  durationMs?: number;
}

export interface Team {
  id: string;
  name: string;
  managerId: string;
  commissionBased?: boolean;
  isFreelancerTeam?: boolean;
  managerName?: string;
  members?: User[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionConfig {
  id: string;
  teamId: string;
  standard: number;
  silver: number;
  silverPlus: number;
  gold: number;
  goldPlus: number;
  platinum: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'number_expiring' | 'lead_update' | 'new_lead' | 'new_message' | 'performance_update' | 'chat_message';
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  data?: {
    leadId?: string;
    numberId?: string;
    messageId?: string;
    chatMessageId?: string;
  };
}

export interface PerformanceMetrics {
  id: string;
  userId: string;
  teamId?: string;
  metrics: {
    totalLeads: number;
    verifiedLeads: number;
    rejectedLeads: number;
    activatedLeads: number;
    followUpLeads: number;
  };
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

export type NotificationType =
  | 'new_lead'
  | 'lead_update'
  | 'new_message'
  | 'performance_update'
  | 'number_expiring'
  | 'chat_message'
  | 'number_claimed';

// Invoice related types
export interface InvoiceConfiguration {
  id: string;
  teamId: string;
  officeName: string;
  officeAddress: string;
  recipientName: string;
  recipientAddress: string;
  placeOfSupply: string;
  termsOfPayment: string;
  taxNotes?: string;
  applyGst: boolean;
  logoUrl?: string;
  signatureUrl?: string;
  taxInformation: {
    gstin: string;
    pan: string;
    otherTaxes?: string;
  };
  bankDetails: {
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    branchName?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface InvoiceItem {
  srNo: number;
  description: string;
  hsnSacCode: string;
  daysOrNos: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  teamId: string;
  employeeId: string;
  employeeName: string;
  month: string;
  invoiceDate: Date;
  invoicePeriod: string;
  items: InvoiceItem[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  configuration: InvoiceConfiguration;
  generatedBy: string;
  generatedAt: Date;
  status: 'draft' | 'sent' | 'paid';
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  teamId: string;
  template: {
    headerColor: string;
    borderStyle: 'simple' | 'double' | 'decorative';
    fontSize: number;
    includeLogo: boolean;
    logoUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollCalculation {
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  attendanceDays: number;
  totalDays: number;
  leaveDeductions: number;
  bonuses: number;
  netSalary: number;
  month: string;
  achievementPercentage?: number;
  target?: number;
  achieved?: number;
}

export interface Plan {
  id: string;
  name: string;
  category: string;
  description: string;
  benefits: string; // Benefits for WhatsApp verification
  amount: string; // Monthly amount
  duration: string; // Contract duration in years
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanCategory {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Trusted Device Types
export interface TrustedDevice {
  id: string;
  deviceId: string;
  userId: string;
  deviceName: string;
  deviceInfo: {
    userAgent: string;
    platform: string;
    browser: string;
    os: string;
    screenResolution: string;
    timezone: string;
  };
  location: {
    ipAddress: string;
    country?: string;
    city?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      timestamp?: number;
    };
    address?: {
      city?: string;
      state?: string;
      country?: string;
      countryCode?: string;
      postalCode?: string;
    };
  };
  createdAt: Date;
  lastSeen: Date;
  expiresAt: Date;
  isActive: boolean;
  trustLevel: 'high' | 'medium' | 'low';
}

export interface AgentLink {
  id: string;
  agentId: string;
  agentName?: string;
  linkId: string; // Unique identifier for the link (used in URL)
  allowedGroups: string[]; // Groups of numbers to show (e.g., ['G1', 'G2'])
  allowedCategories?: string[]; // Optional number categories to show (e.g., ['Silver', 'Gold'])
  isActive: boolean;
  otp?: string; // OTP required to access the customer portal
  otpExpiresAt?: Date; // OTP expiration time (2 hours from generation)
  trustedCustomers?: boolean; // If true, after OTP show open numbers directly (paginated, like Number Pool)
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date; // Optional expiration date
  usageCount?: number; // Number of times link was used
  lastUsedAt?: Date;
  note?: string; // Optional note about who the link is for
}

export interface DeviceFingerprint {
  deviceId: string;
  userAgent: string;
  platform: string;
  browser: string;
  os: string;
  screenResolution: string;
  timezone: string;
  language: string;
  cookieEnabled: boolean;
  doNotTrack: boolean;
  canvasFingerprint?: string;
}

export interface TrustedDeviceSettings {
  trustDurationDays: number;
  maxTrustedDevices: number;
  requireIpValidation: boolean;
  allowAdminRevoke: boolean;
  notifyNewDevice: boolean;
}