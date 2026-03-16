/**
 * @fileoverview Pure compliance rule engine.
 * Evaluates break compliance for ArbZG §4, California labor law, and custom rules.
 * Zero side effects — all functions are pure and stateless.
 */

import type {
  UserDay,
  DayComplianceResult,
  RuleResult,
  ComplianceConfig,
  CustomRule,
  TimeSpan,
  ComplianceStatus,
} from './types.js';

// --- ArbZG §4 constants ---
const ARBZG_NO_BREAK_THRESHOLD = 360;      // 6h in minutes
const ARBZG_SHORT_BREAK_THRESHOLD = 540;    // 9h in minutes
const ARBZG_SHORT_BREAK_REQUIRED = 30;      // 30 min
const ARBZG_LONG_BREAK_REQUIRED = 45;       // 45 min
const ARBZG_MIN_BREAK_SEGMENT = 15;         // min break segment to count
const ARBZG_MAX_CONTINUOUS_WORK = 360;       // 6h max without break
const ARBZG_CONTINUOUS_GAP_TOLERANCE = 15;   // gaps < 15 min still count as continuous

// --- California constants ---
const CA_MEAL_THRESHOLD_1 = 300;             // 5h for first meal break
const CA_MEAL_THRESHOLD_2 = 600;             // 10h for second meal break
const CA_MEAL_BREAK_MIN = 30;                // 30 min meal break
const CA_REST_WORK_PERIOD = 240;             // 4h work period
const CA_REST_MAJOR_FRACTION = 120;          // >2h is major fraction
const CA_REST_BREAK_MIN = 10;                // 10 min rest break

// --- Core evaluation entry point ---

/**
 * Evaluates all compliance rules for a user-day based on jurisdiction.
 */
export function evaluateCompliance(
  config: ComplianceConfig,
  userDay: UserDay
): DayComplianceResult {
  let rules: RuleResult[];

  switch (config.jurisdiction) {
    case 'arbzg':
      rules = evaluateArbzg(userDay);
      break;
    case 'california':
      rules = evaluateCalifornia(userDay);
      break;
    case 'custom':
      rules = evaluateCustom(userDay, config.customRules ?? []);
      break;
    default:
      rules = [{
        ruleId: 'unknown-jurisdiction',
        ruleName: 'Unknown Jurisdiction',
        status: 'warn',
        detail: `Unknown jurisdiction: ${config.jurisdiction}`,
      }];
  }

  const overallStatus = deriveOverallStatus(rules);

  return {
    userId: userDay.userId,
    userName: userDay.userName,
    date: userDay.date,
    overallStatus,
    rules,
    totalWorkMinutes: userDay.totalWorkMinutes,
    totalBreakMinutes: userDay.totalBreakMinutes,
  };
}

/**
 * Derives overall status from rule results.
 * fail > warn > pass
 */
export function deriveOverallStatus(rules: RuleResult[]): ComplianceStatus {
  if (rules.some((r) => r.status === 'fail')) return 'fail';
  if (rules.some((r) => r.status === 'warn')) return 'warn';
  return 'pass';
}

// --- ArbZG §4 ---

/**
 * Evaluates German ArbZG §4 break rules.
 */
export function evaluateArbzg(userDay: UserDay): RuleResult[] {
  const rules: RuleResult[] = [];
  const { totalWorkMinutes, totalBreakMinutes, breakEntries } = userDay;

  // Rule 1: Total break duration requirement
  rules.push(evaluateArbzgTotalBreak(totalWorkMinutes, totalBreakMinutes, breakEntries));

  // Rule 2: Maximum continuous work without break (6h)
  rules.push(evaluateArbzgContinuousWork(userDay));

  return rules;
}

/**
 * ArbZG total break duration rule:
 * - ≤ 6h work: no break required
 * - 6-9h work: 30 min break required
 * - > 9h work: 45 min break required
 * Break segments must be ≥ 15 min to count.
 */
export function evaluateArbzgTotalBreak(
  totalWorkMinutes: number,
  totalBreakMinutes: number,
  breakEntries: TimeSpan[]
): RuleResult {
  // Determine required break
  let requiredMinutes = 0;
  if (totalWorkMinutes > ARBZG_SHORT_BREAK_THRESHOLD) {
    requiredMinutes = ARBZG_LONG_BREAK_REQUIRED;
  } else if (totalWorkMinutes > ARBZG_NO_BREAK_THRESHOLD) {
    requiredMinutes = ARBZG_SHORT_BREAK_REQUIRED;
  }

  if (requiredMinutes === 0) {
    return {
      ruleId: 'arbzg-total-break',
      ruleName: 'ArbZG §4 Total Break',
      status: 'pass',
      detail: `Worked ${Math.round(totalWorkMinutes)}min — no break required (≤ 6h).`,
      requiredMinutes: 0,
      actualMinutes: totalBreakMinutes,
    };
  }

  // Only count break segments ≥ 15 min
  const qualifyingBreakMinutes = sumQualifyingBreaks(breakEntries, ARBZG_MIN_BREAK_SEGMENT);

  const status: ComplianceStatus = qualifyingBreakMinutes >= requiredMinutes ? 'pass' : 'fail';

  return {
    ruleId: 'arbzg-total-break',
    ruleName: 'ArbZG §4 Total Break',
    status,
    detail: status === 'pass'
      ? `${Math.round(qualifyingBreakMinutes)}min qualifying break meets ${requiredMinutes}min requirement.`
      : `Only ${Math.round(qualifyingBreakMinutes)}min qualifying break — ${requiredMinutes}min required for ${Math.round(totalWorkMinutes)}min work.`,
    requiredMinutes,
    actualMinutes: qualifyingBreakMinutes,
  };
}

/**
 * ArbZG continuous work rule: max 6h without a qualifying break.
 *
 * Algorithm:
 * 1. Sort work entries by start time
 * 2. Walk entries maintaining a continuous-work accumulator
 * 3. Gap < 15 min between consecutive entries → still continuous
 * 4. Qualifying BREAK entry (≥ 15 min) in gap → reset accumulator
 * 5. Accumulator > 360 min → violation
 * 6. Untracked gaps (no BREAK entry) do NOT count as breaks (conservative)
 */
export function evaluateArbzgContinuousWork(userDay: UserDay): RuleResult {
  const { workEntries, breakEntries } = userDay;

  if (workEntries.length === 0) {
    return {
      ruleId: 'arbzg-continuous-work',
      ruleName: 'ArbZG §4 Continuous Work',
      status: 'pass',
      detail: 'No work entries.',
    };
  }

  const sortedWork = [...workEntries].sort((a, b) => a.start.getTime() - b.start.getTime());
  const sortedBreaks = [...breakEntries]
    .filter((b) => b.durationMinutes >= ARBZG_MIN_BREAK_SEGMENT)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let continuousMinutes = sortedWork[0].durationMinutes;
  let maxContinuous = continuousMinutes;

  for (let i = 1; i < sortedWork.length; i++) {
    const prev = sortedWork[i - 1];
    const curr = sortedWork[i];
    const gapStart = prev.end.getTime();
    const gapEnd = curr.start.getTime();
    const gapMinutes = (gapEnd - gapStart) / 60_000;

    // Check if a qualifying break falls within this gap
    const hasQualifyingBreak = sortedBreaks.some((b) =>
      b.start.getTime() >= gapStart &&
      b.end.getTime() <= gapEnd &&
      b.durationMinutes >= ARBZG_MIN_BREAK_SEGMENT
    );

    if (hasQualifyingBreak) {
      // Break resets the accumulator
      continuousMinutes = curr.durationMinutes;
    } else if (gapMinutes < ARBZG_CONTINUOUS_GAP_TOLERANCE) {
      // Short gap (< 15 min): still considered continuous
      continuousMinutes += gapMinutes + curr.durationMinutes;
    } else {
      // Untracked gap ≥ 15 min but no BREAK entry: conservative — still continuous
      // (fail-safe: we don't assume untracked time is a break)
      continuousMinutes += gapMinutes + curr.durationMinutes;
    }

    maxContinuous = Math.max(maxContinuous, continuousMinutes);
  }

  const status: ComplianceStatus = maxContinuous <= ARBZG_MAX_CONTINUOUS_WORK ? 'pass' : 'fail';

  return {
    ruleId: 'arbzg-continuous-work',
    ruleName: 'ArbZG §4 Continuous Work',
    status,
    detail: status === 'pass'
      ? `Max continuous work: ${Math.round(maxContinuous)}min (limit: ${ARBZG_MAX_CONTINUOUS_WORK}min).`
      : `${Math.round(maxContinuous)}min continuous work exceeds ${ARBZG_MAX_CONTINUOUS_WORK}min limit.`,
  };
}

// --- California Labor Law ---

/**
 * Evaluates California labor law break rules.
 */
export function evaluateCalifornia(userDay: UserDay): RuleResult[] {
  const rules: RuleResult[] = [];
  const { totalWorkMinutes } = userDay;

  // Rule 1: Meal breaks
  rules.push(evaluateCaliforniaMealBreaks(userDay));

  // Rule 2: Rest breaks
  if (totalWorkMinutes > 0) {
    rules.push(evaluateCaliforniaRestBreaks(userDay));
  }

  return rules;
}

/**
 * California meal break rule:
 * - ≤ 5h: no meal break required
 * - 5-10h: 1 × 30 min (must start by end of 5th hour)
 * - > 10h: 2 × 30 min
 */
export function evaluateCaliforniaMealBreaks(userDay: UserDay): RuleResult {
  const { totalWorkMinutes, breakEntries } = userDay;

  let requiredMealBreaks = 0;
  if (totalWorkMinutes > CA_MEAL_THRESHOLD_2) {
    requiredMealBreaks = 2;
  } else if (totalWorkMinutes > CA_MEAL_THRESHOLD_1) {
    requiredMealBreaks = 1;
  }

  if (requiredMealBreaks === 0) {
    return {
      ruleId: 'ca-meal-break',
      ruleName: 'CA Meal Break',
      status: 'pass',
      detail: `Worked ${Math.round(totalWorkMinutes)}min — no meal break required (≤ 5h).`,
      requiredMinutes: 0,
      actualMinutes: userDay.totalBreakMinutes,
    };
  }

  // Count break entries ≥ 30 min as meal breaks
  const mealBreaks = breakEntries.filter((b) => b.durationMinutes >= CA_MEAL_BREAK_MIN);
  const actualMealBreaks = mealBreaks.length;

  const status: ComplianceStatus = actualMealBreaks >= requiredMealBreaks ? 'pass' : 'fail';

  return {
    ruleId: 'ca-meal-break',
    ruleName: 'CA Meal Break',
    status,
    detail: status === 'pass'
      ? `${actualMealBreaks} meal break(s) taken (${requiredMealBreaks} required).`
      : `Only ${actualMealBreaks} meal break(s) — ${requiredMealBreaks} required for ${Math.round(totalWorkMinutes)}min shift. Penalty: 1h regular rate per missed break.`,
    requiredMinutes: requiredMealBreaks * CA_MEAL_BREAK_MIN,
    actualMinutes: mealBreaks.reduce((sum, b) => sum + b.durationMinutes, 0),
  };
}

/**
 * California rest break rule:
 * - 1 × 10 min paid rest per 4h worked (or major fraction > 2h)
 */
export function evaluateCaliforniaRestBreaks(userDay: UserDay): RuleResult {
  const { totalWorkMinutes, breakEntries } = userDay;

  // Calculate required rest breaks: 1 per 4h (or major fraction > 2h)
  // The first rest break kicks in at 3.5h (210min) per CA case law interpretation,
  // but strictly: 1 per 4h worked, plus one more if remainder exceeds 2h.
  // No rest break required if total work < 3.5h.
  const fullPeriods = Math.floor(totalWorkMinutes / CA_REST_WORK_PERIOD);
  const remainder = totalWorkMinutes % CA_REST_WORK_PERIOD;
  // Only count remainder as major fraction if there's at least one full period
  // OR the total work itself exceeds a major fraction of 4h (> 2h with intent to work 4h)
  const requiredRestBreaks = fullPeriods + (fullPeriods > 0 && remainder > CA_REST_MAJOR_FRACTION ? 1 : 0);

  if (requiredRestBreaks === 0) {
    return {
      ruleId: 'ca-rest-break',
      ruleName: 'CA Rest Break',
      status: 'pass',
      detail: `Worked ${Math.round(totalWorkMinutes)}min — no rest break required.`,
      requiredMinutes: 0,
      actualMinutes: 0,
    };
  }

  // Count break entries ≥ 10 min but < 30 min as rest breaks
  // (breaks ≥ 30 min are meal breaks, not rest breaks)
  const restBreaks = breakEntries.filter(
    (b) => b.durationMinutes >= CA_REST_BREAK_MIN && b.durationMinutes < CA_MEAL_BREAK_MIN
  );
  const actualRestBreaks = restBreaks.length;

  const status: ComplianceStatus = actualRestBreaks >= requiredRestBreaks ? 'pass' : 'warn';

  return {
    ruleId: 'ca-rest-break',
    ruleName: 'CA Rest Break',
    status,
    detail: status === 'pass'
      ? `${actualRestBreaks} rest break(s) taken (${requiredRestBreaks} required).`
      : `Only ${actualRestBreaks} rest break(s) — ${requiredRestBreaks} required. Penalty: 1h regular rate per missed rest break.`,
    requiredMinutes: requiredRestBreaks * CA_REST_BREAK_MIN,
    actualMinutes: restBreaks.reduce((sum, b) => sum + b.durationMinutes, 0),
  };
}

// --- Custom rules ---

/**
 * Evaluates custom threshold rules.
 * Each custom rule defines a work threshold and required break amount.
 */
export function evaluateCustom(userDay: UserDay, customRules: CustomRule[]): RuleResult[] {
  if (customRules.length === 0) {
    return [{
      ruleId: 'custom-no-rules',
      ruleName: 'Custom Rules',
      status: 'warn',
      detail: 'No custom rules configured.',
    }];
  }

  const { totalWorkMinutes, totalBreakMinutes } = userDay;

  return customRules.map((rule, index) => {
    if (totalWorkMinutes <= rule.minWorkMinutes) {
      return {
        ruleId: `custom-rule-${index}`,
        ruleName: `Custom Rule ${index + 1}`,
        status: 'pass' as ComplianceStatus,
        detail: `Worked ${Math.round(totalWorkMinutes)}min — below ${rule.minWorkMinutes}min threshold.`,
        requiredMinutes: 0,
        actualMinutes: totalBreakMinutes,
      };
    }

    const status: ComplianceStatus = totalBreakMinutes >= rule.requiredBreakMinutes ? 'pass' : 'fail';

    return {
      ruleId: `custom-rule-${index}`,
      ruleName: `Custom Rule ${index + 1}`,
      status,
      detail: status === 'pass'
        ? `${Math.round(totalBreakMinutes)}min break meets ${rule.requiredBreakMinutes}min requirement.`
        : `Only ${Math.round(totalBreakMinutes)}min break — ${rule.requiredBreakMinutes}min required when working > ${rule.minWorkMinutes}min.`,
      requiredMinutes: rule.requiredBreakMinutes,
      actualMinutes: totalBreakMinutes,
    };
  });
}

// --- Helpers ---

/**
 * Sums the duration of break entries that meet the minimum segment threshold.
 */
export function sumQualifyingBreaks(breakEntries: TimeSpan[], minSegmentMinutes: number): number {
  return breakEntries
    .filter((b) => b.durationMinutes >= minSegmentMinutes)
    .reduce((sum, b) => sum + b.durationMinutes, 0);
}

/**
 * Groups raw report entries into UserDay structures.
 * Entries are grouped by userId and date.
 */
export function groupByUserAndDay(
  entries: Array<{
    userId: string;
    userName?: string;
    timeInterval: { start: string; end: string; duration: number };
    type: string;
  }>
): Map<string, Map<string, UserDay>> {
  const result = new Map<string, Map<string, UserDay>>();

  for (const entry of entries) {
    const start = new Date(entry.timeInterval.start);
    const end = new Date(entry.timeInterval.end);
    const dateKey = start.toISOString().slice(0, 10);
    const durationMinutes = entry.timeInterval.duration / 60;
    const span: TimeSpan = { start, end, durationMinutes };

    if (!result.has(entry.userId)) {
      result.set(entry.userId, new Map());
    }
    const userDays = result.get(entry.userId)!;

    if (!userDays.has(dateKey)) {
      userDays.set(dateKey, {
        userId: entry.userId,
        userName: entry.userName ?? entry.userId,
        date: dateKey,
        workEntries: [],
        breakEntries: [],
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
      });
    }
    const day = userDays.get(dateKey)!;

    if (entry.type === 'BREAK') {
      day.breakEntries.push(span);
      day.totalBreakMinutes += durationMinutes;
    } else if (entry.type === 'REGULAR') {
      day.workEntries.push(span);
      day.totalWorkMinutes += durationMinutes;
    }
    // HOLIDAY and TIME_OFF entries are ignored for compliance checks
  }

  return result;
}
