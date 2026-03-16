/**
 * @fileoverview Weekly pivot table: users (rows) x days (columns), status icons.
 */

import type { DayComplianceResult, ClockifyUser } from '../types.js';
import { escapeHtml, getWeekDates, getDayName, formatMinutes } from '../utils.js';
import { getResultsContainer, statusIcon } from './index.js';

/**
 * Renders the pivot table into the results container.
 */
export function renderPivotTable(
  results: Map<string, Map<string, DayComplianceResult>>,
  users: ClockifyUser[],
  weekStartDate: string
): void {
  const container = getResultsContainer();
  if (!container) return;

  const weekDates = getWeekDates(new Date(weekStartDate + 'T00:00:00'));

  // Build table HTML
  let html = '<table class="pivot-table">';

  // Header row: empty cell + day names
  html += '<thead><tr><th class="user-col">User</th>';
  for (const date of weekDates) {
    html += `<th class="day-col"><div class="day-name">${getDayName(date)}</div><div class="day-date">${escapeHtml(date.slice(5))}</div></th>`;
  }
  html += '</tr></thead>';

  // Body rows: one per user
  html += '<tbody>';

  // Sort users alphabetically
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  for (const user of sortedUsers) {
    const userResults = results.get(user.id);
    html += `<tr><td class="user-col" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</td>`;

    for (const date of weekDates) {
      const dayResult = userResults?.get(date);
      if (dayResult) {
        const { icon, cssClass } = statusIcon(dayResult.overallStatus);
        const tooltip = dayResult.rules
          .map((r) => `${r.ruleName}: ${r.status.toUpperCase()} - ${r.detail}`)
          .join('\n');
        html += `<td class="day-cell ${cssClass}" title="${escapeHtml(tooltip)}">`;
        html += `<span class="status-icon">${icon}</span>`;
        html += `<div class="cell-detail">${formatMinutes(dayResult.totalWorkMinutes)}</div>`;
        html += '</td>';
      } else {
        // No data for this day
        html += '<td class="day-cell status-none"><span class="status-icon">\u2014</span></td>';
      }
    }

    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}
