/**
 * @fileoverview Pivot table: users (rows) x days/weeks (columns), status icons.
 * Supports arbitrary date ranges with horizontal scroll and ISO-week aggregation for year view.
 */

import type { DayComplianceResult, ClockifyUser, ComplianceStatus } from '../types.js';
import { escapeHtml, getDayName, formatMinutes, getIsoWeekNumber } from '../utils.js';
import { getResultsContainer, statusIcon } from './index.js';

/**
 * For year-view aggregation: derives the worst status across multiple days.
 */
function worstStatus(statuses: ComplianceStatus[]): ComplianceStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

/**
 * Groups date keys into ISO week buckets, returning an ordered array of { weekLabel, dateKeys }.
 */
function groupByIsoWeek(dateKeys: string[]): Array<{ weekLabel: string; dateKeys: string[] }> {
  const weekMap = new Map<string, string[]>();
  const weekOrder: string[] = [];

  for (const dk of dateKeys) {
    const d = new Date(dk + 'T00:00:00');
    const weekNum = getIsoWeekNumber(d);
    const year = d.getFullYear();
    const key = `${year}-W${String(weekNum).padStart(2, '0')}`;
    if (!weekMap.has(key)) {
      weekMap.set(key, []);
      weekOrder.push(key);
    }
    weekMap.get(key)!.push(dk);
  }

  return weekOrder.map((key) => ({ weekLabel: key, dateKeys: weekMap.get(key)! }));
}

/**
 * Renders the pivot table into the results container.
 * Accepts an array of date keys (YYYY-MM-DD) for arbitrary date ranges.
 */
export function renderPivotTable(
  results: Map<string, Map<string, DayComplianceResult>>,
  users: ClockifyUser[],
  dateKeys: string[]
): void {
  const container = getResultsContainer();
  if (!container) return;

  const useWeekAggregation = dateKeys.length >= 365;
  const needsScroll = dateKeys.length > 7;

  // Sort users alphabetically
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  let tableHtml: string;

  if (useWeekAggregation) {
    // Year view: aggregate by ISO week
    const weeks = groupByIsoWeek(dateKeys);
    tableHtml = buildWeekAggregatedTable(results, sortedUsers, weeks);
  } else {
    // Day-level view
    tableHtml = buildDayTable(results, sortedUsers, dateKeys);
  }

  if (needsScroll) {
    container.innerHTML = `<div class="pivot-scroll-container">${tableHtml}</div>`;
  } else {
    container.innerHTML = tableHtml;
  }
}

function buildDayTable(
  results: Map<string, Map<string, DayComplianceResult>>,
  sortedUsers: ClockifyUser[],
  dateKeys: string[]
): string {
  let html = '<table class="pivot-table">';

  // Header row
  html += '<thead><tr><th class="user-col">User</th>';
  for (const date of dateKeys) {
    html += `<th class="day-col"><div class="day-name">${getDayName(date)}</div><div class="day-date">${escapeHtml(date.slice(5))}</div></th>`;
  }
  html += '</tr></thead>';

  // Body rows
  html += '<tbody>';
  for (const user of sortedUsers) {
    const userResults = results.get(user.id);
    html += `<tr><td class="user-col" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</td>`;

    for (const date of dateKeys) {
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
        html += '<td class="day-cell status-none"><span class="status-icon">\u2014</span></td>';
      }
    }

    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function buildWeekAggregatedTable(
  results: Map<string, Map<string, DayComplianceResult>>,
  sortedUsers: ClockifyUser[],
  weeks: Array<{ weekLabel: string; dateKeys: string[] }>
): string {
  let html = '<table class="pivot-table">';

  // Header row
  html += '<thead><tr><th class="user-col">User</th>';
  for (const week of weeks) {
    html += `<th class="day-col"><div class="day-name">${escapeHtml(week.weekLabel)}</div></th>`;
  }
  html += '</tr></thead>';

  // Body rows
  html += '<tbody>';
  for (const user of sortedUsers) {
    const userResults = results.get(user.id);
    html += `<tr><td class="user-col" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</td>`;

    for (const week of weeks) {
      // Collect statuses across all days in the week for this user
      const dayStatuses: ComplianceStatus[] = [];
      let totalWork = 0;

      for (const dk of week.dateKeys) {
        const dayResult = userResults?.get(dk);
        if (dayResult) {
          dayStatuses.push(dayResult.overallStatus);
          totalWork += dayResult.totalWorkMinutes;
        }
      }

      if (dayStatuses.length > 0) {
        const aggStatus = worstStatus(dayStatuses);
        const { icon, cssClass } = statusIcon(aggStatus);
        const tooltip = `${week.weekLabel}: ${dayStatuses.length} day(s) tracked, worst: ${aggStatus}`;
        html += `<td class="day-cell ${cssClass}" title="${escapeHtml(tooltip)}">`;
        html += `<span class="status-icon">${icon}</span>`;
        html += `<div class="cell-detail">${formatMinutes(totalWork)}</div>`;
        html += '</td>';
      } else {
        html += '<td class="day-cell status-none"><span class="status-icon">\u2014</span></td>';
      }
    }

    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}
