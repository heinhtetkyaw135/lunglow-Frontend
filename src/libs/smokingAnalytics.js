import {
  TODAY_YEAR,
  TODAY_MONTH_IDX,
  TODAY_DAY,
  TODAY_KEY,
} from '../types';

const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 86400000;

export const formatDateKey = (year, monthIdx, day) => {
  const m = pad(monthIdx + 1);
  const d = pad(day);
  return `${year}-${m}-${d}`;
};

const dateKeyOf = (date) => formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());

export const formatTimer = (totalSec) => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const computeDayStatus = (dateKey, logsByDate, dailyLimit) => {
  if (dateKey > TODAY_KEY) {
    return 'upcoming';
  }
  const hasEntry = Object.prototype.hasOwnProperty.call(logsByDate, dateKey);
  const smoked = hasEntry ? logsByDate[dateKey] : undefined;
  if (smoked === null || smoked === undefined) {
    return 'missed';
  }
  if (smoked === 0) {
    return 'clean';
  }
  if (smoked <= dailyLimit) {
    return 'reduced';
  }
  return 'exceeded';
};

export const calculateLimitSummary = (cigsPerDay, cigPrice) => {
  const dailySmoked = Math.max(0, Number(cigsPerDay) || 0);
  const monthlySmoked = dailySmoked * 30;
  const unitPrice = Math.max(0, Number(cigPrice) || 0);
  const dailySpent = +(dailySmoked * unitPrice).toFixed(2);
  const monthlySpent = +(dailySpent * 30).toFixed(2);
  return { dailySmoked, monthlySmoked, dailySpent, monthlySpent };
};

// All metrics are computed ONLY from real logged days — no fake base offsets.
export const calculateMetrics = (logsByDate, dailyLimit, cigPrice, smokedToday) => {
  const monthPrefix = TODAY_KEY.slice(0, 7); // 'YYYY-MM'

  // ---- Lifetime totals from every logged day -----------------------------
  let totalAvoidedCigarettes = 0;
  let totalCleanDays = 0;
  let totalReducedAndCleanDays = 0;

  // ---- Current-month stats ------------------------------------------------
  let monthAvoided = 0;
  let loggedDaysCount = 0;
  let cleanDaysThisMonth = 0;
  let cleanOrReducedThisMonth = 0;
  let exceededThisMonth = 0;

  for (const [key, val] of Object.entries(logsByDate)) {
    if (val === null || val === undefined) continue;
    const avoided = Math.max(0, dailyLimit - val);
    totalAvoidedCigarettes += avoided;
    if (val === 0) totalCleanDays++;
    if (val <= dailyLimit) totalReducedAndCleanDays++;

    if (key.startsWith(monthPrefix)) {
      loggedDaysCount++;
      monthAvoided += avoided;
      if (val === 0) cleanDaysThisMonth++;
      if (val <= dailyLimit) cleanOrReducedThisMonth++;
      else exceededThisMonth++;
    }
  }

  const totalSavedMoney = +(totalAvoidedCigarettes * cigPrice).toFixed(2);
  const monthSavedMoney = +(monthAvoided * cigPrice).toFixed(2);
  const avgReducedCigarettes =
    loggedDaysCount > 0
      ? Math.round(monthAvoided / loggedDaysCount)
      : Math.max(0, dailyLimit - smokedToday);

  // ---- Current streak: consecutive CLEAN days (count === 0) ending today --
  // Streak only counts smoke-free days. If today isn't logged yet, the
  // streak can still stand via yesterday.
  const todayStatus = computeDayStatus(TODAY_KEY, logsByDate, dailyLimit);
  let currentStreak = 0;
  let cursor = new Date(TODAY_YEAR, TODAY_MONTH_IDX, TODAY_DAY);
  if (logsByDate[TODAY_KEY] === undefined || logsByDate[TODAY_KEY] === null) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  while (currentStreak <= 3650) {
    const status = computeDayStatus(dateKeyOf(cursor), logsByDate, dailyLimit);
    if (status === 'clean') {
      currentStreak++;
      cursor = new Date(cursor.getTime() - DAY_MS);
    } else {
      break;
    }
  }

  // ---- Longest streak over all logged days (clean days only) -------------
  let longestStreak = currentStreak;
  let run = 0;
  let prevTime = null;
  const sortedKeys = Object.keys(logsByDate).sort();
  for (const key of sortedKeys) {
    const val = logsByDate[key];
    if (val === null || val === undefined) continue;
    const [y, m, d] = key.split('-').map(Number);
    const time = new Date(y, m - 1, d).getTime();
    const status = computeDayStatus(key, logsByDate, dailyLimit);
    const ok = status === 'clean';
    if (ok && prevTime !== null && time - prevTime === DAY_MS) {
      run++;
    } else if (ok) {
      run = 1;
    } else {
      run = 0;
    }
    longestStreak = Math.max(longestStreak, run);
    prevTime = time;
  }

  const totalCleanWeeks = Math.floor(totalCleanDays / 7);
  const slipsRecorded = exceededThisMonth;
  const capAdherence =
    loggedDaysCount > 0
      ? Math.round((cleanOrReducedThisMonth / loggedDaysCount) * 100)
      : 100;

  return {
    monthAvoided,
    totalAvoidedCigarettes,
    avgReducedCigarettes,
    monthSavedMoney,
    totalSavedMoney,
    currentStreak,
    longestStreak,
    cleanDaysThisMonth,
    totalReducedAndCleanDays,
    totalCleanWeeks,
    slipsRecorded,
    capAdherence,
    todayStatus,
  };
};

// Current calendar week (Sunday → Saturday) around the real today.
export const calculateWeekBars = (logsByDate, dailyLimit, weekdaysList) => {
  const today = new Date(TODAY_YEAR, TODAY_MONTH_IDX, TODAY_DAY);
  const sundayOffset = today.getDay(); // 0 = Sunday
  return Array.from({ length: 7 }, (_, dayIdx) => {
    const d = new Date(today.getTime() + (dayIdx - sundayOffset) * DAY_MS);
    const dateKey = dateKeyOf(d);
    const status = computeDayStatus(dateKey, logsByDate, dailyLimit);
    const cigs = Object.prototype.hasOwnProperty.call(logsByDate, dateKey)
      ? logsByDate[dateKey]
      : undefined;
    return {
      dayIdx,
      dateKey,
      labelDate: `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`,
      dayLabel: weekdaysList[dayIdx],
      status,
      cigs,
      isToday: dateKey === TODAY_KEY,
    };
  });
};

export const calculateCalendarMonth = (selectedYear, selectedMonthIdx, logsByDate, dailyLimit) => {
  const yearNum = parseInt(selectedYear, 10) || TODAY_YEAR;
  const validMonthIdx = selectedMonthIdx >= 0 && selectedMonthIdx < 12 ? selectedMonthIdx : TODAY_MONTH_IDX;

  const firstDayOfWeek = new Date(yearNum, validMonthIdx, 1).getDay();
  const daysInMonth = new Date(yearNum, validMonthIdx + 1, 0).getDate();

  const days = [];
  const counts = { clean: 0, reduced: 0, exceeded: 0, missed: 0 };

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = formatDateKey(yearNum, validMonthIdx, d);
    let status;
    let smokedVal;

    if (dateKey > TODAY_KEY) {
      status = 'upcoming';
    } else if (Object.prototype.hasOwnProperty.call(logsByDate, dateKey)) {
      status = computeDayStatus(dateKey, logsByDate, dailyLimit);
      smokedVal = logsByDate[dateKey];
    } else {
      // Past days with no entry are simply missed — no invented data.
      status = 'missed';
      smokedVal = null;
    }

    if (counts[status] !== undefined) {
      counts[status]++;
    }

    days.push({
      dayNum: d,
      dateKey,
      status,
      smokedVal,
      isToday: dateKey === TODAY_KEY,
    });
  }

  return {
    firstDayOfWeek,
    daysInMonth,
    days,
    counts,
  };
};
