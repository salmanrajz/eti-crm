import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, createStrikeAlertBroadcastFunction } from '../lib/firebase';
import { pausedClaimTimerFields } from './claimTimer';

export const STRIKE_NUMBER_STATUSES = [
  'pending_verification',
  'verified',
  'follow_up',
  'later',
  'non_verified',
  'assigned',
] as const;

/** Reserved claim flow only — non_verified keeps strikes, not claims. */
export const CLAIM_HELD_NUMBER_STATUSES = ['reserved'] as const;

export const STRIKE_BLOCKED_LEAD_STATUSES = [
  'assigned',
  'activated',
  'activated_non_verified',
] as const;

/** Statuses where an active strike timer keeps running (do not reset). */
export const STRIKE_TIMER_CONTINUE_STATUSES = [
  'pending_verification',
  'non_verified',
  'verified',
  'follow_up',
  'later',
] as const;

/** After assigned pause, entering these statuses restarts the full strike window. */
export const STRIKE_TIMER_RESTART_STATUSES = [
  'verified',
  'follow_up',
  'later',
] as const;

export const DEFAULT_STRIKE_WINDOW_MS = 60 * 60 * 1000;
export const CLAIM_AFTER_STRIKE_MS = 15 * 60 * 1000;

/** Strike execute window: 10:00–19:00 Asia/Dubai (UAE). */
export const STRIKE_EXECUTE_TIME_ZONE = 'Asia/Dubai';
export const STRIKE_EXECUTE_START_HOUR = 10;
/** Exclusive end hour — 19:00 means last allowed moment is 18:59. */
export const STRIKE_EXECUTE_END_HOUR = 19;
export const STRIKE_OFF_HOURS_MESSAGE =
  'Strikes only execute between 10:00 AM and 7:00 PM UAE time. This will execute after 10:00 AM UAE.';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const raw = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    hour: Number(raw.hour),
    minute: Number(raw.minute),
    second: Number(raw.second),
  };
}

/** Asia/Dubai is UTC+4 year-round (no DST). */
function dateFromUaeWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 4, minute, second));
}

export function isWithinStrikeExecuteHours(date: Date = new Date()): boolean {
  const p = getZonedParts(date, STRIKE_EXECUTE_TIME_ZONE);
  const mins = p.hour * 60 + p.minute;
  return (
    mins >= STRIKE_EXECUTE_START_HOUR * 60 &&
    mins < STRIKE_EXECUTE_END_HOUR * 60
  );
}

export function isStrikeOffHours(date: Date = new Date()): boolean {
  return !isWithinStrikeExecuteHours(date);
}

/** Next 10:00 AM UAE at or after `from` (if before today's open, today's 10:00; else tomorrow 10:00). */
export function nextStrikeBusinessOpen(from: Date = new Date()): Date {
  const p = getZonedParts(from, STRIKE_EXECUTE_TIME_ZONE);
  const openToday = dateFromUaeWallTime(
    p.year,
    p.month,
    p.day,
    STRIKE_EXECUTE_START_HOUR
  );
  if (from.getTime() < openToday.getTime()) {
    return openToday;
  }
  const nextCalendar = new Date(openToday.getTime() + 24 * 60 * 60 * 1000);
  const np = getZonedParts(nextCalendar, STRIKE_EXECUTE_TIME_ZONE);
  return dateFromUaeWallTime(np.year, np.month, np.day, STRIKE_EXECUTE_START_HOUR);
}

/**
 * Clamp a candidate execute time into the UAE business window.
 * If the time falls outside 10:00–19:00, move to the next 10:00 AM UAE.
 */
export function clampToStrikeExecuteWindow(
  candidate: Date,
  now: Date = new Date()
): Date {
  const base = new Date(Math.max(candidate.getTime(), now.getTime()));
  if (isWithinStrikeExecuteHours(base)) return base;
  return nextStrikeBusinessOpen(base);
}

/** First-strike / restart timer: window from now, then clamped into business hours. */
export function computeStrikeExpiresAt(
  strikeWindowMs: number,
  now: Date = new Date()
): Date {
  return clampToStrikeExecuteWindow(new Date(now.getTime() + strikeWindowMs), now);
}

export function effectiveStrikeExecuteAt(
  strikeExpiresAt: Date | null | undefined,
  now: Date = new Date()
): Date | null {
  if (!strikeExpiresAt || Number.isNaN(strikeExpiresAt.getTime())) return null;
  return clampToStrikeExecuteWindow(strikeExpiresAt, now);
}

export function msUntilEffectiveStrikeExecute(
  strikeExpiresAt: Date | null | undefined,
  now: Date = new Date()
): number | null {
  const effective = effectiveStrikeExecuteAt(strikeExpiresAt, now);
  if (!effective) return null;
  return Math.max(0, effective.getTime() - now.getTime());
}

export function isStrikeNumberStatus(status?: string | null) {
  return !!status && (STRIKE_NUMBER_STATUSES as readonly string[]).includes(status);
}

export function isClaimHeldStatus(status?: string | null) {
  return !!status && (CLAIM_HELD_NUMBER_STATUSES as readonly string[]).includes(status);
}

export function isStrikeBlockedLeadStatus(status?: string | null) {
  return !!status && (STRIKE_BLOCKED_LEAD_STATUSES as readonly string[]).includes(status);
}

export function hasPendingStrikes(
  claims: Array<{ status?: string; userId?: string }> | null | undefined
) {
  return (Array.isArray(claims) ? claims : []).some(
    (claim) => claim?.status === 'pending' && !!claim?.userId
  );
}

export function pausedStrikeTimerFields() {
  return { strikeExpiresAt: null as null };
}

export function restartStrikeTimerFields(strikeWindowMs: number) {
  return { strikeExpiresAt: computeStrikeExpiresAt(strikeWindowMs) };
}

/**
 * Strike timer rules:
 * - Continue through non_verified / verified / follow_up / later / pending_verification
 * - Pause (clear strikeExpiresAt) only on assigned / activated / activated_non_verified
 * - Keep the strike queue (claims[]) intact — never drop people just because status changed
 * - When timer was paused and status becomes verified / follow_up / later, restart full window
 */
export function strikeTimerFieldsForNumberStatus(
  newStatus: string,
  numberData: {
    claims?: Array<{ status?: string; userId?: string }> | null;
    strikeExpiresAt?: unknown;
  } | null | undefined,
  strikeWindowMs: number
) {
  if (!hasPendingStrikes(numberData?.claims)) {
    return {};
  }

  if (isStrikeBlockedLeadStatus(newStatus)) {
    return pausedStrikeTimerFields();
  }

  const timerPaused = !numberData?.strikeExpiresAt;
  if (
    timerPaused &&
    (STRIKE_TIMER_RESTART_STATUSES as readonly string[]).includes(newStatus)
  ) {
    return restartStrikeTimerFields(strikeWindowMs);
  }

  // Timer already running (or continue statuses without a restart) — leave strikeExpiresAt alone
  return {};
}

export function claimQueueToPendingStrikes(
  claimQueue: Array<{ agentId?: string; claimedAt?: unknown }> | null | undefined
) {
  if (!Array.isArray(claimQueue)) return [];
  return claimQueue
    .filter((claim) => claim?.agentId)
    .map((claim) => ({
      userId: claim.agentId as string,
      claimedAt: claim.claimedAt || new Date(),
      status: 'pending' as const,
    }));
}

export function pendingStrikesToClaimQueue(
  claims: Array<{ userId?: string; claimedAt?: unknown; status?: string }> | null | undefined,
  excludeUserId?: string | null
) {
  if (!Array.isArray(claims)) return [];
  return claims
    .filter(
      (claim) =>
        claim?.status === 'pending' &&
        claim?.userId &&
        claim.userId !== excludeUserId
    )
    .sort((a, b) => {
      const aTime = toMillis(a.claimedAt);
      const bTime = toMillis(b.claimedAt);
      return aTime - bTime;
    })
    .map((claim) => ({
      agentId: claim.userId as string,
      claimedAt: claim.claimedAt || new Date(),
    }));
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(value as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getStrikeWindowMs() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'strikeConfig'));
    const minutes = Number(snap.data()?.strikeWindowMinutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
  } catch {
    // default
  }
  return DEFAULT_STRIKE_WINDOW_MS;
}

/** True when attaching to a lead would convert claimQueue entries into pending strikes. */
export function claimQueueWouldConvertToStrikes(
  numberData: {
    claimQueue?: Array<{ agentId?: string }> | null;
  } | null | undefined
) {
  const queue = Array.isArray(numberData?.claimQueue) ? numberData!.claimQueue! : [];
  return queue.some((claim) => !!claim?.agentId);
}

/**
 * Notify lead owner (broadcast + same WhatsApp path as a normal strike).
 * Fire-and-forget; safe to call after claimQueue → strikes conversion.
 */
export function notifyOwnerOfClaimToStrikeConversion(params: {
  leadId: string;
  numberId: string;
  number?: string;
}) {
  if (!params.leadId || !params.numberId) return;
  void createStrikeAlertBroadcastFunction({
    leadId: params.leadId,
    numberId: params.numberId,
    number: params.number || '',
    source: 'claim_conversion',
  }).catch((err) => {
    console.warn('Claim→strike owner alert failed:', err);
  });
}

/** When a reserved number is attached to a lead, claim queue becomes strikes. Does not reset an existing strike timer. */
export function poolFieldsWhenAttachingToLead(
  numberData: {
    claimQueue?: Array<{ agentId?: string; claimedAt?: unknown }> | null;
    claims?: Array<{ userId?: string; claimedAt?: unknown; status?: string }> | null;
    strikeExpiresAt?: unknown;
  } | null | undefined,
  strikeWindowMs: number
) {
  const queue = Array.isArray(numberData?.claimQueue) ? numberData!.claimQueue! : [];
  if (queue.length === 0) {
    return pausedClaimTimerFields();
  }

  const existing = Array.isArray(numberData?.claims) ? numberData!.claims! : [];
  const converted = claimQueueToPendingStrikes(queue);
  const seen = new Set(
    existing
      .filter((claim) => claim.status === 'pending' && claim.userId)
      .map((claim) => claim.userId as string)
  );
  const merged = [
    ...existing,
    ...converted.filter((claim) => {
      if (seen.has(claim.userId)) return false;
      seen.add(claim.userId);
      return true;
    }),
  ];

  const fields: Record<string, unknown> = {
    claims: merged,
    claimQueue: [],
    claimingAgentId: null,
    claimingStartedAt: null,
    claimingExpiresAt: null,
  };

  // Start timer only if strikes exist and none is running yet — never reset a live timer
  if (hasPendingStrikes(merged) && !numberData?.strikeExpiresAt) {
    fields.strikeExpiresAt = computeStrikeExpiresAt(strikeWindowMs);
  }

  return fields;
}

/**
 * Non-verified: hold for the same agent, keep pending strikes and keep strike timer running.
 * Do NOT convert strikes into claims and do NOT reset the timer.
 */
export function poolFieldsWhenNonVerified() {
  return {
    ...pausedClaimTimerFields(),
  };
}

export async function rejectAwaitingLeadsForNumber(numberId: string) {
  if (!numberId) return;
  const q = query(
    collection(db, 'leads'),
    where('awaitingNumberIds', 'array-contains', numberId),
    where('status', '==', 'awaiting_for_number')
  );
  const snap = await getDocs(q);
  await Promise.all(
    snap.docs.map((leadDoc) =>
      updateDoc(leadDoc.ref, {
        status: 'rejected',
        rejectionReason: 'Number was activated or set Active Non Verified on another lead',
        updatedAt: new Date(),
      })
    )
  );
}

export type LeadNumberAttachmentCheck = {
  ok: boolean;
  /** Fresh lead status from Firestore when available */
  leadStatus?: string;
  reason?: 'awaiting_for_number' | 'numbers_detached';
  numbers: string[];
};

/**
 * Block coordinator/manager actions when the lead is awaiting a number
 * or pool numbers are no longer attached to this lead (post-strike).
 * Re-reads the lead doc so stale UI cannot assign struck numbers.
 */
export async function checkLeadNumbersStillAttached(lead: {
  id?: string;
  status?: string;
  awaitingNumberIds?: string[] | null;
  plans?: Array<{
    numberId?: string;
    number?: string;
    numberStruckThrough?: boolean;
  }> | null;
}): Promise<LeadNumberAttachmentCheck> {
  if (!lead?.id) {
    return { ok: true, numbers: [] };
  }

  let leadStatus = lead.status;
  let plans = Array.isArray(lead.plans) ? lead.plans : [];
  let awaitingNumberIds = Array.isArray(lead.awaitingNumberIds) ? lead.awaitingNumberIds : [];

  try {
    const leadSnap = await getDoc(doc(db, 'leads', lead.id));
    if (leadSnap.exists()) {
      const data = leadSnap.data();
      leadStatus = data.status || leadStatus;
      if (Array.isArray(data.plans)) {
        plans = data.plans;
      }
      if (Array.isArray(data.awaitingNumberIds)) {
        awaitingNumberIds = data.awaitingNumberIds;
      }
    }
  } catch (err) {
    console.warn('checkLeadNumbersStillAttached: failed to refresh lead', err);
  }

  const labelFor = (plan: { numberId?: string; number?: string }) =>
    String(plan.number || plan.numberId || '').trim();

  const struckPlans = plans.filter(
    (p) =>
      p?.numberStruckThrough &&
      p?.numberId &&
      !String(p.numberId).startsWith('virtual-')
  );

  if (leadStatus === 'awaiting_for_number' || struckPlans.length > 0) {
    const numbers = (
      struckPlans.length > 0
        ? struckPlans
        : plans.filter((p) => p?.numberId && !String(p.numberId).startsWith('virtual-'))
    )
      .map(labelFor)
      .filter(Boolean);
    return {
      ok: false,
      leadStatus: leadStatus || 'awaiting_for_number',
      reason: 'awaiting_for_number',
      numbers,
    };
  }

  // Leftover awaiting ids with no struck flag still means number was taken
  if (awaitingNumberIds.length > 0 && leadStatus !== 'assigned' && leadStatus !== 'activated') {
    const numbers = plans
      .filter((p) => p?.numberId && awaitingNumberIds.includes(p.numberId))
      .map(labelFor)
      .filter(Boolean);
    if (numbers.length > 0) {
      return {
        ok: false,
        leadStatus,
        reason: 'numbers_detached',
        numbers,
      };
    }
  }

  const realPlans = plans.filter(
    (p) => p?.numberId && !String(p.numberId).startsWith('virtual-')
  );
  const detached: string[] = [];

  await Promise.all(
    realPlans.map(async (plan) => {
      const label = labelFor(plan);
      try {
        const numberSnap = await getDoc(doc(db, 'numberPool', plan.numberId!));
        if (!numberSnap.exists()) return;
        const numberData = numberSnap.data();
        const poolLeadId = numberData?.leadId || null;
        if (poolLeadId && poolLeadId !== lead.id) {
          if (label) detached.push(label);
          return;
        }
        // Released / reserved for someone else after strike
        if (
          !poolLeadId &&
          (numberData?.status === 'reserved' ||
            numberData?.status === 'open' ||
            numberData?.status === 'non_verified')
        ) {
          if (label) detached.push(label);
        }
      } catch (err) {
        console.warn('checkLeadNumbersStillAttached: number read failed', plan.numberId, err);
      }
    })
  );

  if (detached.length > 0) {
    return {
      ok: false,
      leadStatus,
      reason: 'numbers_detached',
      numbers: Array.from(new Set(detached)),
    };
  }

  return { ok: true, leadStatus, numbers: [] };
}
