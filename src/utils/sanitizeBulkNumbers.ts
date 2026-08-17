/**
 * Normalize pasted bulk numbers the same way Number Pool search does:
 * 05xxxxxxxx, +9715xxxxxxxx, 9715xxxxxxxx, and 8-digit local tails.
 */
export function normalizeUaeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (/^9715\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  if (/^\d{8}$/.test(digits)) return `05${digits}`;
  return null;
}

function extractFromDigitString(digits: string, out: string[]) {
  const direct = normalizeUaeMobile(digits);
  if (direct) {
    out.push(direct);
    return;
  }

  const pattern = /9715\d{8}|05\d{8}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(digits))) {
    const normalized = normalizeUaeMobile(match[0]);
    if (normalized) out.push(normalized);
  }
}

export function extractSanitizedPhoneNumbers(value: string): string[] {
  if (!value?.trim()) return [];

  const found: string[] = [];
  const poolStyle = value.match(/(?:\+?9715\d{8}|05\d{8})/g) || [];
  for (const match of poolStyle) {
    const normalized = normalizeUaeMobile(match);
    if (normalized) found.push(normalized);
  }

  const groups: string[] = [];
  let buffer = '';
  for (const char of value) {
    if (char >= '0' && char <= '9') {
      buffer += char;
    } else if (buffer) {
      groups.push(buffer);
      buffer = '';
    }
  }
  if (buffer) groups.push(buffer);

  for (const group of groups) {
    extractFromDigitString(group, found);
  }

  return [...new Set(found)];
}

export function formatSanitizedPhoneNumbers(value: string): string {
  return extractSanitizedPhoneNumbers(value).join('\n');
}
