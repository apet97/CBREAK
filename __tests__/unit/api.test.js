/**
 * @fileoverview Tests for API client functions.
 */

import { resolveReportsBaseUrl } from '../../js/api.js';

describe('resolveReportsBaseUrl', () => {
  test('uses reportsUrl claim when present', () => {
    const result = resolveReportsBaseUrl({
      workspaceId: 'ws1',
      backendUrl: 'https://api.clockify.me/api',
      reportsUrl: 'https://reports.api.clockify.me',
    });
    expect(result).toBe('https://reports.api.clockify.me');
  });

  test('strips trailing slashes from reportsUrl', () => {
    const result = resolveReportsBaseUrl({
      workspaceId: 'ws1',
      backendUrl: 'https://api.clockify.me/api',
      reportsUrl: 'https://reports.api.clockify.me/',
    });
    expect(result).toBe('https://reports.api.clockify.me');
  });

  test('developer portal: uses backendUrl when reportsUrl host differs', () => {
    const result = resolveReportsBaseUrl({
      workspaceId: 'ws1',
      backendUrl: 'https://developer.clockify.me/api',
      reportsUrl: 'https://reports.api.clockify.me',
    });
    expect(result).toBe('https://developer.clockify.me/api');
  });

  test('developer portal: uses backendUrl when reportsUrl missing', () => {
    const result = resolveReportsBaseUrl({
      workspaceId: 'ws1',
      backendUrl: 'https://developer.clockify.me/api',
    });
    expect(result).toBe('https://developer.clockify.me/api');
  });

  test('production: derives reports URL when reportsUrl missing', () => {
    const result = resolveReportsBaseUrl({
      workspaceId: 'ws1',
      backendUrl: 'https://api.clockify.me/api',
    });
    expect(result).toBe('https://reports.api.clockify.me');
  });

  test('regional: transforms /api to /report', () => {
    const result = resolveReportsBaseUrl({
      workspaceId: 'ws1',
      backendUrl: 'https://eu.api.clockify.me/api',
    });
    expect(result).toBe('https://eu.api.clockify.me/report');
  });

  test('fallback when no backendUrl', () => {
    const result = resolveReportsBaseUrl({ workspaceId: 'ws1' });
    expect(result).toBe('https://reports.api.clockify.me');
  });
});
