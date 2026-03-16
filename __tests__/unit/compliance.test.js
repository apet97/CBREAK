/**
 * @fileoverview Full test matrix for compliance engine.
 * Tests ArbZG §4, California labor law, custom rules, and edge cases.
 */

import {
  evaluateCompliance,
  evaluateArbzg,
  evaluateArbzgTotalBreak,
  evaluateArbzgContinuousWork,
  evaluateCalifornia,
  evaluateCaliforniaMealBreaks,
  evaluateCaliforniaRestBreaks,
  evaluateCustom,
  deriveOverallStatus,
  sumQualifyingBreaks,
  groupByUserAndDay,
} from '../../js/compliance.js';

// --- Helpers ---

function makeTimeSpan(startHour, startMin, endHour, endMin, date = '2026-03-16') {
  const start = new Date(`${date}T${pad(startHour)}:${pad(startMin)}:00`);
  const end = new Date(`${date}T${pad(endHour)}:${pad(endMin)}:00`);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  return { start, end, durationMinutes };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function makeUserDay(overrides) {
  return {
    userId: 'user1',
    userName: 'Test User',
    date: '2026-03-16',
    workEntries: [],
    breakEntries: [],
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
    ...overrides,
  };
}

// --- deriveOverallStatus ---

describe('deriveOverallStatus', () => {
  test('returns pass when all rules pass', () => {
    expect(deriveOverallStatus([
      { ruleId: 'a', ruleName: 'A', status: 'pass', detail: '' },
      { ruleId: 'b', ruleName: 'B', status: 'pass', detail: '' },
    ])).toBe('pass');
  });

  test('returns warn when any rule warns but none fail', () => {
    expect(deriveOverallStatus([
      { ruleId: 'a', ruleName: 'A', status: 'pass', detail: '' },
      { ruleId: 'b', ruleName: 'B', status: 'warn', detail: '' },
    ])).toBe('warn');
  });

  test('returns fail when any rule fails', () => {
    expect(deriveOverallStatus([
      { ruleId: 'a', ruleName: 'A', status: 'warn', detail: '' },
      { ruleId: 'b', ruleName: 'B', status: 'fail', detail: '' },
    ])).toBe('fail');
  });

  test('returns pass for empty rules', () => {
    expect(deriveOverallStatus([])).toBe('pass');
  });
});

// --- sumQualifyingBreaks ---

describe('sumQualifyingBreaks', () => {
  test('sums breaks meeting minimum segment', () => {
    const breaks = [
      makeTimeSpan(12, 0, 12, 20),  // 20 min
      makeTimeSpan(15, 0, 15, 10),  // 10 min (< 15 min threshold)
      makeTimeSpan(17, 0, 17, 15),  // 15 min
    ];
    expect(sumQualifyingBreaks(breaks, 15)).toBe(35);
  });

  test('returns 0 when no breaks qualify', () => {
    const breaks = [
      makeTimeSpan(12, 0, 12, 10),  // 10 min
      makeTimeSpan(15, 0, 15, 5),   // 5 min
    ];
    expect(sumQualifyingBreaks(breaks, 15)).toBe(0);
  });

  test('returns 0 for empty breaks', () => {
    expect(sumQualifyingBreaks([], 15)).toBe(0);
  });
});

// --- ArbZG §4: Total Break ---

describe('ArbZG §4 Total Break', () => {
  test('≤ 6h work: no break required', () => {
    const result = evaluateArbzgTotalBreak(360, 0, []);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(0);
  });

  test('5h work: no break required', () => {
    const result = evaluateArbzgTotalBreak(300, 0, []);
    expect(result.status).toBe('pass');
  });

  test('7h work with 30min qualifying break: pass', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 30)];
    const result = evaluateArbzgTotalBreak(420, 30, breaks);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(30);
    expect(result.actualMinutes).toBe(30);
  });

  test('7h work with 20min break: fail (need 30min)', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 20)];
    const result = evaluateArbzgTotalBreak(420, 20, breaks);
    expect(result.status).toBe('fail');
    expect(result.requiredMinutes).toBe(30);
    expect(result.actualMinutes).toBe(20);
  });

  test('7h work with two 15min breaks: pass (15+15=30)', () => {
    const breaks = [
      makeTimeSpan(11, 0, 11, 15),
      makeTimeSpan(14, 0, 14, 15),
    ];
    const result = evaluateArbzgTotalBreak(420, 30, breaks);
    expect(result.status).toBe('pass');
    expect(result.actualMinutes).toBe(30);
  });

  test('7h work with 10min break: fail (segment < 15min)', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 10)];
    const result = evaluateArbzgTotalBreak(420, 10, breaks);
    expect(result.status).toBe('fail');
    expect(result.actualMinutes).toBe(0); // 10 min < 15 min threshold
  });

  test('10h work with 45min break: pass', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 45)];
    const result = evaluateArbzgTotalBreak(600, 45, breaks);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(45);
  });

  test('10h work with 30min break: fail (need 45min)', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 30)];
    const result = evaluateArbzgTotalBreak(600, 30, breaks);
    expect(result.status).toBe('fail');
    expect(result.requiredMinutes).toBe(45);
    expect(result.actualMinutes).toBe(30);
  });

  test('exactly 6h (360min): no break required', () => {
    const result = evaluateArbzgTotalBreak(360, 0, []);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(0);
  });

  test('6h01 (361min): 30min break required', () => {
    const result = evaluateArbzgTotalBreak(361, 0, []);
    expect(result.status).toBe('fail');
    expect(result.requiredMinutes).toBe(30);
  });

  test('exactly 9h (540min): 30min break required', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 30)];
    const result = evaluateArbzgTotalBreak(540, 30, breaks);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(30);
  });

  test('9h01 (541min): 45min break required', () => {
    const breaks = [makeTimeSpan(12, 0, 12, 30)];
    const result = evaluateArbzgTotalBreak(541, 30, breaks);
    expect(result.status).toBe('fail');
    expect(result.requiredMinutes).toBe(45);
  });
});

// --- ArbZG §4: Continuous Work ---

describe('ArbZG §4 Continuous Work', () => {
  test('no work entries: pass', () => {
    const day = makeUserDay({});
    const result = evaluateArbzgContinuousWork(day);
    expect(result.status).toBe('pass');
  });

  test('5h continuous work: pass (< 6h limit)', () => {
    const day = makeUserDay({
      workEntries: [makeTimeSpan(8, 0, 13, 0)],
      totalWorkMinutes: 300,
    });
    const result = evaluateArbzgContinuousWork(day);
    expect(result.status).toBe('pass');
  });

  test('7h continuous work without break: fail', () => {
    const day = makeUserDay({
      workEntries: [makeTimeSpan(8, 0, 15, 0)],
      totalWorkMinutes: 420,
    });
    const result = evaluateArbzgContinuousWork(day);
    expect(result.status).toBe('fail');
  });

  test('8h with 20min qualifying break in middle: pass', () => {
    const day = makeUserDay({
      workEntries: [
        makeTimeSpan(8, 0, 12, 0),   // 4h
        makeTimeSpan(12, 20, 16, 20), // 4h
      ],
      breakEntries: [makeTimeSpan(12, 0, 12, 20)], // 20min break
      totalWorkMinutes: 480,
    });
    const result = evaluateArbzgContinuousWork(day);
    expect(result.status).toBe('pass');
  });

  test('8h with short gap but no break entry: fail (conservative)', () => {
    const day = makeUserDay({
      workEntries: [
        makeTimeSpan(8, 0, 12, 0),   // 4h
        makeTimeSpan(12, 5, 16, 5),  // 4h (5min gap, no break entry)
      ],
      breakEntries: [],
      totalWorkMinutes: 480,
    });
    const result = evaluateArbzgContinuousWork(day);
    expect(result.status).toBe('fail');
  });

  test('10min break does not reset continuous counter', () => {
    const day = makeUserDay({
      workEntries: [
        makeTimeSpan(8, 0, 12, 0),
        makeTimeSpan(12, 10, 16, 10),
      ],
      breakEntries: [makeTimeSpan(12, 0, 12, 10)], // 10 min < 15 min threshold
      totalWorkMinutes: 480,
    });
    const result = evaluateArbzgContinuousWork(day);
    expect(result.status).toBe('fail');
  });
});

// --- ArbZG full evaluation ---

describe('evaluateArbzg', () => {
  test('returns two rules (total break + continuous work)', () => {
    const day = makeUserDay({ totalWorkMinutes: 300 });
    const rules = evaluateArbzg(day);
    expect(rules).toHaveLength(2);
    expect(rules[0].ruleId).toBe('arbzg-total-break');
    expect(rules[1].ruleId).toBe('arbzg-continuous-work');
  });
});

// --- California: Meal Breaks ---

describe('CA Meal Breaks', () => {
  test('≤ 5h work: no meal break required', () => {
    const day = makeUserDay({ totalWorkMinutes: 300 });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(0);
  });

  test('6h work with 30min break: pass', () => {
    const day = makeUserDay({
      totalWorkMinutes: 360,
      breakEntries: [makeTimeSpan(12, 0, 12, 30)],
      totalBreakMinutes: 30,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('pass');
  });

  test('6h work with no break: fail', () => {
    const day = makeUserDay({
      totalWorkMinutes: 360,
      breakEntries: [],
      totalBreakMinutes: 0,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('fail');
  });

  test('6h work with 20min break: fail (need 30min meal break)', () => {
    const day = makeUserDay({
      totalWorkMinutes: 360,
      breakEntries: [makeTimeSpan(12, 0, 12, 20)],
      totalBreakMinutes: 20,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('fail');
  });

  test('11h work with 2 meal breaks: pass', () => {
    const day = makeUserDay({
      totalWorkMinutes: 660,
      breakEntries: [
        makeTimeSpan(12, 0, 12, 30),
        makeTimeSpan(17, 0, 17, 30),
      ],
      totalBreakMinutes: 60,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('pass');
  });

  test('11h work with 1 meal break: fail (need 2)', () => {
    const day = makeUserDay({
      totalWorkMinutes: 660,
      breakEntries: [makeTimeSpan(12, 0, 12, 30)],
      totalBreakMinutes: 30,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('fail');
  });

  test('exactly 5h (300min): no meal break required', () => {
    const day = makeUserDay({ totalWorkMinutes: 300 });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(0);
  });

  test('5h01 (301min): 1 meal break required', () => {
    const day = makeUserDay({ totalWorkMinutes: 301, breakEntries: [], totalBreakMinutes: 0 });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('fail');
    expect(result.requiredMinutes).toBe(30);
  });

  test('exactly 10h (600min): 1 meal break required', () => {
    const day = makeUserDay({
      totalWorkMinutes: 600,
      breakEntries: [makeTimeSpan(12, 0, 12, 30)],
      totalBreakMinutes: 30,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('pass');
  });

  test('10h01 (601min): 2 meal breaks required', () => {
    const day = makeUserDay({
      totalWorkMinutes: 601,
      breakEntries: [makeTimeSpan(12, 0, 12, 30)],
      totalBreakMinutes: 30,
    });
    const result = evaluateCaliforniaMealBreaks(day);
    expect(result.status).toBe('fail');
  });
});

// --- California: Rest Breaks ---

describe('CA Rest Breaks', () => {
  test('3h work: no rest break required', () => {
    const day = makeUserDay({ totalWorkMinutes: 180 });
    const result = evaluateCaliforniaRestBreaks(day);
    expect(result.status).toBe('pass');
    expect(result.requiredMinutes).toBe(0);
  });

  test('4h work: 1 rest break required', () => {
    const day = makeUserDay({
      totalWorkMinutes: 240,
      breakEntries: [],
      totalBreakMinutes: 0,
    });
    const result = evaluateCaliforniaRestBreaks(day);
    expect(result.status).toBe('warn');
    expect(result.requiredMinutes).toBe(10);
  });

  test('4h work with 10min rest break: pass', () => {
    const day = makeUserDay({
      totalWorkMinutes: 240,
      breakEntries: [makeTimeSpan(10, 0, 10, 10)],
      totalBreakMinutes: 10,
    });
    const result = evaluateCaliforniaRestBreaks(day);
    expect(result.status).toBe('pass');
  });

  test('6h30 work: 2 rest breaks required (4h + >2h remainder)', () => {
    const day = makeUserDay({
      totalWorkMinutes: 390,
      breakEntries: [makeTimeSpan(10, 0, 10, 10)],
      totalBreakMinutes: 10,
    });
    const result = evaluateCaliforniaRestBreaks(day);
    expect(result.status).toBe('warn'); // only 1 of 2 rest breaks
    expect(result.requiredMinutes).toBe(20); // 2 * 10
  });

  test('rest breaks exclude meal breaks (≥ 30min)', () => {
    const day = makeUserDay({
      totalWorkMinutes: 360,
      breakEntries: [makeTimeSpan(12, 0, 12, 30)], // This is a meal break, not rest
      totalBreakMinutes: 30,
    });
    const result = evaluateCaliforniaRestBreaks(day);
    // 360min = 1 full 4h period + 2h remainder (not major fraction)
    expect(result.requiredMinutes).toBe(10); // 1 rest break
    expect(result.status).toBe('warn'); // 0 rest breaks (30min is meal, not rest)
  });

  test('5h work with no remainder > 2h: 1 rest break', () => {
    const day = makeUserDay({
      totalWorkMinutes: 300, // 4h full + 1h remainder (< 2h, not major fraction)
      breakEntries: [makeTimeSpan(10, 0, 10, 10)],
      totalBreakMinutes: 10,
    });
    const result = evaluateCaliforniaRestBreaks(day);
    expect(result.status).toBe('pass');
  });
});

// --- California full evaluation ---

describe('evaluateCalifornia', () => {
  test('returns meal + rest rules for work > 0', () => {
    const day = makeUserDay({ totalWorkMinutes: 360 });
    const rules = evaluateCalifornia(day);
    expect(rules).toHaveLength(2);
    expect(rules[0].ruleId).toBe('ca-meal-break');
    expect(rules[1].ruleId).toBe('ca-rest-break');
  });

  test('zero work: only meal break rule', () => {
    const day = makeUserDay({ totalWorkMinutes: 0 });
    const rules = evaluateCalifornia(day);
    expect(rules).toHaveLength(1);
    expect(rules[0].ruleId).toBe('ca-meal-break');
  });
});

// --- Custom rules ---

describe('evaluateCustom', () => {
  test('no custom rules: returns warning', () => {
    const day = makeUserDay({ totalWorkMinutes: 480 });
    const rules = evaluateCustom(day, []);
    expect(rules).toHaveLength(1);
    expect(rules[0].status).toBe('warn');
    expect(rules[0].ruleId).toBe('custom-no-rules');
  });

  test('below threshold: pass', () => {
    const day = makeUserDay({ totalWorkMinutes: 300, totalBreakMinutes: 0 });
    const rules = evaluateCustom(day, [
      { minWorkMinutes: 360, requiredBreakMinutes: 30 },
    ]);
    expect(rules[0].status).toBe('pass');
  });

  test('above threshold with sufficient break: pass', () => {
    const day = makeUserDay({ totalWorkMinutes: 420, totalBreakMinutes: 30 });
    const rules = evaluateCustom(day, [
      { minWorkMinutes: 360, requiredBreakMinutes: 30 },
    ]);
    expect(rules[0].status).toBe('pass');
  });

  test('above threshold with insufficient break: fail', () => {
    const day = makeUserDay({ totalWorkMinutes: 420, totalBreakMinutes: 15 });
    const rules = evaluateCustom(day, [
      { minWorkMinutes: 360, requiredBreakMinutes: 30 },
    ]);
    expect(rules[0].status).toBe('fail');
  });

  test('multiple custom rules evaluated independently', () => {
    const day = makeUserDay({ totalWorkMinutes: 600, totalBreakMinutes: 30 });
    const rules = evaluateCustom(day, [
      { minWorkMinutes: 360, requiredBreakMinutes: 30 },
      { minWorkMinutes: 540, requiredBreakMinutes: 45 },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0].status).toBe('pass');  // 30 >= 30
    expect(rules[1].status).toBe('fail');  // 30 < 45
  });

  test('exactly at threshold: pass (≤ check)', () => {
    const day = makeUserDay({ totalWorkMinutes: 360, totalBreakMinutes: 0 });
    const rules = evaluateCustom(day, [
      { minWorkMinutes: 360, requiredBreakMinutes: 30 },
    ]);
    expect(rules[0].status).toBe('pass');
  });
});

// --- evaluateCompliance (top-level) ---

describe('evaluateCompliance', () => {
  test('arbzg jurisdiction', () => {
    const day = makeUserDay({ totalWorkMinutes: 300 });
    const result = evaluateCompliance({ jurisdiction: 'arbzg' }, day);
    expect(result.overallStatus).toBe('pass');
    expect(result.rules).toHaveLength(2);
    expect(result.userId).toBe('user1');
    expect(result.date).toBe('2026-03-16');
  });

  test('california jurisdiction', () => {
    const day = makeUserDay({ totalWorkMinutes: 360, breakEntries: [], totalBreakMinutes: 0 });
    const result = evaluateCompliance({ jurisdiction: 'california' }, day);
    expect(result.overallStatus).toBe('fail');
  });

  test('custom jurisdiction with rules', () => {
    const day = makeUserDay({ totalWorkMinutes: 480, totalBreakMinutes: 30 });
    const result = evaluateCompliance(
      { jurisdiction: 'custom', customRules: [{ minWorkMinutes: 360, requiredBreakMinutes: 30 }] },
      day
    );
    expect(result.overallStatus).toBe('pass');
  });

  test('unknown jurisdiction returns warning', () => {
    const day = makeUserDay({ totalWorkMinutes: 480 });
    const result = evaluateCompliance({ jurisdiction: 'unknown' }, day);
    expect(result.overallStatus).toBe('warn');
  });
});

// --- groupByUserAndDay ---

describe('groupByUserAndDay', () => {
  test('groups entries by user and day', () => {
    const entries = [
      {
        userId: 'u1', userName: 'Alice',
        timeInterval: { start: '2026-03-16T08:00:00Z', end: '2026-03-16T12:00:00Z', duration: 14400 },
        type: 'REGULAR',
      },
      {
        userId: 'u1', userName: 'Alice',
        timeInterval: { start: '2026-03-16T12:00:00Z', end: '2026-03-16T12:30:00Z', duration: 1800 },
        type: 'BREAK',
      },
      {
        userId: 'u2', userName: 'Bob',
        timeInterval: { start: '2026-03-16T09:00:00Z', end: '2026-03-16T17:00:00Z', duration: 28800 },
        type: 'REGULAR',
      },
    ];

    const result = groupByUserAndDay(entries);
    expect(result.size).toBe(2);

    const aliceDays = result.get('u1');
    expect(aliceDays).toBeDefined();
    expect(aliceDays.size).toBe(1);

    const aliceDay = aliceDays.get('2026-03-16');
    expect(aliceDay.workEntries).toHaveLength(1);
    expect(aliceDay.breakEntries).toHaveLength(1);
    expect(aliceDay.totalWorkMinutes).toBe(240);
    expect(aliceDay.totalBreakMinutes).toBe(30);

    const bobDays = result.get('u2');
    expect(bobDays.get('2026-03-16').totalWorkMinutes).toBe(480);
  });

  test('ignores HOLIDAY and TIME_OFF entries', () => {
    const entries = [
      {
        userId: 'u1', userName: 'Alice',
        timeInterval: { start: '2026-03-16T08:00:00Z', end: '2026-03-16T16:00:00Z', duration: 28800 },
        type: 'HOLIDAY',
      },
    ];
    const result = groupByUserAndDay(entries);
    const day = result.get('u1').get('2026-03-16');
    expect(day.workEntries).toHaveLength(0);
    expect(day.breakEntries).toHaveLength(0);
    expect(day.totalWorkMinutes).toBe(0);
  });

  test('handles entries across multiple days', () => {
    const entries = [
      {
        userId: 'u1', userName: 'Alice',
        timeInterval: { start: '2026-03-16T08:00:00Z', end: '2026-03-16T16:00:00Z', duration: 28800 },
        type: 'REGULAR',
      },
      {
        userId: 'u1', userName: 'Alice',
        timeInterval: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T17:00:00Z', duration: 28800 },
        type: 'REGULAR',
      },
    ];
    const result = groupByUserAndDay(entries);
    expect(result.get('u1').size).toBe(2);
  });

  test('empty entries returns empty map', () => {
    const result = groupByUserAndDay([]);
    expect(result.size).toBe(0);
  });
});
