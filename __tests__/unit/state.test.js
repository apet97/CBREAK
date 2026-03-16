/**
 * @fileoverview Tests for the state store.
 */

import {
  store,
  setToken,
  setClaims,
  setUsers,
  setConfig,
  setResults,
  setLoading,
  setError,
  resetConfig,
} from '../../js/state.js';

describe('state store', () => {
  beforeEach(() => {
    // Reset store to defaults
    setToken('');
    setClaims({});
    setUsers([]);
    resetConfig();
    setResults(new Map());
    setLoading(false);
    setError(null);
  });

  test('setToken updates token', () => {
    setToken('test-token');
    expect(store.token).toBe('test-token');
  });

  test('setClaims updates claims', () => {
    setClaims({ workspaceId: 'ws1', backendUrl: 'https://api.clockify.me/api' });
    expect(store.claims.workspaceId).toBe('ws1');
  });

  test('setUsers updates users', () => {
    setUsers([{ id: 'u1', name: 'Alice' }]);
    expect(store.users).toHaveLength(1);
    expect(store.users[0].name).toBe('Alice');
  });

  test('setConfig updates config', () => {
    setConfig({ jurisdiction: 'california' });
    expect(store.config.jurisdiction).toBe('california');
  });

  test('resetConfig restores default jurisdiction', () => {
    setConfig({ jurisdiction: 'california' });
    resetConfig();
    expect(store.config.jurisdiction).toBe('custom');
  });

  test('setResults updates results map', () => {
    const results = new Map();
    results.set('u1', new Map([['2026-03-16', { userId: 'u1', overallStatus: 'pass' }]]));
    setResults(results);
    expect(store.results.size).toBe(1);
  });

  test('setLoading updates loading flag', () => {
    setLoading(true);
    expect(store.loading).toBe(true);
    setLoading(false);
    expect(store.loading).toBe(false);
  });

  test('setError updates error message', () => {
    setError('Something went wrong');
    expect(store.error).toBe('Something went wrong');
    setError(null);
    expect(store.error).toBeNull();
  });
});
