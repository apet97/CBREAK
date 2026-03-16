/**
 * @fileoverview API client for fetching users and detailed report entries.
 * Uses X-Addon-Token header, never hardcodes API URLs.
 */

import type { ClockifyUser, ReportTimeEntry, TokenClaims } from './types.js';
import { isAllowedClockifyUrl } from './utils.js';

const REQUEST_TIMEOUT_MS = 30_000;
const REPORT_PAGE_SIZE = 200;
const MAX_PAGES = 50; // Safety limit: 50 * 200 = 10,000 entries max

/**
 * Makes an authenticated API call to a Clockify endpoint.
 */
async function apiCall(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!isAllowedClockifyUrl(url)) {
    throw new Error(`Untrusted URL: ${url}`);
  }
  return fetch(url, {
    ...options,
    headers: {
      'X-Addon-Token': token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Fetches all active users in a workspace.
 */
export async function fetchUsers(
  token: string,
  claims: TokenClaims
): Promise<ClockifyUser[]> {
  const backendUrl = claims.backendUrl;
  if (!backendUrl) throw new Error('Missing backendUrl in claims');

  const url = `${backendUrl}/v1/workspaces/${claims.workspaceId}/users?status=ACTIVE&page-size=500`;
  const response = await apiCall(url, token);

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
  }

  const users = (await response.json()) as Array<{ id: string; name: string; email?: string; status?: string }>;
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
  }));
}

/**
 * Resolves the reports API base URL from JWT claims.
 * Adapted from otrepo/js/api.ts resolveReportsBaseUrl().
 */
export function resolveReportsBaseUrl(claims: TokenClaims): string {
  const reportsUrlClaim = claims.reportsUrl;
  const backendUrl = claims.backendUrl || '';
  const normalizedBackend = backendUrl.replace(/\/+$/, '');

  let backendHost = '';
  let backendOrigin = '';
  let backendPath = '';

  if (normalizedBackend) {
    try {
      const backend = new URL(normalizedBackend);
      backendHost = backend.host.toLowerCase();
      backendOrigin = backend.origin;
      backendPath = backend.pathname.replace(/\/+$/, '');
    } catch {
      // Invalid URL: fall through to defaults
    }
  }

  // Branch 1: reportsUrl claim exists
  if (reportsUrlClaim) {
    const normalizedReports = reportsUrlClaim.replace(/\/+$/, '');

    // Developer portal: use backendUrl instead
    if (backendHost === 'developer.clockify.me') {
      try {
        const reportsHost = new URL(normalizedReports).host.toLowerCase();
        if (reportsHost !== backendHost && normalizedBackend) {
          return normalizedBackend;
        }
      } catch {
        if (normalizedBackend) return normalizedBackend;
      }
    }

    return normalizedReports;
  }

  // Branch 2: derive from backendUrl
  if (backendHost === 'developer.clockify.me' && normalizedBackend) {
    return normalizedBackend;
  }

  if (backendHost === 'api.clockify.me') {
    return 'https://reports.api.clockify.me';
  }

  // Regional: /api -> /report
  if (backendHost.endsWith('clockify.me') && backendOrigin) {
    if (backendPath.endsWith('/api')) {
      return `${backendOrigin}${backendPath.replace(/\/api$/, '/report')}`;
    }
    return `${backendOrigin}${backendPath}/report`;
  }

  // Fallback
  return 'https://reports.api.clockify.me';
}

/**
 * Fetches detailed report entries for a date range, paginated.
 * Returns raw entries (REGULAR, BREAK, HOLIDAY, TIME_OFF).
 */
export async function fetchDetailedReport(
  token: string,
  claims: TokenClaims,
  startDate: string,
  endDate: string
): Promise<ReportTimeEntry[]> {
  const reportsBase = resolveReportsBaseUrl(claims);
  const url = `${reportsBase}/v1/workspaces/${claims.workspaceId}/reports/detailed`;

  if (!isAllowedClockifyUrl(url)) {
    throw new Error(`Untrusted reports URL: ${url}`);
  }

  const allEntries: ReportTimeEntry[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const body = {
      dateRangeStart: startDate,
      dateRangeEnd: endDate,
      detailedFilter: {
        page,
        pageSize: REPORT_PAGE_SIZE,
        sortColumn: 'DATE',
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Addon-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Detailed report fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      timeentries?: Array<{
        _id: string;
        description: string;
        userId: string;
        userName?: string;
        timeInterval: { start: string; end: string; duration: number };
        type?: string;
        projectId?: string;
        projectName?: string;
      }>;
      totals?: Array<{ totalCount?: number }>;
    };

    const entries = data.timeentries ?? [];
    for (const entry of entries) {
      allEntries.push({
        _id: entry._id,
        description: entry.description,
        userId: entry.userId,
        userName: entry.userName,
        timeInterval: entry.timeInterval,
        type: (entry.type as ReportTimeEntry['type']) || 'REGULAR',
        projectId: entry.projectId,
        projectName: entry.projectName,
      });
    }

    // Stop if we got fewer entries than page size (last page)
    if (entries.length < REPORT_PAGE_SIZE) break;

    page++;
  }

  return allEntries;
}
