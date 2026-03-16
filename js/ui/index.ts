/**
 * @fileoverview Shared UI initialization and utility functions.
 */

import { escapeHtml } from '../utils.js';

let resultsContainer: HTMLElement | null = null;
let loadingEl: HTMLElement | null = null;
let errorEl: HTMLElement | null = null;

export function initializeElements(): void {
  resultsContainer = document.getElementById('results-container');
  loadingEl = document.getElementById('loading');
  errorEl = document.getElementById('error-banner');
}

export function getResultsContainer(): HTMLElement | null {
  return resultsContainer;
}

export function showLoading(show: boolean): void {
  if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
  if (resultsContainer && show) resultsContainer.innerHTML = '';
}

export function showError(message: string): void {
  if (errorEl) {
    errorEl.textContent = escapeHtml(message);
    errorEl.style.display = 'block';
  }
}

export function hideError(): void {
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }
}

/**
 * Returns a status icon + class for a compliance status.
 */
export function statusIcon(status: string): { icon: string; cssClass: string } {
  switch (status) {
    case 'pass':
      return { icon: '\u2713', cssClass: 'status-pass' };   // ✓
    case 'warn':
      return { icon: '\u26A0', cssClass: 'status-warn' };   // ⚠
    case 'fail':
      return { icon: '\u2717', cssClass: 'status-fail' };   // ✗
    default:
      return { icon: '\u2014', cssClass: 'status-none' };   // —
  }
}
