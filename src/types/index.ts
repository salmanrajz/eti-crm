export type UserRole = 'agent' | 'verifier' | 'coordinator' | 'manager' | 'admin' | 'freelancer';

export type CoordinatorType = 'g1' | 'g2' | 'g3' | 'all';
export type VerifierType = 'g1' | 'g2' | 'g3' | 'all';
export type VerifierGroups = VerifierType[];

export type NumberStatus = 
  | 'open'
  | 'reserved'
  | 'pending_verification'
  | 'verified'
  | 'assigned'
  | 'activated'
  | 'follow_up'
  | 'rejected'
  | 'claimed'
  | 'follow_verification';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  teamId?: string; // For agents
  managerId?: string; // For agents
  phoneNumbers?: string[]; // Array of phone numbers for managers
  coordinatorType?: CoordinatorType; // For coordinators - which groups they handle
  verifierGroups?: VerifierGroups; // For verifiers - which groups they handle (multiple groups)
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
  expiresAt?: Date; // For reserved numbers
  claimingAgentId?: string;
  claimingStartedAt?: Date;
  claimingExpiresAt?: Date;
  originalAgentId?: string;
  originalReservedAt?: Date;
  originalExpiresAt?: Date;
  reservationCount?: number; // Number of times this number has been reserved
  claimCount?: number; // Number of times this number has been claimed
  claimQueue?: {
    agentId: string;
    claimedAt: Date;
  }[]; // Queue of agents who have claimed the number
  statusCheck?: {
    status: 'available' | 'unavailable' | 'pending';
    expiresAt?: Date;
  };
}

export interface NumberPoolType {
  id: string;
  number: string;
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
  claims?: Array<{
    userId: string;
    claimedAt: Date;
    status: 'pending' | 'completed' | 'cancelled';
  }>;
  claimQueue?: Array<{
    agentId: string;
    claimedAt: Date;
  }>;
}

export interface CustomerNumber {
  number: string;
  alternativeNumber?: string;
}

interface VerificationMedia {
  url: string;
  type: 'image' | 'video' | 'audio' | 'pdf';
  name: string;
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
  verifierId: string;
  coordinatorId: string;
  assignmentId: string;
  teamId: string;
  managerId: string | null;
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