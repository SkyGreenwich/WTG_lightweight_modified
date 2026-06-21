// library.js - Core time management functions for WTG Lightweight Modified
// Derivative of WTG 2.0 by thedenial. - Apache 2.0 - See LICENSE

// ============================================================================
// WTG Scene Start Configuration
// Modify these when switching between different story scenarios
// ============================================================================
const WTG_SCENE_START_DATE = '04/04/2026'; // Or change it as needed
const WTG_SCENE_START_TIME_MODE = 'random'; // 'random' | 'fixed'
const WTG_SCENE_FIXED_START_TIME = '8:00 PM'; // Or change it as needed
const WTG_TURN_DATA_JSON_START = '[Turn Data JSON]';
const WTG_TURN_DATA_JSON_END = '[/Turn Data JSON]';
const WTG_DYNAMIC_CHARS_PER_MINUTE = 700;
const WTG_DYNAMIC_MAX_AUTO_MINUTES = 5;
const WTG_DYNAMIC_MAX_EXPLICIT_MINUTES = 10;
const WTG_TURN_TIME_MARKER_REGEX = /\[\[-?\d+y\d+m\d+d\d+h\d+n\d+s\]\]/g;
const WTG_STORYCARD_TIMESTAMP_REGEX = /(?:^|\n+)(Discovered on|Met on|Visited) (\d{1,2}\/\d{1,2}\/\d{4})\s+([^\n]+)/;
const WTG_STORYCARD_TIMESTAMP_REMOVE_REGEX = /\n*(?:Discovered on|Met on|Visited) \d{1,2}\/\d{1,2}\/\d{4}\s+[^\n]+/;

// Mapping table for descriptive time expressions
const descriptiveMap = new Map([
  ['morning', {defaultTime: '8:00 AM', sleepRange: {hours: [1, 4], crossesDay: false}}],
  ['afternoon', {defaultTime: '2:00 PM', sleepRange: {hours: [1, 3], crossesDay: false}}],
  ['noon', {defaultTime: '12:00 PM', sleepRange: {hours: [1, 2], crossesDay: false}}],
  ['evening', {defaultTime: '6:00 PM', sleepRange: {hours: [3, 6], crossesDay: false}}],
  ['night', {defaultTime: '10:00 PM', sleepRange: {hours: [6, 9], crossesDay: true}}],
  ['dawn', {defaultTime: '6:00 AM', sleepRange: {hours: [1, 3], crossesDay: false}}],
  ['dusk', {defaultTime: '8:00 PM', sleepRange: {hours: [4, 8], crossesDay: true}}],
  ['midday', {defaultTime: '12:00 PM', sleepRange: {hours: [1, 2], crossesDay: false}}],
  ['midnight', {defaultTime: '12:00 AM', sleepRange: {hours: [6, 8], crossesDay: true}}]
]);

/**
 * Returns the default start time for the current scene based on top-level config
 * @returns {string} Default start time string
 */
function getSceneDefaultStartTime() {
  if (WTG_SCENE_START_TIME_MODE === 'fixed') {
    return normalizeTime(WTG_SCENE_FIXED_START_TIME) || '8:00 PM';
  }

  let randHour = Math.floor(Math.random() * 12) + 1;
  let randMinute = Math.floor(Math.random() * 60);
  let ampm = Math.random() < 0.5 ? 'AM' : 'PM';
  let formattedMinute = randMinute.toString().padStart(2, '0');

  return `${randHour}:${formattedMinute} ${ampm}`;
}

/**
 * Formats validated 24-hour clock parts as WTG display time.
 * @param {number} hour - 24-hour clock hour
 * @param {number} min - Minute
 * @param {number} sec - Second
 * @returns {string} Time in h:mm AM/PM format
 */
function formatClockTime(hour, min, sec = 0) {
  let displayHour = hour;
  const period = displayHour < 12 ? 'AM' : 'PM';
  if (displayHour === 0) displayHour = 12;
  if (displayHour > 12) displayHour -= 12;
  return `${displayHour}:${String(min).padStart(2, '0')}${sec > 0 ? `:${String(sec).padStart(2, '0')}` : ''} ${period}`;
}

/**
 * Strictly parses numeric or configured descriptive time expressions.
 * @param {string} str - Time expression
 * @returns {Object|null} Parsed clock object, or null for invalid input
 */
function parseClockTime(str) {
  if (!str || typeof str !== 'string') return null;

  const raw = str.trim();
  if (!raw || raw === 'Unknown') return null;

  const descriptive = getDescriptiveTimeConfig(raw);
  if (descriptive) {
    return parseClockTime(descriptive.defaultTime);
  }

  const normalized = raw.replace(/\./g, '').replace(/\s+/g, ' ');
  const twelveHourMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    let hour = parseInt(twelveHourMatch[1], 10);
    const min = twelveHourMatch[2] === undefined ? 0 : parseInt(twelveHourMatch[2], 10);
    const sec = twelveHourMatch[3] === undefined ? 0 : parseInt(twelveHourMatch[3], 10);
    const period = twelveHourMatch[4].toUpperCase();

    if (hour < 1 || hour > 12 || min < 0 || min > 59 || sec < 0 || sec > 59) {
      return null;
    }

    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return {
      hour,
      min,
      sec,
      display: formatClockTime(hour, min, sec)
    };
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFourHourMatch) {
    const hour = parseInt(twentyFourHourMatch[1], 10);
    const min = parseInt(twentyFourHourMatch[2], 10);
    const sec = twentyFourHourMatch[3] === undefined ? 0 : parseInt(twentyFourHourMatch[3], 10);

    if (hour < 0 || hour > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) {
      return null;
    }

    return {
      hour,
      min,
      sec,
      display: formatClockTime(hour, min, sec)
    };
  }

  return null;
}

/**
 * Normalizes a time expression to standard format.
 * @param {string} str - The time string to normalize
 * @returns {string|null} Normalized time string, or null for invalid input
 */
function normalizeTime(str) {
  const parsed = parseClockTime(str);
  return parsed ? parsed.display : null;
}

/**
 * Returns descriptive time metadata if the value is one of the configured labels
 * @param {string} str - Time string or descriptive label
 * @returns {Object|null} Descriptive time configuration
 */
function getDescriptiveTimeConfig(str) {
  if (!str) return null;
  return descriptiveMap.get(str.toLowerCase()) || null;
}

/**
 * Checks whether a time string is a precise numeric clock
 * @param {string} timeStr - Time string to check
 * @returns {boolean} True if the string is a numeric clock
 */
function isPreciseTime(timeStr) {
  return Boolean(timeStr && /\d/.test(timeStr) && parseClockTime(timeStr));
}

/**
 * Normalizes a date expression to mm/dd/yyyy, accepting dd/mm/yyyy when unambiguous.
 * @param {string} dateStr - Date expression
 * @returns {Object} Parsed date or error
 */
function normalizeDateInput(dateStr) {
  const raw = String(dateStr || '').trim().replace(/[.-]/g, '/');
  const parts = raw.split('/');
  if (parts.length !== 3 || !parts.every(part => /^\d+$/.test(part))) {
    return {error: '[Invalid date. Use mm/dd/yyyy or an unambiguous dd/mm/yyyy date.]'};
  }

  let [part1, part2, year] = parts.map(Number);
  if (year < 100) year += 2000;

  let month = part1;
  let day = part2;
  if (month > 12 && day <= 12) {
    month = part2;
    day = part1;
  }

  if (!isValidDate(month, day, year)) {
    return {error: `[Invalid date: ${raw}. Use mm/dd/yyyy or an unambiguous dd/mm/yyyy date.]`};
  }

  return {
    date: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
    month,
    day,
    year
  };
}

/**
 * Returns a random integer within the inclusive range
 * @param {number} min - Lower bound
 * @param {number} max - Upper bound
 * @returns {number} Random integer
 */
function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Parses an advance specification into supported time units.
 * Supports single-number legacy input ("30" => 30 hours), spaced pairs
 * ("1 month 2 days"), and compact pairs ("1month 2days 3hours").
 * @param {string} spec - Raw advance arguments
 * @returns {Object} Parsed result with add/summary or an error message
 */
function parseAdvanceSpec(spec) {
  const rawSpec = (spec || '').trim();
  if (!rawSpec) {
    return {error: '[Invalid advance amount. Use a positive integer.]'};
  }

  if (/^\d+$/.test(rawSpec)) {
    const hours = parseInt(rawSpec, 10);
    return {
      add: {hours},
      summary: `${hours} hour${hours === 1 ? '' : 's'}`
    };
  }

  const add = {years: 0, months: 0, days: 0, hours: 0, minutes: 0};
  const summaryParts = [];
  const tokenRegex = /(\d+)\s*(minute|minutes|hour|hours|day|days|month|months|year|years)\b/gi;
  let lastIndex = 0;
  let matched = false;
  let match;

  while ((match = tokenRegex.exec(rawSpec)) !== null) {
    const between = rawSpec.slice(lastIndex, match.index).trim();
    if (between) {
      return {error: '[Invalid advance unit. Supported units: minutes, hours, days, months, years.]'};
    }

    matched = true;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      return {error: '[Invalid advance amount. Use a positive integer.]'};
    }

    if (unit === 'minute' || unit === 'minutes') {
      add.minutes += amount;
      summaryParts.push(`${amount} minute${amount === 1 ? '' : 's'}`);
    } else if (unit === 'hour' || unit === 'hours') {
      add.hours += amount;
      summaryParts.push(`${amount} hour${amount === 1 ? '' : 's'}`);
    } else if (unit === 'day' || unit === 'days') {
      add.days += amount;
      summaryParts.push(`${amount} day${amount === 1 ? '' : 's'}`);
    } else if (unit === 'month' || unit === 'months') {
      add.months += amount;
      summaryParts.push(`${amount} month${amount === 1 ? '' : 's'}`);
    } else if (unit === 'year' || unit === 'years') {
      add.years += amount;
      summaryParts.push(`${amount} year${amount === 1 ? '' : 's'}`);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (!matched || rawSpec.slice(lastIndex).trim()) {
    return {error: '[Invalid advance unit. Supported units: minutes, hours, days, months, years.]'};
  }

  return {
    add,
    summary: summaryParts.join(' ')
  };
}

/**
 * Maps a precise clock to the closest existing descriptive bucket
 * @param {string} timeStr - Precise time string
 * @returns {string} Descriptive bucket key
 */
function getDescriptiveBucketFromPreciseTime(timeStr) {
  const {hour, min} = parseTime(timeStr);
  const totalMinutes = hour * 60 + min;
  if (totalMinutes >= 0 && totalMinutes < 300) return 'midnight';
  if (totalMinutes >= 300 && totalMinutes < 480) return 'dawn';
  if (totalMinutes >= 480 && totalMinutes < 720) return 'morning';
  if (totalMinutes >= 720 && totalMinutes < 1020) return 'afternoon';
  if (totalMinutes >= 1020 && totalMinutes < 1200) return 'evening';
  return 'night';
}

/**
 * Chooses a sleep duration while preserving the original turn-time model
 * @param {string} currentTime - Current time string
 * @returns {Object} Duration compatible with addToTurnTime
 */
function getSleepDuration(currentTime) {
  let config = null;

  if (isPreciseTime(currentTime)) {
    const bucket = getDescriptiveBucketFromPreciseTime(currentTime);
    config = getDescriptiveTimeConfig(bucket);

    // After midnight, choose an early-morning wake time instead of adding
    // a full night's sleep from an already-late starting point.
    if (bucket === 'midnight') {
      const {hour, min} = parseTime(currentTime);
      const currentMinute = hour * 60 + min;
      const wakeMinute = randomIntInclusive(6 * 60, 8 * 60);
      const durationMinutes = wakeMinute - currentMinute;
      return {
        hours: Math.floor(durationMinutes / 60),
        minutes: durationMinutes % 60,
      };
    }
  } else {
    config = getDescriptiveTimeConfig(currentTime);
  }

  if (!config || !config.sleepRange) {
    return {days: 1, hours: 8, minutes: 0};
  }

  const minHours = config.sleepRange.hours[0];
  const maxHours = config.sleepRange.hours[1];
  const hours = randomIntInclusive(minHours, maxHours);
  const minutes = randomIntInclusive(0, 59);

  return {
    hours,
    minutes,
  };
}

/**
 * Validates whether a date is valid
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @param {number} year - Year
 * @returns {boolean} True if the date is valid
 */
function isValidDate(month, day, year) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && (date.getMonth() + 1) === month && date.getDate() === day;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function addCalendarMonthsClampedParts(year, month, day, deltaMonths) {
  const target = new Date(year, month - 1 + deltaMonths, 1);
  const targetYear = target.getFullYear();
  const targetMonth = target.getMonth() + 1;
  const targetDay = Math.min(day, getDaysInMonth(targetYear, targetMonth));
  return {year: targetYear, month: targetMonth, day: targetDay};
}

function buildDateFromParts(parts, timeParts = {}) {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    timeParts.hour || 0,
    timeParts.min || 0,
    timeParts.sec || 0
  );
}

function advanceDateTimeValue(dateStr, timeStr, add = {}) {
  const parsedDate = normalizeDateInput(dateStr);
  const parsedTime = parseClockTime(timeStr);
  if (parsedDate.error || !parsedTime) return null;

  const totalMonths = (add.years || 0) * 12 + (add.months || 0);
  const dateParts = totalMonths
    ? addCalendarMonthsClampedParts(parsedDate.year, parsedDate.month, parsedDate.day, totalMonths)
    : {year: parsedDate.year, month: parsedDate.month, day: parsedDate.day};
  const date = buildDateFromParts(dateParts);
  date.setDate(date.getDate() + (add.days || 0));

  const advancedTime = advanceTime(
    parsedTime.display,
    add.hours || 0,
    add.minutes || 0,
    add.seconds || 0
  );
  if (!advancedTime.valid) return null;

  date.setDate(date.getDate() + advancedTime.days);
  return {
    date: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`,
    time: advancedTime.time
  };
}

/**
 * Advances a date by a specified number of days
 * @param {string} dateStr - Date string in mm/dd/yyyy format
 * @param {number} days - Number of days to advance
 * @returns {string} New date string in mm/dd/yyyy format
 */
function advanceDate(dateStr, days = 0) {
  let [month, day, year] = dateStr.split('/').map(Number);
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  day = String(date.getDate()).padStart(2, '0');
  month = String(date.getMonth() + 1).padStart(2, '0');
  year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Advances time by specified hours, minutes, and seconds
 * @param {string} timeStr - Time string in hh:mm AM/PM format
 * @param {number} hours - Hours to add
 * @param {number} minutes - Minutes to add
 * @param {number} seconds - Seconds to add
 * @returns {Object} Object containing new time and overflow days
 */
function advanceTime(timeStr, hours = 0, minutes = 0, seconds = 0) {
  const parsed = parseClockTime(timeStr);
  if (!parsed) {
    return { time: 'Unknown', days: 0, valid: false };
  }

  let currentSeconds = parsed.hour * 3600 + parsed.min * 60 + parsed.sec;
  let addedSeconds = hours * 3600 + minutes * 60 + seconds;
  let totalSeconds = currentSeconds + addedSeconds;
  let extraDays = Math.floor(totalSeconds / 86400);
  let wrappedSeconds = totalSeconds - extraDays * 86400;

  let hour = Math.floor(wrappedSeconds / 3600);
  let remaining = wrappedSeconds % 3600;
  let min = Math.floor(remaining / 60);
  let sec = remaining % 60;
  return { time: formatClockTime(hour, min, sec), days: extraDays, valid: true };
}

/**
 * Extracts a date from current output or history
 * @param {string} currentOutput - Current output text
 * @param {boolean} useHistory - Whether to search history if not found in current output
 * @returns {string|null} Extracted date string, or null if not found
 */
function getCurrentDateFromHistory(currentOutput = '', useHistory = false) {
  let currentDate = null;
  const dateRegex = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2}(?:\d{2})?/g;
  let matches = currentOutput.match(dateRegex);
  if (matches && matches.length > 0) {
    currentDate = matches[matches.length - 1].trim().replace(/[.-]/g, '/');
  }
  if (!currentDate && useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      matches = history[i].text.match(dateRegex);
      if (matches && matches.length > 0) {
        currentDate = matches[matches.length - 1].trim().replace(/[.-]/g, '/');
        break;
      }
    }
  }
  return currentDate;
}

/**
 * Extracts a time from current output or history
 * @param {string} currentOutput - Current output text
 * @param {boolean} useHistory - Whether to search history if not found in current output
 * @returns {string|null} Extracted time string, or null if not found
 */
function getCurrentTimeFromHistory(currentOutput = '', useHistory = false) {
  let currentTime = null;
  const timeRegex = /(\d{1,2}(?:\:\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))|(\d{1,2}:\d{2})|(morning|afternoon|noon|evening|night|dawn|dusk|midday|midnight)/gi;
  let matches = currentOutput.match(timeRegex);
  if (matches && matches.length > 0) {
    let lastMatch = matches[matches.length - 1].trim();
    let lowerMatch = lastMatch.toLowerCase();
    let isDescriptive = descriptiveMap.has(lowerMatch);
    let currentIsPrecise = state.currentTime && /\d{1,2}:\d{2} [AP]M/.test(state.currentTime);
    if (!isDescriptive || !currentIsPrecise) {
      currentTime = lastMatch;
    }
  }
  if (!currentTime && useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      matches = history[i].text.match(timeRegex);
      if (matches && matches.length > 0) {
        let lastMatch = matches[matches.length - 1].trim();
        let lowerMatch = lastMatch.toLowerCase();
        let isDescriptive = descriptiveMap.has(lowerMatch);
        let currentIsPrecise = state.currentTime && /\d{1,2}:\d{2} [AP]M/.test(state.currentTime);
        if (!isDescriptive || !currentIsPrecise) {
          currentTime = lastMatch;
          break;
        }
      }
    }
  }
  return currentTime ? normalizeTime(currentTime) : null;
}

/**
 * Parses a turn time string into an object
 * @param {string} str - Turn time string in format like 00y00m00d00h00n00s
 * @returns {Object|null} Parsed turn time object, or default zero object on failure
 */
function parseTurnTime(str) {
  const match = String(str || '').match(/^(-?)(\d+)y(\d+)m(\d+)d(\d+)h(\d+)n(\d+)s$/);
  if (!match) return null;
  return normalizeTurnTimeSign({
    sign: match[1] === '-' ? -1 : 1,
    years: parseInt(match[2]),
    months: parseInt(match[3]),
    days: parseInt(match[4]),
    hours: parseInt(match[5]),
    minutes: parseInt(match[6]),
    seconds: parseInt(match[7])
  });
}

function hasTurnTimeMagnitude(tt) {
  return Boolean(tt && ((tt.years || 0) || (tt.months || 0) || (tt.days || 0) || (tt.hours || 0) || (tt.minutes || 0) || (tt.seconds || 0)));
}

function getTurnTimeSign(tt) {
  return tt && tt.sign === -1 && hasTurnTimeMagnitude(tt) ? -1 : 1;
}

function normalizeTurnTimeSign(tt) {
  tt = tt || {sign: 1, years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  const normalized = {
    sign: tt.sign === -1 ? -1 : 1,
    years: Math.abs(tt.years || 0),
    months: Math.abs(tt.months || 0),
    days: Math.abs(tt.days || 0),
    hours: Math.abs(tt.hours || 0),
    minutes: Math.abs(tt.minutes || 0),
    seconds: Math.abs(tt.seconds || 0)
  };
  if (!hasTurnTimeMagnitude(normalized)) {
    normalized.sign = 1;
  }
  return normalized;
}

/**
 * Formats a turn time object into a string
 * @param {Object} tt - Turn time object
 * @returns {string} Formatted turn time string
 */
function formatTurnTime(tt) {
  tt = normalizeTurnTimeSign(tt || {sign:1, years:0, months:0, days:0, hours:0, minutes:0, seconds:0});
  const signPrefix = getTurnTimeSign(tt) === -1 ? '-' : '';
  return `${signPrefix}${String(tt.years).padStart(2, '0')}y${String(tt.months).padStart(2, '0')}m${String(tt.days).padStart(2, '0')}d${String(tt.hours).padStart(2, '0')}h${String(tt.minutes).padStart(2, '0')}n${String(tt.seconds).padStart(2, '0')}s`;
}

function turnTimeToApproxSeconds(tt) {
  tt = normalizeTurnTimeSign(tt);
  const magnitudeSeconds = (((((tt.years || 0) * 365 + (tt.months || 0) * 30 + (tt.days || 0)) * 24 + (tt.hours || 0)) * 60 + (tt.minutes || 0)) * 60) + (tt.seconds || 0);
  return getTurnTimeSign(tt) * magnitudeSeconds;
}

function secondsToTurnTime(totalSeconds) {
  const sign = totalSeconds < 0 ? -1 : 1;
  let remaining = Math.abs(Math.round(totalSeconds));
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return normalizeTurnTimeSign({sign, years:0, months:0, days, hours, minutes, seconds});
}

/**
 * Adds time values to a turn time object
 * @param {Object} tt - Turn time object
 * @param {Object} add - Time values to add
 * @returns {Object} New turn time object
 */
function addToTurnTime(tt, add) {
  tt = normalizeTurnTimeSign(tt || {sign:1, years:0, months:0, days:0, hours:0, minutes:0, seconds:0});
  add = normalizeTurnTimeSign(add || {sign:1, years:0, months:0, days:0, hours:0, minutes:0, seconds:0});

  if (getTurnTimeSign(tt) === -1 || getTurnTimeSign(add) === -1) {
    return secondsToTurnTime(turnTimeToApproxSeconds(tt) + turnTimeToApproxSeconds(add));
  }

  let newTT = {...tt};
  newTT.seconds += add.seconds || 0;
  newTT.minutes += Math.floor(newTT.seconds / 60);
  newTT.seconds %= 60;
  newTT.minutes += add.minutes || 0;
  newTT.hours += Math.floor(newTT.minutes / 60);
  newTT.minutes %= 60;
  newTT.hours += add.hours || 0;
  newTT.days += Math.floor(newTT.hours / 24);
  newTT.hours %= 24;
  newTT.days += add.days || 0;
  newTT.months += add.months || 0;
  newTT.years += Math.floor(newTT.months / 12);
  newTT.months %= 12;
  newTT.years += add.years || 0;
  return normalizeTurnTimeSign(newTT);
}

/**
 * Computes current date and time from starting date, starting time, and turn time
 * @param {string} startingDate - Starting date string
 * @param {string} startingTime - Starting time string
 * @param {Object} tt - Turn time object
 * @returns {Object} Object containing currentDate and currentTime
 */
function computeCurrent(startingDate, startingTime, tt) {
  tt = normalizeTurnTimeSign(tt || {sign:1, years:0, months:0, days:0, hours:0, minutes:0, seconds:0});
  const sign = getTurnTimeSign(tt);
  if (startingTime === 'Unknown' || !parseClockTime(startingTime)) {
    let approxDays = sign * ((tt.years || 0) * 365 + (tt.months || 0) * 30 + (tt.days || 0));
    let currentDate = advanceDate(startingDate, approxDays);
    return { currentDate, currentTime: 'Unknown' };
  }
  let [month, day, year] = startingDate.split('/').map(Number);
  const totalCalendarMonths = sign * (((tt.years || 0) * 12) + (tt.months || 0));
  let dateParts = totalCalendarMonths
    ? addCalendarMonthsClampedParts(year, month, day, totalCalendarMonths)
    : {year, month, day};
  let date = buildDateFromParts(dateParts);
  date.setDate(date.getDate() + sign * (tt.days || 0));
  let {time, days} = advanceTime(startingTime, sign * (tt.hours || 0), sign * (tt.minutes || 0), sign * (tt.seconds || 0));
  date.setDate(date.getDate() + days);
  let currentDate = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  return { currentDate, currentTime: time };
}

/**
 * Parses a time string into hours, minutes, and seconds
 * @param {string} str - Time string
 * @returns {Object} Object containing hour, min, sec
 */
function parseTime(str) {
  const parsed = parseClockTime(str);
  if (!parsed) return {hour: 0, min: 0, sec: 0, valid: false};
  return {hour: parsed.hour, min: parsed.min, sec: parsed.sec, valid: true};
}

/**
 * Compares two turn time objects to determine which is earlier
 * @param {Object} tt1 - First turn time object
 * @param {Object} tt2 - Second turn time object
 * @returns {number} -1 if tt1 is earlier, 1 if tt2 is earlier, 0 if equal
 */
function compareTurnTime(tt1, tt2) {
  // Defensive check for null or undefined input
  if (!tt1 || !tt2) {
    return 0;
  }

  tt1 = normalizeTurnTimeSign(tt1);
  tt2 = normalizeTurnTimeSign(tt2);
  const comparable1 = getComparableTurnTimeValue(tt1);
  const comparable2 = getComparableTurnTimeValue(tt2);
  if (Number.isFinite(comparable1) && Number.isFinite(comparable2)) {
    if (comparable1 < comparable2) return -1;
    if (comparable1 > comparable2) return 1;
    return 0;
  }

  const sign1 = getTurnTimeSign(tt1);
  const sign2 = getTurnTimeSign(tt2);
  if (sign1 !== sign2) return sign1 < sign2 ? -1 : 1;

  const direction = sign1 === -1 ? -1 : 1;
  if (tt1.years !== tt2.years) return direction * (tt1.years < tt2.years ? -1 : 1);
  if (tt1.months !== tt2.months) return direction * (tt1.months < tt2.months ? -1 : 1);
  if (tt1.days !== tt2.days) return direction * (tt1.days < tt2.days ? -1 : 1);
  if (tt1.hours !== tt2.hours) return direction * (tt1.hours < tt2.hours ? -1 : 1);
  if (tt1.minutes !== tt2.minutes) return direction * (tt1.minutes < tt2.minutes ? -1 : 1);
  if (tt1.seconds !== tt2.seconds) return direction * (tt1.seconds < tt2.seconds ? -1 : 1);
  return 0;
}

function getComparableTurnTimeValue(tt) {
  if (typeof state === 'undefined' || !state || !state.startingDate || !state.startingTime || !parseClockTime(state.startingTime)) {
    return NaN;
  }

  const current = computeCurrent(state.startingDate, state.startingTime, tt);
  const parsed = parseDateTime(current.currentDate, current.currentTime);
  return parsed ? parsed.getTime() : NaN;
}

function normalizeTurnDataRecord(record) {
  const rawVersion = Number(record && record.version);
  const rawActionCount = record && record.actionCount;
  const actionCount = rawActionCount === null || rawActionCount === undefined
    ? NaN
    : Number(rawActionCount);
  return {
    version: Number.isInteger(rawVersion) && rawVersion >= 4 ? rawVersion : 3,
    actionCount: Number.isInteger(actionCount) && actionCount >= 0 ? actionCount : null,
    actionType: String(record && record.actionType || ''),
    actionText: String(record && record.actionText || ''),
    responseText: String(record && record.responseText || ''),
    timestamp: String(record && record.timestamp || '')
  };
}

function serializeTurnDataRecord(record) {
  return `${WTG_TURN_DATA_JSON_START} ${JSON.stringify(normalizeTurnDataRecord(record))} ${WTG_TURN_DATA_JSON_END}`;
}

function hasSettimeMarker(entry) {
  return Boolean(entry && entry.includes('[SETTIME_INITIALIZED]'));
}

function writeTurnData(records) {
  const dataCard = getWTGDataCard();
  const parts = [];
  if (hasSettimeMarker(dataCard.entry)) {
    parts.push('[SETTIME_INITIALIZED]');
  }
  for (const record of records) {
    parts.push(serializeTurnDataRecord(record));
  }
  dataCard.entry = parts.join('\n');
}

function parseJSONTurnData(entry) {
  const records = [];
  const jsonRegex = /^\[Turn Data JSON\]\s*(\{.*\})\s*\[\/Turn Data JSON\]\s*$/gm;
  let match;
  while ((match = jsonRegex.exec(entry || '')) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      records.push({
        index: match.index,
        record: normalizeTurnDataRecord(parsed)
      });
    } catch (error) {
      // Ignore malformed internal records instead of breaking the whole clock.
    }
  }
  return records;
}

function parseLegacyTurnData(entry) {
  const records = [];
  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  let match;
  while ((match = turnDataRegex.exec(entry || '')) !== null) {
    records.push({
      index: match.index,
      record: normalizeTurnDataRecord({
        actionType: match[1],
        actionText: match[2],
        responseText: match[3],
        timestamp: match[4]
      })
    });
  }
  return records;
}

/**
 * Reads turn data from the WTG Data storycard.
 * New records use JSON; legacy text blocks are still accepted for migration.
 * @returns {Array} Array of turn data objects
 */
function getTurnData() {
  const dataCard = getWTGDataCard();
  if (!dataCard.entry) return [];

  return parseJSONTurnData(dataCard.entry)
    .concat(parseLegacyTurnData(dataCard.entry))
    .sort((a, b) => a.index - b.index)
    .map(item => item.record);
}

/**
 * Appends turn data to the WTG Data storycard.
 * @param {string} actionType - Action type (do, say, story, continue)
 * @param {string} actionText - Full action text
 * @param {string} responseText - AI response text
 * @param {string} timestamp - Turntime-formatted timestamp
 */
function addTurnData(actionType, actionText, responseText, timestamp) {
  const dataCard = getWTGDataCard();
  const actionCount = typeof info !== 'undefined' && info && Number.isInteger(info.actionCount)
    ? info.actionCount
    : null;
  const record = normalizeTurnDataRecord({
    version: 4,
    actionCount,
    actionType,
    actionText,
    responseText,
    timestamp
  });

  const entry = serializeTurnDataRecord(record);

  if (dataCard.entry && dataCard.entry.trim()) {
    dataCard.entry += '\n' + entry;
  } else {
    dataCard.entry = entry;
  }
}

/**
 * Gets the most recent player action from history.
 * @param {Array} historyItems - History array
 * @returns {Object|null} Most recent do/say/story action; null if none exists
 */
function getLatestPlayerAction(historyItems) {
  if (!historyItems || historyItems.length === 0) return null;
  for (let i = historyItems.length - 1; i >= 0; i--) {
    const action = historyItems[i];
    if (action.type === "do" || action.type === "say" || action.type === "story") {
      return action;
    }
  }
  return null;
}

/**
 * Normalizes player action text for stable identity comparison across retry/erase flows.
 * @param {string} text - Raw action text
 * @returns {string} Normalized action text
 */
function normalizeActionText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function getHostActionType(fallback = 'continue') {
  if (typeof info !== 'undefined' && info) {
    if (info.isContinue === true) return 'continue';
    const actionType = String(info.actionType || '').toLowerCase();
    if (actionType === 'do' || actionType === 'say' || actionType === 'story') {
      return actionType;
    }
  }
  return fallback;
}

/**
 * Tracks the newest player-authored input before history catches up.
 * This is the authoritative source for whether the current cycle represents a new player action.
 * @param {string} text - Raw player input text
 */
function rememberPendingPlayerInput(text) {
  const normalizedText = normalizeActionText(text);
  if (!normalizedText) return;
  state.wtgPendingPlayerInputText = normalizedText;
  state.wtgPendingPlayerInputRaw = String(text || '');
  state.wtgPendingPlayerInputType = getHostActionType('do');
  state.wtgPendingPlayerInputNeedsTiming = true;
}

/**
 * Clears the pending player input marker after the cycle has been consumed.
 */
function clearPendingPlayerInput() {
  delete state.wtgPendingPlayerInputText;
  delete state.wtgPendingPlayerInputRaw;
  delete state.wtgPendingPlayerInputType;
  delete state.wtgPendingPlayerInputNeedsTiming;
}

/**
 * Checks whether a fresh player input is currently pending processing.
 * @returns {boolean} True if the current cycle originated from a new player input
 */
function hasPendingPlayerInput() {
  return Boolean(state.wtgPendingPlayerInputText);
}

function hasFreshPendingPlayerInput() {
  return Boolean(state.wtgPendingPlayerInputText && state.wtgPendingPlayerInputNeedsTiming);
}

/**
 * Finds the newest persisted AI output that is still present in history.
 * Player actions cannot anchor Continue generations, so rewind recovery is
 * based on the visible output text that AI Dungeon actually retained.
 */
function findLatestTurnDataEntryInHistory(turnData, historyItems = []) {
  if (!Array.isArray(turnData) || turnData.length === 0) return null;

  const historyTexts = (historyItems || [])
    .map(item => normalizeActionText(item && item.text))
    .filter(Boolean);
  if (historyTexts.length === 0) return null;

  let bestMatch = null;

  for (let i = turnData.length - 1; i >= 0; i--) {
    if (turnData[i].version < 4) continue;
    const responseText = normalizeActionText(turnData[i].responseText);
    if (!responseText) continue;

    for (let historyIndex = historyTexts.length - 1; historyIndex >= 0; historyIndex--) {
      if (historyTexts[historyIndex] !== responseText) continue;

      let sequenceLength = 1;
      let recordIndex = i - 1;
      let previousHistoryIndex = historyIndex - 1;

      while (recordIndex >= 0 && previousHistoryIndex >= 0) {
        if (turnData[recordIndex].version < 4) {
          recordIndex--;
          continue;
        }
        const previousResponse = normalizeActionText(turnData[recordIndex].responseText);
        if (!previousResponse) {
          recordIndex--;
          continue;
        }

        while (
          previousHistoryIndex >= 0 &&
          historyTexts[previousHistoryIndex] !== previousResponse
        ) {
          previousHistoryIndex--;
        }
        if (previousHistoryIndex < 0) break;

        sequenceLength++;
        recordIndex--;
        previousHistoryIndex--;
      }

      if (
        !bestMatch ||
        sequenceLength > bestMatch.sequenceLength ||
        (
          sequenceLength === bestMatch.sequenceLength &&
          i < bestMatch.index
        )
      ) {
        bestMatch = {
          entry: turnData[i],
          index: i,
          sequenceLength
        };
      }
    }
  }

  return bestMatch;
}

function trimTurnDataAfterIndex(turnData, index) {
  if (!Array.isArray(turnData) || index < 0 || index >= turnData.length) return;
  writeTurnData(turnData.slice(0, index + 1));
}

/**
 * Cleans entries from WTG Data card with timestamps later than the current time
 * @param {Object} currentTT - Current turn time object
 */
function cleanupWTGDataCardByTimestamp(currentTT) {
  const records = getTurnData();
  if (records.length === 0) return;

  const keptRecords = records.filter(record => {
    const entryTT = parseTurnTime(record.timestamp);
    return entryTT && compareTurnTime(entryTT, currentTT) <= 0;
  });

  writeTurnData(keptRecords);
}

/**
 * Cleans storycards with future timestamps
 * @param {string} currentDate - Current date in mm/dd/yyyy format
 * @param {string} currentTime - Current time in hh:mm AM/PM format
 */
function cleanupStoryCardsByTimestamp(currentDate, currentTime) {
  const currentDateTime = parseDateTime(currentDate, currentTime);
  if (!currentDateTime) return;

  // Iterate through storycards and remove future timestamps
  for (let i = storyCards.length - 1; i >= 0; i--) {
    const card = storyCards[i];

    // Skip internal WTG cards and cards without entry
    if (isWTGInternalCard(card) || !card.entry) {
      continue;
    }

    const cardTimestamp = getCardTimestamp(card);
    if (cardTimestamp) {
      const separatorIndex = cardTimestamp.indexOf(' ');
      const cardDate = cardTimestamp.slice(0, separatorIndex);
      const cardTime = cardTimestamp.slice(separatorIndex + 1);
      const cardDateTime = parseDateTime(cardDate, cardTime);
      if (!cardDateTime) continue;

      // If card timestamp is later than current time, remove the timestamp
      if (cardDateTime > currentDateTime) {
        card.entry = card.entry.replace(WTG_STORYCARD_TIMESTAMP_REMOVE_REGEX, '').trimEnd();
      }
    }
  }
}
/**
 * Calculates the lightweight turn-time difference between two specific datetime values.
 * Primarily used by [reset] to back-calculate turnTime from recovered timestamps.
 * @param {string} startStr - Start date in mm/dd/yyyy format
 * @param {string} startTimeStr - Start time in lightweight display format
 * @param {string} endStr - End date in mm/dd/yyyy format
 * @param {string} endTimeStr - End time in lightweight display format
 * @returns {Object} Turn-time-style diff object
 */
function getDateDiff(startStr, startTimeStr, endStr, endTimeStr) {
  const startDate = normalizeDateInput(startStr);
  const endDate = normalizeDateInput(endStr);
  let startParsed = parseTime(startTimeStr);
  let endParsed = parseTime(endTimeStr);
  if (startDate.error || endDate.error || !startParsed.valid || !endParsed.valid) {
    return {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  }

  let [sMonth, sDay, sYear] = startDate.date.split('/').map(Number);
  let start = buildDateFromParts(
    {year: sYear, month: sMonth, day: sDay},
    startParsed
  );
  let [eMonth, eDay, eYear] = endDate.date.split('/').map(Number);
  let end = buildDateFromParts(
    {year: eYear, month: eMonth, day: eDay},
    endParsed
  );
  if (end < start) {
    return secondsToTurnTime((end.getTime() - start.getTime()) / 1000);
  }

  let totalMonths = (eYear - sYear) * 12 + (eMonth - sMonth);
  let cursorParts = addCalendarMonthsClampedParts(sYear, sMonth, sDay, totalMonths);
  let cursor = buildDateFromParts(cursorParts, startParsed);
  while (totalMonths > 0 && cursor > end) {
    totalMonths--;
    cursorParts = addCalendarMonthsClampedParts(sYear, sMonth, sDay, totalMonths);
    cursor = buildDateFromParts(cursorParts, startParsed);
  }

  let remainingMs = end.getTime() - cursor.getTime();
  let days = Math.floor(remainingMs / 86400000);
  cursor.setDate(cursor.getDate() + days);
  remainingMs = end.getTime() - cursor.getTime();

  let remainingSeconds = Math.max(0, Math.round(remainingMs / 1000));
  let hours = Math.floor(remainingSeconds / 3600);
  remainingSeconds %= 3600;
  let minutes = Math.floor(remainingSeconds / 60);
  let seconds = remainingSeconds % 60;
  let years = Math.floor(totalMonths / 12);
  let months = totalMonths % 12;

  return normalizeTurnTimeSign({sign: 1, years, months, days, hours, minutes, seconds});
}

/**
 * Gets the most recent timestamp from the WTG Data storycard.
 */
function getLastTimestampFromWTGData() {
  const records = getTurnData();
  for (let i = records.length - 1; i >= 0; i--) {
    const timestamp = records[i].timestamp;
    if (timestamp && timestamp.match(/-?\d+y\d+m\d+d\d+h\d+n\d+s/)) {
      return parseTurnTime(timestamp);
    }
  }

  return null;
}

/**
 * Gets the most recent turn time marker from history.
 */
function getLastTurnTime(historyItems) {
  let lastTT = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  let found = false;
  for (let i = (historyItems || []).length - 1; i >= 0; i--) {
    const actionText = String(historyItems[i] && historyItems[i].text || '');
    const markerRegex = /\[\[(-?\d+y\d+m\d+d\d+h\d+n\d+s)\]\]/g;
    let match;
    let lastMatch = null;
    while ((match = markerRegex.exec(actionText)) !== null) {
      lastMatch = match;
    }
    if (lastMatch) {
      lastTT = parseTurnTime(lastMatch[1]);
      found = true;
      break;
    }
  }

  return {lastTT, found};
}

/**
 * Parses date and time strings into a Date object
 * @param {string} dateStr - Date string in mm/dd/yyyy format
 * @param {string} timeStr - Time string in hh:mm AM/PM format
 * @returns {Date} Parsed Date object
 */
function parseDateTime(dateStr, timeStr) {
  const parsedDate = normalizeDateInput(dateStr);
  if (parsedDate.error) return null;

  const [month, day, year] = parsedDate.date.split('/').map(Number);
  const time = parseTime(timeStr);
  if (!time.valid) return null;

  return buildDateFromParts({year, month, day}, time);
}

/**
 * Gets or creates the WTG Data storycard
 * @returns {Object} WTG Data storycard object
 */
function getWTGDataCard() {
  let dataCard = storyCards.find(card => card.title === "WTG Data");
  if (!dataCard) {
    addStoryCard("WTG Data");
    // Find the newly created card
    dataCard = storyCards.find(card => card.title === "WTG Data");
    if (dataCard) {
      dataCard.type = "system";
      dataCard.keys = "";
      dataCard.entry = "";
      dataCard.description = "System data for World Time Generator - Internal use only, do not include in context";
    }
  }
  if (dataCard) {
    dataCard.type = "system";
    dataCard.keys = "";
  }
  return dataCard;
}

/**
 * Gets or creates the Current Date and Time storycard
 * @returns {Object} Current Date and Time storycard object
 */
function getCurrentDateTimeCard() {
  let dateTimeCard = storyCards.find(card => card.title === "Current Date and Time");
  if (!dateTimeCard) {
    addStoryCard("Current Date and Time");
    dateTimeCard = storyCards[storyCards.length - 1];
    dateTimeCard.keys = "date,time,current date,current time,clock,hour,am,pm";
    dateTimeCard.description = "Commands:\n[settime mm/dd/yyyy time] - Set starting date and time\n[setcurrent mm/dd/yyyy [time]] - Set current date/time without changing the start\n[advance N [minutes|hours|days|months|years] or combos like 1month 2days] - Advance time/date\n[sleep] - Sleep and advance time based on the current clock\n[reset] - Reset to most recent mention in history";
  }
  dateTimeCard.type = "system";
  return dateTimeCard;
}

function recoverClockStateFromDateTimeCard() {
  const dateTimeCard = storyCards.find(card => card.title === "Current Date and Time");
  if (!dateTimeCard || !dateTimeCard.entry) return false;

  const startingDateMatch = dateTimeCard.entry.match(/^\s*Starting date:\s*(.+)\s*$/im);
  const startingTimeMatch = dateTimeCard.entry.match(/^\s*Starting time:\s*(.+)\s*$/im);
  const turnTimeMatch = dateTimeCard.entry.match(/^\s*Turn time:\s*(-?\d+y\d+m\d+d\d+h\d+n\d+s)\s*$/im);
  if (!startingDateMatch || !startingTimeMatch || !turnTimeMatch) return false;

  const parsedDate = normalizeDateInput(startingDateMatch[1]);
  const normalizedTime = normalizeTime(startingTimeMatch[1]);
  const parsedTurnTime = parseTurnTime(turnTimeMatch[1]);
  if (parsedDate.error || !normalizedTime || !parsedTurnTime) return false;

  state.startingDate = parsedDate.date;
  state.startingTime = normalizedTime;
  state.turnTime = parsedTurnTime;
  const current = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
  state.currentDate = current.currentDate;
  state.currentTime = current.currentTime;
  state.settimeInitialized = true;
  return true;
}

function ensureClockStateInitialized() {
  const existingDateTimeCard = storyCards.find(card => card.title === "Current Date and Time");
  if (existingDateTimeCard) {
    existingDateTimeCard.type = "system";
  }

  const parsedStartDate = state.startingDate
    ? normalizeDateInput(state.startingDate)
    : {error: true};
  const validStartTime = state.startingTime && parseClockTime(state.startingTime);

  if (parsedStartDate.error || !validStartTime) {
    if (recoverClockStateFromDateTimeCard()) return;

    state.startingDate = WTG_SCENE_START_DATE;
    state.startingTime = getSceneDefaultStartTime();
    state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
    state.settimeInitialized = true;
  } else {
    state.startingDate = parsedStartDate.date;
    state.startingTime = validStartTime.display;
    state.turnTime = normalizeTurnTimeSign(state.turnTime);
  }

  const current = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
  state.currentDate = current.currentDate;
  state.currentTime = current.currentTime;
}

/**
 * Updates the Current Date and Time storycard
 */
function updateDateTimeCard() {
  const dateTimeCard = getCurrentDateTimeCard();
  const ttForm = formatTurnTime(state.turnTime);
  let entry = `Current date: ${state.currentDate || 'Unknown'}\nCurrent time: ${state.currentTime || 'Unknown'}\nStarting date: ${state.startingDate || 'Unknown'}\nStarting time: ${state.startingTime || 'Unknown'}\nTurn time: ${ttForm}`;
  dateTimeCard.entry = entry;
  updateWTGDebugCard();
}

function getWTGDebugCard(createIfMissing = true) {
  let debugCard = storyCards.find(card => card.title === "WTG Debug");
  if (!debugCard && createIfMissing) {
    addStoryCard("WTG Debug");
    debugCard = storyCards[storyCards.length - 1];
    debugCard.type = "system";
    debugCard.keys = "";
    debugCard.description = "WTG debug information. Empty keys keep this card out of AI context.";
  }
  if (debugCard) {
    debugCard.type = "system";
    debugCard.keys = "";
  }
  return debugCard;
}

function isWTGInternalCard(card) {
  if (!card || !card.title) return false;
  return card.title === "WTG Data"
    || card.title === "Current Date and Time"
    || card.title === "World Time Generator Settings"
    || card.title === "WTG Debug"
    || card.title === "WTG Cooldowns";
}

function updateWTGDebugCard() {
  if (!getWTGBooleanSetting("Debug Mode")) {
    const existingCard = getWTGDebugCard(false);
    if (existingCard) existingCard.entry = "";
    return;
  }

  const debugCard = getWTGDebugCard(true);
  const estimate = state.wtgLastDynamicEstimate;
  if (!estimate) {
    debugCard.entry = "No dynamic time estimate recorded yet.";
    return;
  }

  debugCard.entry = [
    `Last dynamic time estimate: +${estimate.minutes} min`,
    `Source: ${estimate.mode}`,
    `Category: ${estimate.category}`,
    `Text length: ${estimate.textLength || 0}`,
    `Scene factor: ${Number(estimate.sceneFactor || 0).toFixed(2)}`,
    `Similarity factor: ${Number(estimate.similarityFactor || 0).toFixed(2)}`,
    `Time multiplier: ${Number(estimate.timeMultiplier || 0).toFixed(2)}`,
    `Raw minutes: ${Number(estimate.rawMinutes || 0).toFixed(2)}`,
    `Previous remainder: ${Number(estimate.previousRemainder || 0).toFixed(2)}`,
    `Stored remainder: ${Number(estimate.remainder || 0).toFixed(2)}`,
    `Explicit minutes: ${estimate.explicitMinutes || 0}`,
    `Similarity: ${Number(estimate.similarity || 0).toFixed(2)}`,
  ].join('\n');
}

/**
 * Adds a timestamp to a storycard if it doesn't already have one
 * @param {Object} card - Storycard to update
 * @param {string} timestamp - Timestamp to append
 */
function addTimestampToCard(card, timestamp) {
  if (!timestamp || timestamp.includes("Unknown")) {
    return;
  }
  if (isWTGInternalCard(card)) {
    return;
  }

  // Only append if the card doesn't already have a timestamp
  if (card && card.entry && !hasTimestamp(card)) {
    // Choose appropriate discovery verb based on card type
    let discoveryVerb = "Discovered on";

    if (card.type === "character") {
      discoveryVerb = "Met on";
    } else if (card.type === "location" || card.type === "place" || card.type === "area") {
      discoveryVerb = "Visited";
    }

    card.entry += `\n\n${discoveryVerb} ${timestamp}`;
  }
}

/**
 * Checks whether a storycard already has a timestamp
 * @param {Object} card - Storycard to check
 * @returns {boolean} True if already has timestamp
 */
function hasTimestamp(card) {
  return Boolean(card && card.entry && WTG_STORYCARD_TIMESTAMP_REGEX.test(card.entry));
}

/**
 * Checks whether any keyword from a storycard appears in the given text
 * @param {Object} card - Storycard to check
 * @param {string} text - Text to search for keywords
 * @returns {boolean} True if any keyword appears in the text
 */
function isCardKeywordMentioned(card, text) {
  if (!card || !card.keys || !text) return false;

  // Normalize text to lowercase for case-insensitive matching
  const normalizedText = text.toLowerCase();

  // Split keys by comma and check each one
  const keys = card.keys.split(',').map(k => k.trim().toLowerCase());

  for (const key of keys) {
    if (!key) continue;

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyRegex = new RegExp(`(^|[^A-Za-z0-9_])${escapedKey}(?=$|[^A-Za-z0-9_])`, 'i');
    if (keyRegex.test(normalizedText)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts a timestamp from a storycard.
 * @param {Object} card - Storycard to check
 * @returns {string|null} Timestamp string if found, null otherwise
 */
function getCardTimestamp(card) {
  if (!card || !card.entry) return null;
  const match = card.entry.match(WTG_STORYCARD_TIMESTAMP_REGEX);
  return match ? `${match[2]} ${match[3]}` : null;
}

/**
 * Updates placeholder timestamps in all existing storycards after a time reset
 * @param {string} newDate - New date in mm/dd/yyyy format
 * @param {string} newTime - New time in hh:mm AM/PM format
 */
function updateAllStoryCardTimestamps(newDate, newTime) {
  const timestamp = `${newDate} ${newTime}`;

  for (let i = 0; i < storyCards.length; i++) {
    const card = storyCards[i];

    // Skip system cards
    if (isWTGInternalCard(card)) {
      continue;
    }

    if (card.entry && (card.entry.includes("Discovered on") || card.entry.includes("Met on") || card.entry.includes("Visited"))) {
      if (card.entry.includes("Unknown")) {
        // Replace placeholder timestamp with new timestamp
        card.entry = card.entry.replace(/(Discovered on|Met on|Visited) \d{1,2}\/\d{1,2}\/\d{4}\s+Unknown/, `$1 ${timestamp}`);
      }
    }
  }
}

/**
 * Extracts keywords from text
 * @param {string} text - Text to process
 * @returns {Array} Array of keywords
 */
function extractKeywords(text) {
  // Simple keyword extraction; real implementation could be more sophisticated here
  const words = text.split(/\s+/);
  const keywords = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, '').toLowerCase();
    if (word.length > 3 && !/^\d+$/.test(word)) {
      keywords.push(word);
    }
  }
  return [...new Set(keywords)]; // Deduplicate
}

/**
 * Calculates similarity between two keyword arrays
 * @param {Array} keywords1 - First keyword array
 * @param {Array} keywords2 - Second keyword array
 * @returns {number} Similarity score (0-1)
 */
function calculateKeywordSimilarity(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const intersection = [...set1].filter(x => set2.has(x));
  const union = [...new Set([...set1, ...set2])];

  return intersection.length / union.length;
}

/**
 * Gets or creates the WTG Settings storycard
 * @returns {Object} WTG Settings storycard object
 */
function getWTGSettingsCard() {
  let settingsCard = storyCards.find(card => card.title === "World Time Generator Settings");
  if (!settingsCard) {
    addStoryCard("World Time Generator Settings");
    settingsCard = storyCards[storyCards.length - 1];
    settingsCard.type = "system";
    settingsCard.keys = ""; // No keys to avoid entering AI context
    settingsCard.description = "World Time Generator Settings - Edit the values below to configure the system.";
    settingsCard.entry = `Time Duration Multiplier: 1.0
Debug Mode: false
WTG Disabled: false`;
  } else {
    settingsCard.type = "system";
    settingsCard.keys = "";
    migrateWTGSettings(settingsCard);
  }
  return settingsCard;
}

function migrateWTGSettings(settingsCard) {
  if (!settingsCard) return;
  settingsCard.entry = settingsCard.entry || '';

  const legacyDisableMatch = settingsCard.entry.match(/^\s*(?:Disable WTG Entirely|Disable WTG):\s*(true|false)\s*$/im);
  const hasCurrentDisable = /^\s*WTG Disabled:\s*(true|false)\s*$/im.test(settingsCard.entry);
  if (!hasCurrentDisable) {
    const value = legacyDisableMatch ? legacyDisableMatch[1].toLowerCase() : 'false';
    settingsCard.entry = settingsCard.entry.trim()
      ? `${settingsCard.entry.trim()}\nWTG Disabled: ${value}`
      : `WTG Disabled: ${value}`;
  }

  settingsCard.entry = settingsCard.entry
    .replace(/^\s*Disable WTG Entirely:\s*(?:true|false)\s*$/gim, '')
    .replace(/^\s*Disable WTG:\s*(?:true|false)\s*$/gim, '')
    .replace(/^\s*Enable Dynamic Time:\s*(?:true|false)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Reads a boolean setting from the WTG Settings card
 * @param {string} settingName - Name of the setting to read
 * @returns {boolean} Boolean value of the setting, defaults to false
 */
function getWTGBooleanSetting(settingName) {
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return false;

  const regex = new RegExp(`${settingName}:\\s*(true|false)`, 'i');
  const match = settingsCard.entry.match(regex);
  return match ? match[1].toLowerCase() === 'true' : false;
}

function isWTGDisabled() {
  return getWTGBooleanSetting("WTG Disabled");
}

/**
 * Reads the time multiplier from the WTG Settings card
 * @returns {number} Time multiplier value (default 1.0)
 */
function getTimeMultiplier() {
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return 1.0;

  const regex = /^\s*Time Duration Multiplier:\s*((?:\d+(?:\.\d*)?)|(?:\.\d+))\s*$/im;
  const match = settingsCard.entry.match(regex);
  if (match) {
    const value = parseFloat(match[1]);
    return Number.isFinite(value) && value > 0 ? value : 1.0;
  }
  return 1.0;
}

function getDynamicMinuteRemainder() {
  const remainder = Number(state.wtgDynamicMinuteRemainder);
  return Number.isFinite(remainder) && remainder > 0 && remainder < 1
    ? remainder
    : 0;
}

function clearDynamicMinuteRemainder() {
  delete state.wtgDynamicMinuteRemainder;
}

function applyDynamicMinuteRemainder(estimate) {
  const previousRemainder = getDynamicMinuteRemainder();
  const rawMinutes = Number.isFinite(Number(estimate.rawMinutes))
    ? Math.max(0, Number(estimate.rawMinutes))
    : 0;
  const boundedRawMinutes = estimate.mode === 'dynamic'
    ? Math.min(rawMinutes, WTG_DYNAMIC_MAX_AUTO_MINUTES)
    : rawMinutes;
  const totalMinutes = previousRemainder + boundedRawMinutes;
  const minutes = Math.floor(totalMinutes + 1e-9);
  const remainder = totalMinutes - minutes;

  if (remainder > 1e-9) {
    state.wtgDynamicMinuteRemainder = remainder;
  } else {
    clearDynamicMinuteRemainder();
  }

  return Object.assign({}, estimate, {
    minutes,
    previousRemainder,
    remainder
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasQuotedSpeech(text) {
  return /"[^"]+"/.test(String(text || ''));
}

function countSpeakerLines(text) {
  const internalLabels = /^(current date|current time|starting date|starting time|turn time|time duration multiplier|debug mode|wtg disabled|source|category|text length|scene factor|similarity factor|time multiplier|raw minutes|previous remainder|stored remainder|explicit minutes|similarity|last dynamic time estimate)$/i;
  const lineRegex = /(?:^|\n)\s*([^:\n]{1,32}):\s*(?=\S)/g;
  let count = 0;
  let match;

  while ((match = lineRegex.exec(String(text || ''))) !== null) {
    const label = normalizeActionText(match[1]).toLowerCase();
    if (!label || !/[a-z]/i.test(label) || /^(?:https?|ftp)$/i.test(label) || internalLabels.test(label)) continue;
    count++;
  }

  return count;
}

function hasPastSpeechReference(text, actionType = 'continue') {
  if (actionType === 'say') return false;
  return /\b(said|asked|replied|answered|whispered|spoke|talked|chatted|conversed|argued|explained|muttered|shouted)\b/i.test(String(text || ''));
}

function hasCurrentSpeechReference(text) {
  return /\b(say|says|saying|ask|asks|asking|reply|replies|replying|answer|answers|answering|whisper|whispers|whispering|speak|speaks|speaking|talk|talks|talking|chat|chats|chatting|converse|converses|conversing|argue|argues|arguing|explain|explains|explaining|mutter|mutters|muttering|shout|shouts|shouting)\b/i.test(String(text || ''));
}

function hasPastSpeechMemoryContext(text, actionType = 'continue') {
  if (!hasPastSpeechReference(text, actionType)) return false;
  return !hasCurrentSpeechReference(text) && countSpeakerLines(text) === 0;
}

function hasConversationTimingContext(text, actionType = 'continue') {
  if (actionType === 'say') return true;
  const rawText = String(text || '');
  if (!normalizeActionText(rawText)) return false;
  if (hasPastSpeechMemoryContext(rawText, actionType)) return false;

  return hasQuotedSpeech(rawText) ||
    countSpeakerLines(rawText) > 0 ||
    hasCurrentSpeechReference(rawText);
}

function parseDurationAmount(amountText) {
  const valueMap = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    half: 0.5,
    quarter: 0.25,
    couple: 2,
    few: 3,
    several: 4
  };

  const normalized = String(amountText || '').toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return parseFloat(normalized);
  }
  return valueMap[normalized] || null;
}

function extractExplicitDurationMinutes(turnText) {
  const lower = normalizeActionText(turnText).toLowerCase();
  if (!lower) return 0;

  const unitMinutes = {
    minute: 1,
    minutes: 1,
    min: 1,
    mins: 1,
    hour: 60,
    hours: 60,
    hr: 60,
    hrs: 60,
    day: 1440,
    days: 1440,
    week: 10080,
    weeks: 10080
  };
  const amountWords = 'a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter|couple|few|several|\\d+(?:\\.\\d+)?';
  const durationRegex = new RegExp(`\\b(${amountWords})\\s*(?:of\\s+)?(?:an?\\s+)?(minutes?|mins?|hours?|hrs?|days?|weeks?)\\b`, 'gi');
  let totalMinutes = 0;
  let match;

  while ((match = durationRegex.exec(lower)) !== null) {
    const amount = parseDurationAmount(match[1]);
    const unit = match[2].toLowerCase();
    if (amount && unitMinutes[unit]) {
      totalMinutes += amount * unitMinutes[unit];
    }
  }

  if (/\b(overnight|through the night|all night|until morning)\b/.test(lower)) {
    totalMinutes = Math.max(totalMinutes, 480);
  }
  if (/\b(tomorrow|next morning|next day|the following day)\b/.test(lower)) {
    totalMinutes = Math.max(totalMinutes, 1440);
  }

  return Math.round(clampNumber(totalMinutes, 0, 43200));
}

/**
 * Estimates elapsed minutes with one calculation path:
 * current text length, one scene factor, the original similarity adjustment,
 * and the user-configured multiplier.
 */
function estimateDynamicTime(turnText, actionType = 'continue', similarity = 0, timeMultiplier = 1, memoryText = turnText) {
  const normalizedText = normalizeActionText(turnText);
  const lower = normalizedText.toLowerCase();
  const textLength = normalizedText.length;
  const similarityClamped = clampNumber(Number(similarity) || 0, 0, 1);
  const multiplier = Number.isFinite(Number(timeMultiplier)) && Number(timeMultiplier) > 0
    ? Number(timeMultiplier)
    : 1;
  const explicitMinutes = extractExplicitDurationMinutes(normalizedText);

  if (explicitMinutes > 0) {
    const rawMinutes = Math.min(explicitMinutes, WTG_DYNAMIC_MAX_EXPLICIT_MINUTES) * multiplier;
    return {
      mode: 'explicit',
      category: 'explicit',
      minutes: Math.max(0, Math.floor(rawMinutes)),
      rawMinutes,
      textLength,
      sceneFactor: 1,
      similarityFactor: 1,
      timeMultiplier: multiplier,
      explicitMinutes,
      similarity: similarityClamped
    };
  }

  let category = actionType === 'continue' ? 'continue' : 'neutral';
  let sceneFactor = 1;
  let minimumMinutes = 0;

  if (hasPastSpeechMemoryContext(memoryText, actionType)) {
    category = 'memory';
    sceneFactor = 0;
  } else if (hasConversationTimingContext(normalizedText, actionType)) {
    category = 'dialogue';
    sceneFactor = 0.65;
    minimumMinutes = 1;
  } else if (/\b(later|afterward|afterwards|eventually|meanwhile|overnight|tomorrow|nightfall|daybreak|after that|before long)\b/.test(lower)) {
    category = 'transition';
    sceneFactor = 1.45;
    minimumMinutes = 1;
  } else if (/\b(travel|journey|trek|hike|march|ride|sail|fly|drive|cross|return|leave|arrive|reach|head|move|proceed|walk|wait|rest|camp)\b/.test(lower)) {
    category = 'travel';
    sceneFactor = 1.1;
    minimumMinutes = 1;
  } else if (/\b(search|explore|inspect|investigate|track|follow|climb|descend|enter|open|unlock|gather|cook|tend|examine|study|scout|prepare|work|build|repair|craft|train|practice)\b/.test(lower)) {
    category = 'activity';
    sceneFactor = 0.95;
    minimumMinutes = 1;
  } else if (/\b(attack|fight|block|parry|dodge|slash|stab|shoot|strike|lunge|grapple|wrestle|reload|aim)\b/.test(lower)) {
    category = 'combat';
    sceneFactor = 0.8;
    minimumMinutes = 1;
  }

  let similarityFactor = 1;
  if (similarityClamped > 0.3) {
    similarityFactor = 0.7;
  } else if (similarityClamped < 0.1) {
    similarityFactor = 1.3;
  }

  const calculatedMinutes = (textLength / WTG_DYNAMIC_CHARS_PER_MINUTE)
    * sceneFactor
    * similarityFactor
    * multiplier;
  const rawMinutes = Math.max(minimumMinutes * multiplier, calculatedMinutes);
  const minutes = sceneFactor === 0
    ? 0
    : Math.min(WTG_DYNAMIC_MAX_AUTO_MINUTES, Math.floor(rawMinutes));

  return {
    mode: 'dynamic',
    category,
    minutes,
    rawMinutes,
    textLength,
    sceneFactor,
    similarityFactor,
    timeMultiplier: multiplier,
    explicitMinutes: 0,
    similarity: similarityClamped
  };
}

/**
 * Checks whether settime has been initialized (triggered by user call or auto-detection)
 * @returns {boolean} True if settime has been initialized
 */
function hasSettimeBeenInitialized() {
  // First check the flag in state
  if (state.settimeInitialized) {
    return true;
  }

  // Compatible with lightweight default initialization: if there's already a parseable start time, consider the clock established.
  if (state.startingDate && state.startingTime && state.startingTime !== 'Unknown' && /\d/.test(state.startingTime)) {
    state.settimeInitialized = true;
    return true;
  }

  // Fallback: check if there's a settime marker in the WTG Data storycard
  const dataCard = getWTGDataCard();
  if (dataCard && dataCard.entry && dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
    state.settimeInitialized = true;
    return true;
  }

  return false;
}

/**
 * Marks settime as initialized in both state and WTG Data storycard.
 * Also creates the WTG Settings storycard for user configuration.
 */
function markSettimeAsInitialized() {
  state.settimeInitialized = true;

  const dataCard = getWTGDataCard();
  if (dataCard) {
    if (!dataCard.entry) {
      dataCard.entry = '[SETTIME_INITIALIZED]';
    } else if (!dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
      dataCard.entry = '[SETTIME_INITIALIZED]\n' + dataCard.entry;
    }
  }

  // Create the WTG Settings storycard for user configuration
  getWTGSettingsCard();
}

/**
 * Ensures action text has a leading space.
 * If there's no leading space, automatically adds one.
 * @param {string} actionText - Action text to process
 * @returns {string} Action text with leading space ensured
 */
function ensureLeadingSpace(actionText) {
  if (!actionText || typeof actionText !== 'string') {
    return actionText;
  }

  // Check if text already starts with a space
  if (actionText.charAt(0) === ' ') {
    return actionText;
  }

  // Add leading space
  return ' ' + actionText;
}

/**
 * Sanitizes accidental system time and system command leakage from visible output.
 * Only removes clear system formats to avoid accidentally damaging naturally occurring time statements in the narrative.
 * @param {string} outputText - Raw visible output
 * @returns {string} Sanitized output text
 */
function sanitizeSystemLeakage(outputText) {
  if (!outputText || typeof outputText !== 'string') {
    return outputText;
  }

  let cleaned = outputText.replace(/\r\n/g, '\n');

  // Remove entire lines of leaked system time and system constraints.
  cleaned = cleaned.replace(/^\s*Current date:\s*.*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Current time:\s*.*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Do not recreate or reference any system commands.*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Keep scene chronology consistent with the hidden current date\/time below\..*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Do not expose system metadata.*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Only mention exact time when the narrative naturally requires it\..*(?:\n|$)/gim, '');

  // Remove internal tags and explicit system command leakage.
  cleaned = cleaned.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, '');
  cleaned = cleaned.replace(/\[(?:settime|setcurrent|advance)(?:\s+[^\]]*)?\]/gi, '');
  cleaned = cleaned.replace(/\[(?:reset|sleep)\]/gi, '');
  cleaned = cleaned.replace(WTG_TURN_TIME_MARKER_REGEX, '');

  // Collapse any excess blank lines and edge whitespace that may result from cleanup.
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// ====================================================================================
// LIGHTWEIGHT HOOK ENTRY POINTS
// ====================================================================================

/**
 * Lightweight Input Entry Point
 * Preserves the original Input.js behavior while centralizing logic in library.js,
 * allowing hook files to remain thin wrappers.
 * @param {string} text - Original player input
 * @returns {string} Modified player input text
 */
function onInput_WTG(text) {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  // Check if WTG is completely disabled
  if (isWTGDisabled()) {
    clearPendingPlayerInput();
    return text;
  }

  ensureClockStateInitialized();

  state.changed = state.changed || false;

  let modifiedText = text;
  let messages = [];

  clearPendingPlayerInput();
  delete state.wtgSkipNextAutomaticTiming;

  // Prioritize handling the dedicated [sleep] command as it completely replaces this input.
  if (text.trim().toLowerCase() === '[sleep]') {
    state.wtgSkipNextAutomaticTiming = true;
    if (state.currentTime !== 'Unknown') {
      // Sleep should advance the current clock without mutating the fixed scene starting time.
      let add = getSleepDuration(state.currentTime);
      state.turnTime = addToTurnTime(state.turnTime, add);
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      const ttMarker = formatTurnTime(state.turnTime);
      messages.push(`\n\n[SYSTEM] You go to sleep and wake up on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]\n\n`);
    } else {
      // If the current clock is unknown, preserve the fixed scene start and only advance the day count.
      state.turnTime = addToTurnTime(state.turnTime, {days: 1});
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      const ttMarker = formatTurnTime(state.turnTime);
      messages.push(`\n\n[SYSTEM] You go to sleep and wake up on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]\n\n`);
    }
    clearDynamicMinuteRemainder();
    state.changed = true;
    modifiedText = '';
  }
  // Handle [settime], [advance], [reset] and other bracket commands.
  else {
    let trimmedText = text.trim();
    if (trimmedText.match(/^\[(.+?)\]$/)) {
      state.wtgSkipNextAutomaticTiming = true;
      const commandStr = trimmedText.match(/^\[(.+?)\]$/)[1].trim().toLowerCase();
      const parts = commandStr.split(/\s+/);
      const command = parts[0];

      if (command === 'settime') {
        // [settime] explicitly replaces the starting point and resets cumulative turn time.
        let dateStr = parts[1];
        let timeStr = parts.slice(2).join(' ');
        if (dateStr) {
          const parsedDate = normalizeDateInput(dateStr);
          const normalizedTime = normalizeTime(timeStr);
          if (parsedDate.error) {
            messages.push(parsedDate.error);
          } else if (!normalizedTime) {
            messages.push(`[Invalid time: ${timeStr || '(missing)'}. Use h:mm AM/PM, HH:mm, or a configured descriptive time such as morning.]`);
          } else {
            state.startingDate = parsedDate.date;
            state.startingTime = normalizedTime;
            state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
            const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
            state.currentDate = currentDate;
            state.currentTime = currentTime;

            // Keep existing storycard placeholder/default timestamps consistent with the new starting time.
            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`\n[SYSTEM] Starting date and time set to ${state.startingDate} ${state.startingTime}. [[${ttMarker}]]\n`);
            // Persist "explicit settime executed" state so other hooks can coordinate.
            markSettimeAsInitialized();
            writeTurnData([]);
            clearDynamicMinuteRemainder();
            state.changed = true;
          }
        } else {
          messages.push('[Invalid date. Use command: settime mm/dd/yyyy h:mm AM/PM.]');
        }
      } else if (command === 'setcurrent') {
        let dateStr = parts[1];
        let timeStr = parts.slice(2).join(' ');
        if (!dateStr) {
          messages.push('[Invalid date. Use command: setcurrent mm/dd/yyyy with an optional time.]');
        } else if (!state.startingDate || !state.startingTime || state.startingTime === 'Unknown' || !parseClockTime(state.startingTime)) {
          messages.push('[Current date/time cannot be recalculated until a numeric starting time exists. Use [settime mm/dd/yyyy h:mm AM/PM] first.]');
        } else {
          const parsedDate = normalizeDateInput(dateStr);
          const fallbackTime = parseClockTime(state.currentTime) ? state.currentTime : state.startingTime;
          const normalizedTime = timeStr ? normalizeTime(timeStr) : fallbackTime;

          if (parsedDate.error) {
            messages.push(parsedDate.error);
          } else if (!normalizedTime || !parseClockTime(normalizedTime)) {
            messages.push(`[Invalid time: ${timeStr || '(current time unavailable)'}. Use h:mm AM/PM, HH:mm, or omit time to keep the current clock.]`);
          } else {
            state.turnTime = getDateDiff(state.startingDate, state.startingTime, parsedDate.date, normalizedTime);
            state.currentDate = parsedDate.date;
            state.currentTime = normalizedTime;

            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);
            cleanupWTGDataCardByTimestamp(state.turnTime);
            cleanupStoryCardsByTimestamp(state.currentDate, state.currentTime);

            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`\n\n[SYSTEM] Current date/time set to ${state.currentDate} ${state.currentTime}. Elapsed turn time recalculated from start: ${ttMarker}. [[${ttMarker}]]\n\n`);
            markSettimeAsInitialized();
            clearDynamicMinuteRemainder();
            state.changed = true;
          }
        }
      } else if (command === 'advance') {
        // [advance] directly accumulates relative time delta onto turnTime.
        if (state.startingTime === 'Unknown' || !parseClockTime(state.startingTime)) {
          messages.push(`[Time advancement not applied as current time is descriptive (${state.startingTime}). Use [settime] to set a numeric time if needed.]`);
        } else {
          const parsedAdvance = parseAdvanceSpec(parts.slice(1).join(' '));
          if (parsedAdvance.error) {
            messages.push(parsedAdvance.error);
          } else {
            const add = parsedAdvance.add;
            if (add.years || add.months || add.days || add.hours || add.minutes) {
              const current = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
              const advanced = advanceDateTimeValue(current.currentDate, current.currentTime, add);
              if (!advanced) {
                messages.push('[Time advancement could not be calculated from the current date/time.]');
              } else {
                state.currentDate = advanced.date;
                state.currentTime = advanced.time;
                state.turnTime = getDateDiff(
                  state.startingDate,
                  state.startingTime,
                  state.currentDate,
                  state.currentTime
                );
                const ttMarker = formatTurnTime(state.turnTime);
                messages.push(`\n\n[SYSTEM] Advanced ${parsedAdvance.summary}. New date/time: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]\n\n`);
                clearDynamicMinuteRemainder();
                state.changed = true;
              }
            }
          }
        }
      } else if (command === 'reset') {
        // [reset] finds the most recent explicit date/time in history and realigns the clock accordingly.
        let newDate = getCurrentDateFromHistory('', true);
        let newTime = getCurrentTimeFromHistory('', true);
        let valid = false;
        if (newDate) {
          const parsedDate = normalizeDateInput(newDate);
          if (!parsedDate.error) {
            let tempCurrentDate = parsedDate.date;
            let tempCurrentTime = newTime ? normalizeTime(newTime) : state.startingTime;
            if (tempCurrentTime && parseClockTime(tempCurrentTime)) {
              state.turnTime = getDateDiff(state.startingDate, state.startingTime, tempCurrentDate, tempCurrentTime);
              state.currentDate = tempCurrentDate;
              state.currentTime = tempCurrentTime;

              // After reset, realign placeholder/default storycard timestamps.
              updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

              valid = true;
            }
          }
        }
        if (valid) {
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`\n\n[SYSTEM] Date and time reset to most recent mention: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]\n\n`);
          clearDynamicMinuteRemainder();
          state.changed = true;
        } else {
          messages.push(`[No date or time mentions found in history.]`);
        }
      } else {
        messages.push('[Invalid command. Available: settime, setcurrent, advance, reset, sleep.]');
      }
      modifiedText = '';
    } else if (trimmedText) {
      rememberPendingPlayerInput(text);
    }
  }

  // Prepend system messages generated by command processing to the output text.
  if (messages.length > 0) {
    modifiedText = messages.join('\n') + (modifiedText ? '\n' + modifiedText : '');
  }

  return modifiedText;
}

/**
 * Lightweight Context Entry Point
 * Preserves the original Context.js behavior while centralizing logic in library.js,
 * allowing hook files to remain thin wrappers.
 * @param {string} text - Original context text
 * @returns {string} Modified context text
 */
function onContext_WTG(text) {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  // Check if WTG is completely disabled
  if (isWTGDisabled()) {
    clearPendingPlayerInput();
    return text;
  }

  ensureClockStateInitialized();

  let modifiedText = text;

  // Read lightweight turn log for reconstructing history and recovering from erase states.
  let turnData = getTurnData();
  let historyRolledBack = false;
  let rollbackTurnTime = null;

  // Every saved AI output is a timeline anchor, including Continue generations.
  // If the newest saved output no longer exists in history, restore the newest
  // retained output timestamp and remove the erased branch from WTG Data.
  const firstRewindAnchorIndex = turnData.findIndex(record =>
    record.version >= 4 && normalizeActionText(record.responseText)
  );
  const lastRewindAnchorIndex = (() => {
    for (let i = turnData.length - 1; i >= 0; i--) {
      if (turnData[i].version >= 4 && normalizeActionText(turnData[i].responseText)) {
        return i;
      }
    }
    return -1;
  })();
  if (lastRewindAnchorIndex >= 0) {
    const matchingTurn = findLatestTurnDataEntryInHistory(turnData, history);
    if (!matchingTurn) {
      writeTurnData(turnData.slice(0, firstRewindAnchorIndex));
      turnData = getTurnData();
      rollbackTurnTime = getLastTimestampFromWTGData();
      historyRolledBack = true;
    } else if (matchingTurn.index !== lastRewindAnchorIndex) {
      trimTurnDataAfterIndex(turnData, matchingTurn.index);
      turnData = getTurnData();
      rollbackTurnTime = getLastTimestampFromWTGData();
      historyRolledBack = true;
    }
  }
  if (historyRolledBack) {
    clearDynamicMinuteRemainder();
  }

  // The host-managed state is the authoritative running clock.
  // Storycard data may still contain entries from the erased future.
  const {lastTT, found: markerFound} = getLastTurnTime(history);
  let baseTT = normalizeTurnTimeSign(state.turnTime);
  if (historyRolledBack) {
    baseTT = rollbackTurnTime || (markerFound
      ? lastTT
      : {years:0, months:0, days:0, hours:0, minutes:0, seconds:0});
  }

  // Check if lastTT came from the most recent action (usually means it came from a user command).
  // If the last action ends with a precise [[turntime]], trust that marker instead of continuing to accumulate time.
  let useLastTTDirectly = false;
  if (history.length > 0) {
    const lastActionText = String(history[history.length - 1] && history[history.length - 1].text || '');
    if (lastActionText.match(/\[\[(-?\d+y\d+m\d+d\d+h\d+n\d+s)\]\]\s*$/)) {
      useLastTTDirectly = true;
    }
  }

  if (useLastTTDirectly && markerFound) {
    // If the most recent action already ends with a precise [[turntime]],
    // trust that marker and don't append elapsed time here.
    state.turnTime = lastTT;
    clearDynamicMinuteRemainder();
    const {currentDate, currentTime} = computeCurrent(state.startingDate || WTG_SCENE_START_DATE, state.startingTime || 'Unknown', state.turnTime);
    state.currentDate = currentDate;
    state.currentTime = currentTime;
    state.changed = true;
  } else {
    state.turnTime = baseTT;
  }
  if (historyRolledBack) {
    state.changed = true;
  }

  const {currentDate, currentTime} = computeCurrent(
    state.startingDate || WTG_SCENE_START_DATE,
    state.startingTime || 'Unknown',
    state.turnTime
  );
  state.currentDate = currentDate;
  state.currentTime = currentTime;

  // Remove WTG Data entries that are now in the future relative to the reconstructed clock.
  cleanupWTGDataCardByTimestamp(state.turnTime);

  // After erase/reset processing, remove future timestamps from non-system storycards.
  cleanupStoryCardsByTimestamp(state.currentDate, state.currentTime);
  updateWTGDebugCard();

  let instructions = `\nDo not recreate or reference any system commands such as [settime], [setcurrent], [advance], [reset], or [sleep]. Keep scene chronology consistent with the hidden current date/time below. Do not expose system metadata, and only mention exact time when the narrative naturally requires it.`;

  modifiedText += instructions;

  // Inject current date/time once either the default or an explicit clock is initialized.
  let dateTimeInjection = '';
  if (hasSettimeBeenInitialized() && state.currentTime !== 'Unknown') {
    dateTimeInjection = `\nCurrent date: ${state.currentDate}; Current time: ${state.currentTime}`;
  }

  return modifiedText + dateTimeInjection;
}

/**
 * Lightweight Output Entry Point
 * Preserves the original Output.js behavior while centralizing logic in library.js,
 * allowing hook files to remain thin wrappers.
 * @param {string} text - Original AI output
 * @returns {string} Modified AI output text
 */
function onOutput_WTG(text) {
  // Ensure state.turnTime is always initialized
  state.turnTime = state.turnTime || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};

  let modifiedText = text;

  // Check if WTG is completely disabled
  if (isWTGDisabled()) {
    clearPendingPlayerInput();
    return text;
  }

  ensureClockStateInitialized();

  // If state lost the settime initialized flag, recover from persisted lightweight data.
  if (!state.settimeInitialized) {
    const dataCard = getWTGDataCard();
    if (dataCard && dataCard.entry && dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
      state.settimeInitialized = true;
    }
  }

  // At the beginning of a scene, allow [settime ...] in storycards to auto-establish the clock.
  if (state.startingDate === WTG_SCENE_START_DATE && info.actionCount <= 1) {
    // Scan all storycards for [settime] commands
    for (const card of storyCards) {
      if (card.entry) {
        // Match [settime date time] format, compatible with various date separator styles
        const settimeMatch = card.entry.match(/\[settime\s+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\s+(.+?)\]/i);
        if (settimeMatch) {
          let dateStr = settimeMatch[1];
          let timeStr = settimeMatch[2].trim();

          const parsedDate = normalizeDateInput(dateStr);
          const normalizedTime = normalizeTime(timeStr);

          if (!parsedDate.error && normalizedTime) {
            // Set starting date and time
            state.startingDate = parsedDate.date;
            state.startingTime = normalizedTime;
            state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
            const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
            state.currentDate = currentDate;
            state.currentTime = currentTime;
            clearDynamicMinuteRemainder();
            state.changed = true;

            // Since this is auto-detected [settime], mark as initialized here
            markSettimeAsInitialized();
            writeTurnData([]);

            // Initialize required system storycards
            updateDateTimeCard();
            getWTGSettingsCard();
            getWTGDataCard();

            // Remove the [settime] command itself from the storycard
            card.entry = card.entry.replace(/\[settime\s+\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s+.+?\]/i, '').trim();

            // Skip opening prompt and let AI continue normal response
            // Don't return, proceed to normal flow
            break;
          }
        }
      }
    }
  }

  // Find the most recent player action for turn classification and logging at output stage.
  let lastAction = null;
  let actionType = "continue";

  for (let i = history.length - 1; i >= 0; i--) {
    const action = history[i];
    if (action.type === "do" || action.type === "say" || action.type === "story") {
      lastAction = action;
      actionType = action.type;
      break;
    }
  }
  actionType = getHostActionType(actionType);
  const pendingPlayerInput = hasPendingPlayerInput();
  const freshPendingPlayerInput = hasFreshPendingPlayerInput();
  const ttMatch = modifiedText.match(/\[\[(-?\d+y\d+m\d+d\d+h\d+n\d+s)\]\]\s*$/);
  let parsedTT = ttMatch ? parseTurnTime(ttMatch[1]) : null;
  let narrative = ttMatch
    ? modifiedText.replace(/\[\[-?\d+y\d+m\d+d\d+h\d+n\d+s\]\]\s*$/, '').trim()
    : modifiedText.trim();

  if (parsedTT) {
    if (compareTurnTime(parsedTT, state.turnTime) !== 0) {
      narrative += '\n[Warning: Turn time metadata altered by AI. Please retry.]';
    }
  }

  modifiedText = narrative;

  const skipAutomaticTiming = Boolean(state.wtgSkipNextAutomaticTiming);
  const timingActionType = pendingPlayerInput
    ? (state.wtgPendingPlayerInputType || actionType || 'do')
    : 'continue';
  const shouldEstimateTime = !skipAutomaticTiming &&
    (!pendingPlayerInput || freshPendingPlayerInput);

  if (shouldEstimateTime) {
    const playerText = pendingPlayerInput
      ? String(state.wtgPendingPlayerInputRaw || state.wtgPendingPlayerInputText || '')
      : '';
    const timingText = playerText
      ? `${playerText}\n${narrative}`.trim()
      : narrative;
    const turnData = getTurnData();
    const currentKeywords = extractKeywords(timingText);
    const lastKeywords = turnData.length >= 1
      ? extractKeywords(turnData[turnData.length - 1].actionText + ' ' + (turnData[turnData.length - 1].responseText || ''))
      : [];
    const secondLastKeywords = turnData.length >= 2
      ? extractKeywords(turnData[turnData.length - 2].actionText + ' ' + (turnData[turnData.length - 2].responseText || ''))
      : [];
    const similarity = Math.max(
      calculateKeywordSimilarity(lastKeywords, currentKeywords),
      calculateKeywordSimilarity(secondLastKeywords, currentKeywords)
    );
    const estimate = applyDynamicMinuteRemainder(
      estimateDynamicTime(
        timingText,
        timingActionType,
        similarity,
        getTimeMultiplier(),
        playerText
      )
    );

    state.wtgSimilarity = similarity;
    state.wtgLastDynamicEstimate = estimate;
    state.wtgPendingPlayerInputNeedsTiming = false;

    if (estimate.minutes > 0) {
      state.turnTime = addToTurnTime(state.turnTime, {minutes: estimate.minutes});
      const current = computeCurrent(
        state.startingDate || WTG_SCENE_START_DATE,
        state.startingTime || 'Unknown',
        state.turnTime
      );
      state.currentDate = current.currentDate;
      state.currentTime = current.currentTime;
      state.changed = true;
    }
    updateWTGDebugCard();
  }
  delete state.wtgSkipNextAutomaticTiming;

  // Timestamp storycards mentioned in the combined "player action + AI response" text.
  if (lastAction && hasSettimeBeenInitialized() && state.currentTime !== 'Unknown') {
    const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

    for (let i = 0; i < storyCards.length; i++) {
      const card = storyCards[i];

      if (isWTGInternalCard(card)) {
        continue;
      }

      if (card.entry && !hasTimestamp(card) && isCardKeywordMentioned(card, combinedText)) {
        addTimestampToCard(card, `${state.currentDate} ${state.currentTime}`);
      }
    }
  }

  // Persist every visible AI output as a rewind anchor. Continue generations
  // must be recorded because they can be erased without changing player actions.
  const persistedResponse = sanitizeSystemLeakage(modifiedText);
  const persistedActionType = pendingPlayerInput
    ? (state.wtgPendingPlayerInputType || actionType || 'do')
    : 'continue';
  const persistedActionText = pendingPlayerInput
    ? String(state.wtgPendingPlayerInputRaw || state.wtgPendingPlayerInputText || '')
    : '';
  if (normalizeActionText(persistedResponse)) {
    const timestamp = formatTurnTime(state.turnTime);
    addTurnData(persistedActionType, persistedActionText, persistedResponse, timestamp);
  }

  if (pendingPlayerInput) {
    clearPendingPlayerInput();
  }

  // When state changes or at periodic checkpoints, refresh the visible date/time storycard.
  if (state.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
    updateDateTimeCard();
    delete state.changed;
  }

  // Before final visible output, sanitize accidental system time and system command leakage.
  modifiedText = persistedResponse;

  // Ensure modified text starts with leading space
  modifiedText = ensureLeadingSpace(modifiedText);

  return modifiedText;
}
