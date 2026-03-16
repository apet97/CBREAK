/**
 * @fileoverview Per-user daily checklist view showing individual rule results.
 */

import type { DayComplianceResult, ClockifyUser } from '../types.js';
import { escapeHtml, getWeekDates, getDayName, formatMinutes } from '../utils.js';
import { getResultsContainer, statusIcon } from './index.js';

/**
 * Renders the per-user daily checklist into the results container.
 */
export function renderChecklist(
  results: Map<string, Map<string, DayComplianceResult>>,
  users: ClockifyUser[],
  weekStartDate: string
): void {
  const container = getResultsContainer();
  if (!container) return;

  const weekDates = getWeekDates(new Date(weekStartDate + 'T00:00:00'));
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  let html = '<div class="checklist-container">';

  for (const user of sortedUsers) {
    const userResults = results.get(user.id);
    const hasAnyData = userResults && userResults.size > 0;

    html += `<div class="user-card">`;
    html += `<h3 class="user-name">${escapeHtml(user.name)}</h3>`;

    if (!hasAnyData) {
      html += '<p class="no-data">No time entries this week.</p>';
      html += '</div>';
      continue;
    }

    html += '<div class="day-list">';

    for (const date of weekDates) {
      const dayResult = userResults?.get(date);
      if (!dayResult) continue;

      const { icon, cssClass } = statusIcon(dayResult.overallStatus);

      html += `<div class="day-section ${cssClass}">`;
      html += `<div class="day-header">`;
      html += `<span class="day-status-icon">${icon}</span>`;
      html += `<span class="day-label">${getDayName(date)} ${escapeHtml(date.slice(5))}</span>`;
      html += `<span class="day-summary">Work: ${formatMinutes(dayResult.totalWorkMinutes)} | Break: ${formatMinutes(dayResult.totalBreakMinutes)}</span>`;
      html += '</div>';

      html += '<ul class="rule-list">';
      for (const rule of dayResult.rules) {
        const ruleIcon = statusIcon(rule.status);
        html += `<li class="rule-item ${ruleIcon.cssClass}">`;
        html += `<span class="rule-icon">${ruleIcon.icon}</span>`;
        html += `<span class="rule-name">${escapeHtml(rule.ruleName)}</span>`;
        html += `<span class="rule-detail">${escapeHtml(rule.detail)}</span>`;
        html += '</li>';
      }
      html += '</ul>';

      html += '</div>';
    }

    html += '</div></div>';
  }

  html += '</div>';
  container.innerHTML = html;
}
