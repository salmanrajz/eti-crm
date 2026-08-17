import React from 'react';
import { clsx } from 'clsx';
import { Check, CheckCheck, XCircle, AlertCircle } from 'lucide-react';
import { normalizeTimestamp, formatLocalTimestamp, getTimestampForSort } from '../../utils/timestampUtils';

/**
 * WhatsApp Message Interface
 */
export interface WhatsAppMessage {
  id: string;
  messageId?: string;
  direction: 'inbound' | 'outbound';
  from?: string;
  to?: string;
  messageText: string;
  createdAt: Date | string | any; // Will be normalized
  status?: string;
  consents?: Record<string, boolean>;
  templateName?: string;
  parameters?: any[];
  error?: any;
  readStatus?: string;
  deliveryStatus?: string;
  messageType?: string;
  replyTo?: string;
  repliedMessage?: string;
  mediaId?: string;
  mediaPath?: string;
  mime?: string;
  userId?: string;
  userName?: string;
  senderName?: string;
  buttons?: any;
  payload?: any;
}

/**
 * Lead Plan Interface
 */
export interface LeadPlan {
  number?: string;
  plan?: string;
  category?: string;
}

/**
 * Lead Interface (minimal for this component)
 */
export interface Lead {
  id?: string;
  customerName?: string;
  customerNumber?: string;
  plans?: LeadPlan[];
}

/**
 * Plan Details Interface
 */
export interface PlanDetails {
  benefits?: string;
  duration?: string;
}

/**
 * WhatsApp Conversation View Props
 */
export interface WhatsAppConversationViewProps {
  messages: WhatsAppMessage[];
  lead?: Lead | null;
  planDetails?: PlanDetails;
  onResendMessage?: (message: WhatsAppMessage) => void;
  resendingLogId?: string | null;
  showResendButton?: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
  className?: string;
  isCoordinator?: boolean;
  isAdmin?: boolean;
}

/**
 * Consent Order Configuration
 */
const CONSENT_ORDER: Array<{ key: string; label: string }> = [
  {
    key: 'ownershipAfterContract',
    label:
      'The chosen number becomes yours only after completing the contract. During this period, transfer of ownership is not permitted, and porting out to other telecom providers is restricted. Plan upgrades (within the same category) are allowed; downgrades or switching to prepaid are not allowed.'
  },
  {
    key: 'proRatedAgree',
    label:
      'Multi-SIM is available exclusively with the Limited Data Packages; this feature is not available with Non-Stop Data plans. The plan will be pro-rated. In case of early cancellation, all pending bills must be cleared along with one-month rental + 5% VAT, and the number will be reclaimed by Etisalat.'
  },
  {
    key: 'gracePeriodAcknowledge',
    label:
      'If you are not a UAE citizen, you must pay half or full monthly rental in advance at activation, which will be adjusted in the 4th month of your billing cycle. In case of technical or network-related issues, or misinformation, you can cancel the plan without charges within the first five days.'
  },
  {
    key: 'dataAccuracyAcknowledge',
    label:
      'The information provided regarding the number and plan is accurate. Any other information received will not be considered valid. Please read this carefully and confirm, as this communication will be referenced in the event of any future complaints regarding the number or plan.'
  },
  {
    key: 'acceptAllTerms',
    label: 'Accept all the Terms & Conditions.'
  }
];

/**
 * Status Label Map
 */
const STATUS_LABEL_MAP: Record<string, string> = {
  read: 'Read',
  delivered: 'Delivered',
  sent: 'Sent',
  failed: 'Failed'
};

/**
 * WhatsApp Conversation View Component
 * 
 * Displays WhatsApp messages in a conversation format with:
 * - Message bubbles (inbound/outbound)
 * - Timestamp display using universal timestamp utility
 * - Status indicators (read/delivered/sent/failed)
 * - Plan summary display (when consents are present)
 * - Error handling and display
 */
export function WhatsAppConversationView({
  messages,
  lead,
  planDetails,
  onResendMessage,
  resendingLogId,
  showResendButton = false,
  containerRef,
  className = '',
  isCoordinator = false,
  isAdmin = false
}: WhatsAppConversationViewProps) {
  // Sort messages by timestamp (oldest first), with secondary sort by messageId
  const sortedMessages = React.useMemo(() => {
    return [...messages].sort((a, b) => {
      const timeA = getTimestampForSort(normalizeTimestamp(a.createdAt));
      const timeB = getTimestampForSort(normalizeTimestamp(b.createdAt));
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // If timestamps are equal, sort by messageId to maintain consistent order
      const idA = a.messageId || a.id || '';
      const idB = b.messageId || b.id || '';
      return idA.localeCompare(idB);
    });
  }, [messages]);

  // Derive message status for outbound messages
  const deriveStatus = (message: WhatsAppMessage, allMessages: WhatsAppMessage[]): 'read' | 'delivered' | 'sent' | 'failed' | undefined => {
    if (message.direction !== 'outbound') return undefined;
    if (message.status === 'failed') return 'failed';
    
    const messageTime = getTimestampForSort(normalizeTimestamp(message.createdAt));
    const hasCustomerReplyAfter = allMessages.some(other => {
      if (other.id === message.id || other.direction !== 'inbound') return false;
      const otherTime = getTimestampForSort(normalizeTimestamp(other.createdAt));
      return otherTime > messageTime;
    });
    
    if (message.status === 'read' || hasCustomerReplyAfter) return 'read';
    if (message.status === 'delivered') return 'delivered';
    if (message.status === 'sent' || message.status === 'accepted') return 'sent';
    return message.status ? 'sent' : undefined;
  };

  if (sortedMessages.length === 0) {
    return (
      <div className={`text-center text-gray-500 py-8 ${className}`}>
        <p>No WhatsApp messages found for this lead.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`space-y-4 ${className}`}>
      {sortedMessages.map((log) => {
        // Normalize timestamp once and use it consistently
        // Always normalize to ensure consistent Date object
        // The Cloud Function sends ISO strings, so normalizeTimestamp will parse them correctly
        const created = normalizeTimestamp(log.createdAt);
        if (!created) {
          console.warn('Failed to normalize timestamp for message:', log.id, log.createdAt);
        }
        const createdStr = formatLocalTimestamp(created);
        const fromDigits = (log.from || '').toString().replace(/\D/g, '');
        const fromDisplay = fromDigits ? `+${fromDigits}` : '';
        const firstPlan = lead?.plans?.[0];
        const isOutbound = log.direction === 'outbound';
        const effectiveStatus = deriveStatus(log, sortedMessages);
        
        const accepted = Array.isArray(CONSENT_ORDER)
          ? CONSENT_ORDER.filter(i => log.consents?.[i.key] === true)
          : [];

        return (
          <div key={log.id} className={clsx('flex', isOutbound ? 'justify-end' : 'justify-start')}>
            <div className={clsx(
              'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border',
              isOutbound 
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-100' 
                : 'bg-white text-gray-900 border-gray-200'
            )}>
              {/* Message Header */}
              <div className={clsx(
                'flex items-center justify-between text-[11px] mb-2',
                isOutbound ? 'text-indigo-100/90' : 'text-gray-500/80'
              )}>
                <span className={clsx(
                  'px-2 py-0.5 rounded-full border',
                  isOutbound 
                    ? 'bg-white/15 text-white border-white/20' 
                    : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                )}>
                  {isOutbound ? 'Outbound' : 'Inbound'}
                </span>
                <span className="ml-2 flex items-center gap-1.5">
                  {fromDisplay && (
                    <span className={clsx('font-bold', isOutbound ? 'text-white' : 'text-indigo-600')}>From {fromDisplay}</span>
                  )}
                  {createdStr && ` · ${createdStr}`}
                  {isOutbound && (
                    <span
                      className="ml-1.5 inline-flex items-center"
                      title={effectiveStatus ? `Message ${STATUS_LABEL_MAP[effectiveStatus] || effectiveStatus}` : 'Message sent'}
                    >
                      {effectiveStatus === 'read' && (
                        <CheckCheck className={clsx('w-4 h-4', isOutbound ? 'text-white' : 'text-green-500')} />
                      )}
                      {effectiveStatus === 'delivered' && (
                        <CheckCheck className={clsx('w-4 h-4', isOutbound ? 'text-indigo-100' : 'text-gray-600')} />
                      )}
                      {(!effectiveStatus || effectiveStatus === 'sent') && (
                        <Check className={clsx('w-3.5 h-3.5', isOutbound ? 'text-indigo-100' : 'text-gray-500')} />
                      )}
                      {effectiveStatus === 'failed' && (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </span>
                  )}
                </span>
              </div>

              {/* Plan Summary (only for acceptance messages with consents) */}
              {accepted.length > 0 && firstPlan && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <h4 className="text-sm font-semibold text-blue-900">Plan & Number Summary</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">Selected Number:</span>
                      <span className="font-semibold text-gray-900">{firstPlan.number}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">Monthly Plan:</span>
                      <span className="font-semibold text-gray-900">
                        {firstPlan.plan ? 
                          (() => {
                            const match = firstPlan.plan.match(/\d+/);
                            return match ? `${match[0]} AED + 5% VAT` : firstPlan.plan;
                          })() 
                          : ''
                        }
                      </span>
                    </div>
                    {planDetails?.benefits && planDetails.benefits !== 'N/A' && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">Benefits:</span>
                        <span className="font-semibold text-gray-900">{planDetails.benefits}</span>
                      </div>
                    )}
                    {planDetails?.duration && planDetails.duration !== 'N/A' && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">Contract Duration:</span>
                        <span className="font-semibold text-gray-900">
                          {planDetails.duration.includes('Year') || planDetails.duration.includes('year') 
                            ? planDetails.duration 
                            : `${planDetails.duration} Year`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Message Text */}
              {log.messageText && (
                <div className="text-sm whitespace-pre-wrap mb-2">{log.messageText}</div>
              )}

              {/* Error Display */}
              {effectiveStatus === 'failed' && log.error && (() => {
                const errorObj = log.error as any;
                let errorText = '';
                let errorCode = '';
                let errorExplanation = '';
                
                if (typeof log.error === 'string') {
                  errorText = log.error;
                } else if (errorObj) {
                  // WhatsApp error structure: { code, title, message, error_data }
                  const parts = [];
                  if (errorObj.title) parts.push(errorObj.title);
                  // Only add message if it's different from title (avoid duplication)
                  if (errorObj.message && errorObj.message !== errorObj.title) {
                    parts.push(errorObj.message);
                  }
                  errorText = parts.length > 0 ? parts.join(' - ') : '';
                  errorCode = errorObj.code || '';
                  
                  // Provide user-friendly explanations for common error codes
                  const errorExplanations: Record<string, string> = {
                    '131026': 'The customer\'s phone number is not registered on WhatsApp or has blocked your business number.',
                    '131047': 'The customer has not replied within the 24-hour messaging window. Send a template message to re-engage.',
                    '131051': 'This type of message is not supported. Try using a different message format.',
                    '131052': 'Media download failed. The media file may be corrupted or too large.',
                    '131053': 'Media upload failed. Check the file format and size.',
                    '133000': 'The phone number format is invalid. Use international format (e.g., 971XXXXXXXXX).',
                    '133004': 'The template message was rejected. Verify the template name and parameters.',
                    '133005': 'Template not found. Make sure the template is approved in Meta Business Manager.',
                    '133006': 'Invalid template parameters. Check parameter count and format.',
                    '133010': 'Message limit exceeded. You\'ve reached the messaging limit for this customer.',
                    '130472': 'The customer has opted out of marketing messages. They must opt back in before you can send them marketing content.',
                    '135000': 'Generic WhatsApp Business API error. Contact support if this persists.',
                    '136000': 'Insufficient WhatsApp Business Account balance. Add funds to continue messaging.',
                    '368': 'Temporarily blocked for spammy behavior. Reduce message frequency.',
                    '131031': 'Rate limit exceeded. Too many messages sent in a short time. Wait before retrying.',
                  };
                  
                  errorExplanation = errorExplanations[errorCode] || '';
                }
                
                return (
                  <div className="mt-2 bg-red-100 border border-red-300 rounded-lg p-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs text-red-800">
                        <div className="font-semibold mb-1">Message Failed</div>
                        {errorText && <div className="text-red-700 mb-1">{errorText}</div>}
                        {errorCode && <div className="text-red-600 font-mono mb-1">Error Code: {errorCode}</div>}
                        {errorExplanation && (
                          <div className="mt-2 pt-2 border-t border-red-200 text-red-900 leading-relaxed">
                            <span className="font-semibold">💡 What to do: </span>
                            {errorExplanation}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Resend Button */}
              {showResendButton && isOutbound && log.templateName && Array.isArray(log.parameters) && log.parameters.length > 0 && onResendMessage && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => onResendMessage(log)}
                    disabled={resendingLogId === log.id}
                    className={clsx(
                      'inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium shadow-sm',
                      resendingLogId === log.id
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                    )}
                  >
                    {resendingLogId === log.id ? 'Resending…' : 'Resend Message'}
                  </button>
                </div>
              )}

              {/* Accepted Consents List */}
              {accepted.length > 0 && (
                <ol className="mt-1 space-y-2 text-sm">
                  {accepted.map((item, idx) => (
                    <li key={item.key} className="flex items-start">
                      <span className="mr-2 text-gray-700">{idx + 1}.</span>
                      <span className="text-gray-900">
                        {item.label}
                        <span className="ml-2 inline-flex items-center text-green-600 text-xs font-medium align-middle">
                          <svg className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 00-1.408-1.418L7.5 11.66 4.704 8.864a1 1 0 10-1.408 1.418l3.5 3.5a1 1 0 001.408 0l8.5-8.5z" clipRule="evenodd"/>
                          </svg>
                          Accepted
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
