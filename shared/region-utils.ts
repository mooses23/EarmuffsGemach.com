/**
 * Shared region-detection utilities for restocking logic.
 * Used by both the frontend (dashboard.tsx) and backend (routes.ts restock email handler).
 * Update here once to keep UI and email in sync.
 */

/**
 * Determines whether a region is US/Canada or international based on its slug and name.
 */
export function getShippingRegion(slug = '', name = ''): 'us-canada' | 'international' {
  const s = slug.toLowerCase();
  const n = name.toLowerCase();
  if (
    s.includes('united-states') || s === 'usa' || s === 'us' || s.includes('canada') ||
    n.includes('united states') || n.includes('usa') || n.includes('canada')
  ) {
    return 'us-canada';
  }
  return 'international';
}

/**
 * Returns the regional Baby Banz website URL and label for a given region slug/name,
 * or null if no specific regional site applies (i.e., use the US site / MyUS forwarding).
 */
export function getRegionalBanzInfo(slug = '', name = ''): { url: string; label: string } | null {
  const s = slug.toLowerCase();
  const n = name.toLowerCase();
  if (s.includes('australia') || n.includes('australia')) {
    return { url: 'https://banzworld.com.au', label: 'banzworld.com.au' };
  }
  if (
    s.includes('uk') || s.includes('europe') || s.includes('united-kingdom') ||
    n.includes('uk') || n.includes('europe') || n.includes('united kingdom')
  ) {
    return { url: 'https://banzworld.co.uk', label: 'banzworld.co.uk' };
  }
  return null;
}
