export function getPublicBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return '';
}

export function getLeadDashboardUrl(leadId: string): string {
  return `${getPublicBaseUrl()}/dashboard/leads/${leadId}`;
}
