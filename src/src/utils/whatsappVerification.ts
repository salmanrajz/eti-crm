/**
 * ===============================================================================
 * WHATSAPP VERIFICATION UTILITY - MESSAGING AND VERIFICATION LOGGING
 * ===============================================================================
 * 
 * This module provides WhatsApp Business API integration for verification
 * messaging, template rendering, and comprehensive logging of verification
 * conversations between agents and customers.
 * 
 * FEATURES:
 * 
 * 1. MESSAGE TEMPLATE MANAGEMENT
 *    - Customer verification template rendering
 *    - Dynamic parameter substitution
 *    - Standardized messaging format
 * 
 * 2. VERIFICATION LOGGING
 *    - Outbound message logging with templates
 *    - Inbound customer response logging
 *    - Consent tracking and parsing
 * 
 * 3. RESPONSE PROCESSING
 *    - Customer response sanitization
 *    - Consent recognition and parsing
 *    - Terms acceptance tracking
 * 
 * USAGE:
 * Import WhatsApp verification functions to handle customer verification
 * messaging and maintain comprehensive logs of verification conversations.
 * ===============================================================================
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface WhatsAppVerificationLog {
  direction: 'outbound' | 'inbound';
  to?: string;
  from?: string;
  templateName?: string;
  parameters?: string[];
  messageText?: string;
  payload?: any;
  consents?: Record<string, boolean>;
  createdAt: Date;
  // WhatsApp message status tracking
  messageId?: string; // wamid from Meta
  status?: 'accepted' | 'sent' | 'delivered' | 'read' | 'failed'; // Message delivery status
  statusUpdatedAt?: Date; // Last status update timestamp
  error?: {
    code?: number;
    title?: string;
    message?: string;
    details?: string;
  };
  conversation?: {
    id?: string;
    origin?: {
      type?: string;
    };
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
  };
}

const CUSTOMER_TEMPLATE =
  'Thank you for choosing your number with us! We\'re excited to have you on board.\n' +
  'Here are the details of your selected plan:\n' +
  '📞 Number: {{1}}\n\n' +
  '💳 Monthly Plan: {{2}}\n\n' +
  '📶 Benefits: {{3}}\n\n' +
  '📅 Contract Duration: {{4}}\n\n' +
  '🔽 Please tap Continue to read the full Terms & Conditions.';

export function renderVerificationTemplate(parameters: string[]): string {
  let rendered = CUSTOMER_TEMPLATE;
  parameters.forEach((value, index) => {
    const placeholder = new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, String(value ?? ''));
  });
  return rendered;
}

interface LogOutboundOptions {
  messageText?: string;
  messageId?: string;
  sendResponse?: any;
  status?: WhatsAppVerificationLog['status'];
  error?: WhatsAppVerificationLog['error'];
}

export async function logOutboundVerificationMessage(
  leadId: string,
  to: string,
  templateName: string,
  parameters: string[],
  options: LogOutboundOptions = {}
) {
  const docData: any = {
    direction: 'outbound',
    to,
    templateName,
    parameters,
    messageText: options.messageText ?? renderVerificationTemplate(parameters),
    createdAt: serverTimestamp()
  };

  // Extract messageId from sendResponse if available
  let finalMessageId = options.messageId;
  if (!finalMessageId && options.sendResponse?.messages?.[0]?.id) {
    finalMessageId = options.sendResponse.messages[0].id;
  }

  if (finalMessageId) {
    docData.messageId = finalMessageId;
  }

  const resolvedStatus =
    options.status ||
    (finalMessageId ? options.sendResponse?.messages?.[0]?.message_status || 'accepted' : undefined);

  if (resolvedStatus) {
    docData.status = resolvedStatus;
    docData.statusUpdatedAt = serverTimestamp();
  }

  if (options.error) {
    docData.error = options.error;
  }

  await addDoc(collection(db, 'leads', leadId, 'whatsappLogs'), docData);
}

export function sanitizeResponseWithTemplate(responseText: string): Record<string, boolean> {
  const text = (responseText || '').toLowerCase();
  const truthy = (k: string) =>
    text.includes('accept') ||
    text.includes('agreed') ||
    text.includes('agree') ||
    text.includes('yes') ||
    text.includes('confirmed') ||
    text.includes(k.toLowerCase());

  return {
    acceptAllTerms: truthy('terms'),
    ownershipAfterContract: truthy('ownership'),
    usageRestrictionsAgree: truthy('restrictions'),
    proRatedAgree: truthy('pro-rated'),
    gracePeriodAcknowledge: truthy('five days'),
    dataAccuracyAcknowledge: truthy('accurate')
  };
}

export async function logInboundVerificationMessage(
  leadId: string,
  from: string,
  payload: any
) {
  const messageText = payload?.text?.body || payload?.message || '';
  const consents = sanitizeResponseWithTemplate(messageText);
  const docData: Omit<WhatsAppVerificationLog, 'createdAt'> & { createdAt: any } = {
    direction: 'inbound',
    from,
    payload,
    messageText,
    consents,
    createdAt: serverTimestamp()
  };
  await addDoc(collection(db, 'leads', leadId, 'whatsappLogs'), docData);
}


