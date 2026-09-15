// library.js - Core time management functions for WTG Lightweight Modified
// Derivative of WTG 2.0 by thedenial. - Apache 2.0 - See LICENSE

// ============================================================================
// WTG Scene Start Configuration
// Modify these when switching between different story scenarios
// ============================================================================
const WTG_SCENE_START_DATE = '04/04/2026'; // Or change it as needed
// Dynamic-time calibration follows the WTG 3.0 two-knob model:
// chars-per-minute = (Text Characters per Turn × Number of Turns per Hour) / 60.
// Both knobs live on the settings card (see getCharsPerMinute); these
// constants are only the factory defaults / card-less fallback (= 300 cpm).
const WTG_DEFAULT_TEXT_CHARS_PER_TURN = 600;
const WTG_DEFAULT_TURNS_PER_HOUR = 30;
const WTG_DYNAMIC_MAX_EXPLICIT_MINUTES = 720;
const WTG_MAX_OPENING_ACTIONS = 2;
// AI-issued time commands are gated by in-game-time cooldowns so the AI can
// participate in time management without being able to spam the clock.
const WTG_AI_SLEEP_COOLDOWN = {hours: 8};
const WTG_AI_ADVANCE_COOLDOWN = {minutes: 5};
const WTG_AI_COMMAND_REGEX = /\((sleep|advance)\b([^)]*)\)/gi;
const WTG_MAX_TURN_DATA_RECORDS = 150; // Turn log cap: covers AID's ~100-entry history window with margin
const WTG_MAX_STORED_TEXT_LENGTH = 400; // Per-record text cap that bounds WTG Data card growth
const WTG_TURN_TIME_MARKER_REGEX = /\[\[-?\d+y\d+m\d+d\d+h\d+n\d+s\]\]/g;
// Performance safeguard: cap storycard iteration in the per-turn loops for
// very large scenarios (same pattern as WTG 3.0).
const WTG_MAX_STORYCARDS_TO_PROCESS = 200;
// [ \t] (not \s) between the date and the rest: a hand-written date-only line
// ("Met on 4/4/2026") must never swallow the NEXT line as its "time" — such a
// line is simply not a stamp. System-written stamps always carry date and
// time inline on one line.
const WTG_STORYCARD_TIMESTAMP_REGEX = /(?:^|\n+)(Discovered on|Met on|Visited) (\d{1,2}\/\d{1,2}\/\d{4})[ \t]+([^\n]+)/;
const WTG_STORYCARD_TIMESTAMP_REMOVE_REGEX = /\n*(?:Discovered on|Met on|Visited) \d{1,2}\/\d{1,2}\/\d{4}[ \t]+[^\n]+/;

// Mapping table for descriptive time expressions
const descriptiveMap = new Map([
  ['morning', {defaultTime: '8:00 AM', sleepRange: {hours: [1, 4], crossesDay: false}}],
  ['early morning', {defaultTime: '6:00 AM', sleepRange: {hours: [1, 3], crossesDay: false}}],
  ['afternoon', {defaultTime: '2:00 PM', sleepRange: {hours: [1, 3], crossesDay: false}}],
  ['noon', {defaultTime: '12:00 PM', sleepRange: {hours: [1, 2], crossesDay: false}}],
  ['evening', {defaultTime: '6:00 PM', sleepRange: {hours: [3, 6], crossesDay: false}}],
  ['night', {defaultTime: '10:00 PM', sleepRange: {hours: [6, 9], crossesDay: true}}],
  ['late night', {defaultTime: '11:30 PM', sleepRange: {hours: [6, 8], crossesDay: true}}],
  ['dawn', {defaultTime: '6:00 AM', sleepRange: {hours: [1, 3], crossesDay: false}}],
  ['sunrise', {defaultTime: '6:00 AM', sleepRange: {hours: [1, 3], crossesDay: false}}],
  ['dusk', {defaultTime: '8:00 PM', sleepRange: {hours: [4, 8], crossesDay: true}}],
  ['sunset', {defaultTime: '8:00 PM', sleepRange: {hours: [4, 8], crossesDay: true}}],
  ['midday', {defaultTime: '12:00 PM', sleepRange: {hours: [1, 2], crossesDay: false}}],
  ['midnight', {defaultTime: '12:00 AM', sleepRange: {hours: [6, 8], crossesDay: true}}],
  ['small hours', {defaultTime: '2:00 AM', sleepRange: {hours: [4, 6], crossesDay: true}}]
]);

const WTG_MONTH_NAME_TO_NUMBER = new Map([
  ['jan', 1], ['january', 1],
  ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4],
  ['may', 5],
  ['jun', 6], ['june', 6],
  ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8],
  ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12]
]);
const WTG_MONTH_NAME_PATTERN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WTG_PRESENT_TIME_HINT_REGEX = /\b(now|right now|currently|present(?:ly)?|at present|by now|today|tonight|this (?:morning|afternoon|evening|night))\b/i;

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Resolves a weekday name (full or 3-letter, case-insensitive) to its index
 * in DAYS_OF_WEEK, or -1 when unrecognized.
 * @param {string} name - Weekday name
 * @returns {number} 0-6 (Sunday=0), or -1
 */
function resolveDayOfWeek(name) {
  const lower = String(name || '').toLowerCase().trim();
  if (!lower) return -1;
  return DAYS_OF_WEEK.findIndex(day => day.toLowerCase().startsWith(lower) && lower.length >= 3);
}

/**
 * Returns the day-of-week name for a date. When the scenario anchors a
 * starting weekday via the config card, the anchor is authoritative and
 * later days are derived from it by day-difference — so a fictional calendar
 * (04/04/2026 declared a Friday) stays internally consistent regardless of
 * the real Gregorian calendar. Without an anchor, the real calendar is used.
 * @param {string} dateStr - Date in mm/dd/yyyy format
 * @returns {string|null} Weekday name, or null when undeterminable
 */
function getDayOfWeek(dateStr) {
  const parsed = normalizeDateInput(dateStr);
  if (parsed.error) return null;

  const anchorName = state.wtgSceneStartWeekday;
  if (anchorName) {
    const anchorIndex = resolveDayOfWeek(anchorName);
    if (anchorIndex >= 0) {
      const anchor = normalizeDateInput(getSceneStartDate());
      if (!anchor.error) {
        const diffMs = buildDateFromParts(
          {year: parsed.year, month: parsed.month, day: parsed.day}
        ).getTime() - buildDateFromParts(
          {year: anchor.year, month: anchor.month, day: anchor.day}
        ).getTime();
        const diffDays = Math.round(diffMs / 86400000);
        return DAYS_OF_WEEK[(anchorIndex + diffDays % 7 + 7) % 7];
      }
    }
  }

  const d = buildDateFromParts({year: parsed.year, month: parsed.month, day: parsed.day});
  return DAYS_OF_WEEK[d.getDay()] || null;
}

/**
 * Parses one token of the Starting Timerange list into a [startMin, endMin)
 * span. Token form: "H:MM AM/PM-H:MM AM/PM" (with or without spaces); a start
 * later than the end wraps past midnight. Returns null for malformed tokens.
 * @param {string} token - Single window token, trimmed
 * @returns {number[]|null} [startMin, endMin) or null
 */
function parseStartWindowToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const rangeMatch = raw.match(/^(.+?)\s*-\s*(.+)$/);
  if (!rangeMatch) return null;
  const startParsed = parseClockTime(rangeMatch[1]);
  const endParsed = parseClockTime(rangeMatch[2]);
  if (!startParsed || !endParsed) return null;
  const startMin = startParsed.hour * 60 + startParsed.min;
  let endMin = endParsed.hour * 60 + endParsed.min;
  if (startMin === endMin) return null;
  if (endMin < startMin) endMin += 1440; // wraps past midnight
  return [startMin, endMin];
}

/**
 * Rolls a random clock that can ONLY land inside the configured windows:
 * one uniform point across the union of allowed minutes, mapped back to
 * h:mm AM/PM (spans that wrapped past midnight reduce modulo the day).
 * Minutes outside every window have zero probability.
 * @param {number[][]} spans - Parsed [startMin, endMin) windows
 * @returns {string} Random display time
 */
function randomTimeInWindows(spans) {
  const totalMinutes = spans.reduce((sum, [s, e]) => sum + (e - s), 0);
  let point = Math.floor(Math.random() * totalMinutes);
  for (const [s, e] of spans) {
    if (point < e - s) {
      const minuteOfDay = (s + point) % 1440;
      return formatClockTime(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
    }
    point -= e - s;
  }
  // Unreachable with non-empty spans; defensive fallback to unrestricted roll.
  return getSceneDefaultStartTime();
}

/**
 * Returns the default start time for the current scene. An explicit config
 * card Starting Time is used as-is (deterministic opening); without one the
 * clock rolls randomly, constrained to the card's Starting Timerange when
 * that is provided.
 * @returns {string} Default start time string
 */
function getSceneDefaultStartTime() {
  if (state.wtgSceneStartTime) {
    return normalizeTime(state.wtgSceneStartTime) || '8:00 PM';
  }

  if (Array.isArray(state.wtgSceneStartTimerange) && state.wtgSceneStartTimerange.length > 0) {
    const spans = state.wtgSceneStartTimerange
      .map(parseStartWindowToken)
      .filter(Boolean);
    if (spans.length > 0) {
      return randomTimeInWindows(spans);
    }
  }

  let randHour = Math.floor(Math.random() * 12) + 1;
  let randMinute = Math.floor(Math.random() * 60);
  let ampm = Math.random() < 0.5 ? 'AM' : 'PM';
  let formattedMinute = randMinute.toString().padStart(2, '0');

  return `${randHour}:${formattedMinute} ${ampm}`;
}

// ============================================================================
// WTG SCENE CONFIG CARD
// ============================================================================
// A storycard titled "WTG Scene Config" lets a scenario set the starting
// clock and timing mode without editing library.js. Recognized entry lines:
//   Starting Date: mm/dd/yyyy
//   Starting Time: h:mm AM/PM
//   Starting Weekday: Friday
//   Starting Timerange: 6:00 AM-12:00 PM, 5:00 PM-10:00 PM
// The opening clock is fixed when Starting Time is given and random when it
// is not (random rolls honor Starting Timerange). Missing lines fall back to
// the top-of-file constants. The card is left in place after reading so it
// keeps documenting the scenario. When a weekday is
// given, it anchors all weekday display: the starting date IS that weekday and
// later days derive from it (fictional calendars stay consistent). Starting Timerange restricts the random-mode roll to the listed time ranges
// (comma-separated "H:MM AM/PM-H:MM AM/PM"; a start later than the end wraps
// past midnight).

const WTG_SCENE_CONFIG_CARD_TITLE = 'WTG Scene Config';

/**
 * Reads the optional scene config card. Returns field overrides only when
 * they parse; absent or malformed lines are ignored.
 * @returns {Object|null} {date?, time?, mode?} or null when no card exists
 */
function readSceneConfigCard() {
  const card = storyCards.find(card => card.title === WTG_SCENE_CONFIG_CARD_TITLE);
  if (!card || !card.entry) return null;

  const config = {};
  const dateMatch = card.entry.match(/^\s*Starting Date:\s*(.+)\s*$/im);
  if (dateMatch) {
    const parsed = normalizeDateInput(dateMatch[1]);
    if (!parsed.error) config.date = parsed.date;
  }
  const timeMatch = card.entry.match(/^\s*Starting Time:\s*(.+)\s*$/im);
  if (timeMatch) {
    const normalized = normalizeTime(timeMatch[1]);
    if (normalized) config.time = normalized;
  }
  const weekdayMatch = card.entry.match(/^\s*Starting Weekday:\s*(.+)\s*$/im);
  if (weekdayMatch) {
    const weekday = resolveDayOfWeek(weekdayMatch[1]);
    if (weekday >= 0) config.weekday = DAYS_OF_WEEK[weekday];
  }
  const timerangeMatch = card.entry.match(/^\s*Starting Timerange:\s*(.+)\s*$/im);
  if (timerangeMatch) {
    const tokens = timerangeMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    // Keep only tokens that parse into real spans so an all-invalid line
    // degrades to unrestricted rather than blocking the random roll.
    const valid = tokens.filter(t => parseStartWindowToken(t) !== null);
    if (valid.length > 0) config.timerange = valid;
  }

  return (config.date || config.time || config.weekday || config.timerange) ? config : null;
}

/**
 * Applies scene-config overrides to the module-level scene defaults.
 * Called once during opening-clock initialization.
 * @returns {Object|null} The applied config, or null when no card/overrides
 */
function applySceneConfigCard() {
  if (state.wtgSceneConfigApplied) return null;
  const config = readSceneConfigCard();
  if (!config) return null;

  state.wtgSceneConfigApplied = true;
  if (config.date) {
    // Rebind the module-level default by reassigning through the config
    // consumer: getSceneDefaultStartTime reads WTG_SCENE_* constants, so the
    // override lives on state and consumers check it first.
    state.wtgSceneStartDate = config.date;
  }
  if (config.time) {
    state.wtgSceneStartTime = config.time;
  }
  if (config.weekday) {
    state.wtgSceneStartWeekday = config.weekday;
  }
  if (config.timerange) {
    state.wtgSceneStartTimerange = config.timerange;
  }
  return config;
}

/**
 * Effective scene start date: config card override, else file constant.
 * @returns {string} Scene start date in mm/dd/yyyy format
 */
function getSceneStartDate() {
  return state.wtgSceneStartDate || WTG_SCENE_START_DATE;
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

function escapeRegexLiteral(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Memoized: the descriptive map is static, so the alternation and the
// per-entry regexes below are built once instead of on every history entry
// scanned by [reset] / unverified-clock recovery.
let _descriptiveAltCache = null;
function getDescriptiveTimeAlternation() {
  if (!_descriptiveAltCache) {
    _descriptiveAltCache = [...descriptiveMap.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegexLiteral)
      .join('|');
  }
  return _descriptiveAltCache;
}

function scoreTemporalMention(text, startIndex, rawLength) {
  const start = Math.max(0, startIndex - 48);
  const end = Math.min(String(text || '').length, startIndex + rawLength + 48);
  const nearby = String(text || '').slice(start, end);
  return (WTG_PRESENT_TIME_HINT_REGEX.test(nearby) ? 1000000 : 0) + startIndex;
}

function pickPreferredTemporalMatch(candidates) {
  if (!candidates || candidates.length === 0) return null;
  candidates.sort((a, b) => (b.score - a.score) || (b.index - a.index));
  return candidates[0].value;
}

function buildNarrativeDate(month, day, year) {
  if (year < 100) year += 2000;
  if (!isValidDate(month, day, year)) return null;
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function collectDateMentions(text) {
  const source = String(text || '');
  if (!source) return [];

  const candidates = [];
  const numericDateRegex = /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g;
  let match;

  while ((match = numericDateRegex.exec(source)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    const prev = start > 0 ? source[start - 1] : '';
    const next = end < source.length ? source[end] : '';
    if (/[A-Za-z0-9]/.test(prev) || /[A-Za-z]/.test(next)) continue;

    const parsed = normalizeDateInput(raw.replace(/[.-]/g, '/'));
    if (!parsed.error) {
      candidates.push({
        value: parsed.date,
        index: start,
        score: scoreTemporalMention(source, start, raw.length)
      });
    }
  }

  const monthFirstRegex = new RegExp(`\\b(${WTG_MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*|\\s+)(\\d{4})\\b`, 'gi');
  while ((match = monthFirstRegex.exec(source)) !== null) {
    const month = WTG_MONTH_NAME_TO_NUMBER.get(match[1].toLowerCase());
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const normalized = buildNarrativeDate(month, day, year);
    if (normalized) {
      candidates.push({
        value: normalized,
        index: match.index,
        score: scoreTemporalMention(source, match.index, match[0].length)
      });
    }
  }

  const dayFirstRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${WTG_MONTH_NAME_PATTERN})(?:,\\s*|\\s+)(\\d{4})\\b`, 'gi');
  while ((match = dayFirstRegex.exec(source)) !== null) {
    const day = parseInt(match[1], 10);
    const month = WTG_MONTH_NAME_TO_NUMBER.get(match[2].toLowerCase());
    const year = parseInt(match[3], 10);
    const normalized = buildNarrativeDate(month, day, year);
    if (normalized) {
      candidates.push({
        value: normalized,
        index: match.index,
        score: scoreTemporalMention(source, match.index, match[0].length)
      });
    }
  }

  return candidates;
}

function collectTimeMentions(text) {
  const source = String(text || '');
  if (!source) return [];

  const descriptiveAlt = getDescriptiveTimeAlternation();
  const timeRegex = new RegExp(
    `(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.))|(\\d{1,2}:\\d{2})|\\b(${descriptiveAlt})\\b`,
    'gi'
  );
  const candidates = [];
  const currentIsPrecise = state.currentTime && /\d{1,2}:\d{2} [AP]M/.test(state.currentTime);
  let match;

  while ((match = timeRegex.exec(source)) !== null) {
    const raw = match[0].trim();
    const lower = raw.toLowerCase();
    const isDescriptive = descriptiveMap.has(lower);
    if (isDescriptive && currentIsPrecise) continue;

    const normalized = normalizeTime(raw);
    if (normalized) {
      candidates.push({
        value: normalized,
        index: match.index,
        score: scoreTemporalMention(source, match.index, match[0].length)
      });
    }
  }

  return candidates;
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
  const tokenRegex = /(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\b/gi;
  let lastIndex = 0;
  let matched = false;
  let match;

  while ((match = tokenRegex.exec(rawSpec)) !== null) {
    const between = rawSpec.slice(lastIndex, match.index).trim();
    if (between) {
      return {error: '[Invalid advance unit. Supported units: minutes, hours, days, weeks, months, years.]'};
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
    } else if (unit === 'week' || unit === 'weeks') {
      add.days += amount * 7;
      summaryParts.push(`${amount} week${amount === 1 ? '' : 's'}`);
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
    return {error: '[Invalid advance unit. Supported units: minutes, hours, days, weeks, months, years.]'};
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
  const direct = pickPreferredTemporalMatch(collectDateMentions(currentOutput));
  if (direct) return direct;

  if (useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      const found = pickPreferredTemporalMatch(collectDateMentions(history[i].text));
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extracts a time from current output or history
 * @param {string} currentOutput - Current output text
 * @param {boolean} useHistory - Whether to search history if not found in current output
 * @returns {string|null} Extracted time string, or null if not found
 */
function getCurrentTimeFromHistory(currentOutput = '', useHistory = false) {
  const direct = pickPreferredTemporalMatch(collectTimeMentions(currentOutput));
  if (direct) return direct;

  if (useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      const found = pickPreferredTemporalMatch(collectTimeMentions(history[i].text));
      if (found) return found;
    }
  }

  return null;
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

/**
 * Reduces a turn time to a single comparable number via the real calendar.
 * Note: ms-based Date comparison inherits local-time DST quirks (worst case
 * ~1h, twice a year, possibly an ordering collision inside a spring-forward
 * gap). The core advance math (computeCurrent/advanceDateTimeValue) is
 * integer/calendar-based and immune; only this comparison and getDateDiff's
 * remainder are exposed — an accepted approximation for a narrative clock.
 */
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
    ? null
    : Number(rawActionCount);
  return {
    version: Number.isInteger(rawVersion) && rawVersion >= 4 ? rawVersion : 3,
    actionCount: Number.isInteger(actionCount) && actionCount >= 0 ? actionCount : null,
    actionType: String(record && record.actionType || ''),
    actionText: String(record && record.actionText || ''),
    responseText: String(record && record.responseText || ''),
    timestamp: String(record && record.timestamp || ''),
    // True when responseText was head-truncated at the storage cap: matching
    // then uses prefix semantics (see storedResponseMatchesHistory).
    truncated: Boolean(record && record.truncated),
    // Pacing audit trail (P19): the AI commands executed on this turn, as
    // "command -> minutes" entries. Post-strip responses hide executed
    // commands, so the log carries them explicitly for after-the-fact
    // attribution of clock jumps.
    pacing: String(record && record.pacing || '')
  };
}

/**
 * Trims stored text to the cap so the WTG Data card stays bounded.
 * Truncation keeps the head of the text; the truncation flag rides along on
 * the record so matching can use prefix semantics regardless of how the
 * stored text normalizes (see storedResponseMatchesHistory).
 * @param {string} text - Raw text
 * @returns {{text: string, truncated: boolean}} Bounded text and truncation flag
 */
function boundStoredText(text) {
  const raw = String(text || '');
  if (raw.length <= WTG_MAX_STORED_TEXT_LENGTH) return {text: raw, truncated: false};
  return {text: raw.slice(0, WTG_MAX_STORED_TEXT_LENGTH), truncated: true};
}

/**
 * Compares a stored response against a history text. Records at or under the
 * storage cap match by equality; truncated records match when the history
 * text starts with the stored prefix — the store keeps the head of the
 * response, and a same-length equality is impossible for any genuinely
 * longer history entry. The truncation gate tests the RAW stored length
 * (what boundStoredText capped); both sides are normalized here, and a
 * whitespace-heavy truncated record normalizes shorter than the cap while
 * still needing prefix semantics.
 * @param {string} storedText - Normalized stored response text
 * @param {boolean} storedWasTruncated - True when the raw stored text hit the cap
 * @param {string} historyText - Normalized history entry text
 * @returns {boolean} True when the texts refer to the same output
 */
function storedResponseMatchesHistory(storedText, storedWasTruncated, historyText) {
  if (!storedText || !historyText) return false;
  if (storedText === historyText) return true;
  if (!storedWasTruncated) return false;
  return historyText.startsWith(storedText);
}

function hasSettimeMarker(entry) {
  return Boolean(entry && entry.includes('[SETTIME_INITIALIZED]'));
}

function writeTurnData(records) {
  // Keep the newest records; older ones are unreachable evidence anyway
  // (matching relies on AID's ~100-entry history window). The authoritative
  // log lives in state; the card is re-rendered as a view.
  state.wtgLog = records.slice(-WTG_MAX_TURN_DATA_RECORDS);
  renderTurnDataCard(state.wtgLog);
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
/**
 * Authoritative turn-log storage (P15/P19 organization): state.wtgLog is a
 * structured array - the single home of the record objects. On first access
 * the legacy card-hosted log (JSON blocks / legacy text) is migrated once;
 * after that the WTG Data card serves only as a human-readable view.
 * @returns {Array} The live record array (newest last)
 */
function getTurnData() {
  return loadTurnLog();
}

/**
 * Loads (and, once, migrates) the turn log from state. Legacy card-hosted
 * JSON blocks and legacy text blocks are parsed in the same pass, then the
 * card is re-rendered as a view so the old format never comes back.
 * @returns {Array} The live record array (newest last)
 */
function loadTurnLog() {
  if (Array.isArray(state.wtgLog)) return state.wtgLog;
  const dataCard = getWTGDataCard();
  const migrated = parseJSONTurnData(dataCard.entry)
    .concat(parseLegacyTurnData(dataCard.entry))
    .sort((a, b) => a.index - b.index)
    .map(item => item.record);
  state.wtgLog = migrated;
  renderTurnDataCard(state.wtgLog);
  return state.wtgLog;
}

/**
 * Renders the WTG Data card as a view of the turn log. The card is a display
 * surface only - the authoritative log lives in state.wtgLog.
 * Debug Mode ON renders a detailed newest-first view of every field under a
 * display budget (whatever AID clips from a long entry, the most recent
 * records stay visible). Debug OFF renders the compact last-10 summary.
 * The [SETTIME_INITIALIZED] marker is carried over so the settime recovery
 * signal keeps working across re-renders. A toggle takes effect on the next
 * writeTurnData (once per turn) - no settings-change watcher needed.
 * @param {Array} records - The capped record array (newest last)
 */
function renderTurnDataCard(records) {
  const dataCard = getWTGDataCard();
  const parts = [];
  if (hasSettimeMarker(dataCard.entry)) parts.push('[SETTIME_INITIALIZED]');
  if (getWTGBooleanSetting("Debug Mode")) {
    parts.push('WTG Data - debug view (state.wtgLog, ' + records.length + ' records)');
    if (state.wtgOpenTimeFrame) {
      parts.push('open frame: ' + JSON.stringify(state.wtgOpenTimeFrame));
    }
    const budget = 20000;
    let used = 0;
    let omitted = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      const block = renderRecordDebugBlock(records[i]);
      if (used > 0 && used + block.length > budget) {
        omitted = i + 1;
        break;
      }
      parts.push(block);
      used += block.length + 1;
    }
    if (omitted > 0) parts.push('… ' + omitted + ' older record(s) omitted (view budget)');
  } else {
    parts.push('Recent turns (latest last; full log in state.wtgLog):');
    for (const record of records.slice(-10)) {
      const count = record.actionCount == null ? '?' : record.actionCount;
      const pacing = record.pacing ? '  ' + record.pacing : '';
      parts.push('#' + count + ' ' + (record.actionType || '?') + ' ' + (record.timestamp || '?') + pacing);
    }
  }
  dataCard.entry = parts.join('\n');
}

/**
 * Renders one record as an indented debug block (used by the Debug Mode
 * detailed view only).
 * @param {Object} record - Normalized turn-data record
 * @returns {string} Multi-line block
 */
function renderRecordDebugBlock(record) {
  const count = record.actionCount == null ? '?' : record.actionCount;
  const lines = [
    '#' + count + ' ' + (record.actionType || '?') + ' @ ' + (record.timestamp || '?'),
    '  action: ' + (record.actionText || '(none)'),
    '  response: ' + (record.responseText || '(none)') + (record.truncated ? ' [truncated]' : '')
  ];
  if (record.pacing) lines.push('  pacing: ' + record.pacing);
  return lines.join('\n');
}

/**
 * Appends turn data to the turn log (state.wtgLog).
 * Goes through writeTurnData so the record cap stays authoritative on every
 * append, and so the legacy card-hosted log is migrated on first access.
 * When the host allows a same-position rewrite (retry), the record carrying
 * the current actionCount replaces the stale one so the log holds one entry
 * per turn; Continue generations are excluded because they share the count of
 * the underlying player action. Records without an actionCount are untouched.
 * @param {string} actionType - Action type (do, say, story, continue)
 * @param {string} actionText - Full action text
 * @param {string} responseText - AI response text
 * @param {string} timestamp - Turntime-formatted timestamp
 * @param {Object} [options] - { replaceSameCount?, pacing? }
 */
function addTurnData(actionType, actionText, responseText, timestamp, options = {}) {
  const actionCount = typeof info !== 'undefined' && info && Number.isInteger(info.actionCount)
    ? info.actionCount
    : null;
  const boundedAction = boundStoredText(actionText);
  const boundedResponse = boundStoredText(responseText);
  const record = normalizeTurnDataRecord({
    version: 4,
    actionCount,
    actionType,
    actionText: boundedAction.text,
    responseText: boundedResponse.text,
    timestamp,
    truncated: boundedResponse.truncated,
    pacing: options.pacing || ''
  });

  const records = getTurnData();
  const replaceSameCount = options.replaceSameCount !== false &&
    actionCount !== null &&
    actionType !== 'continue';

  let keptRecords;
  if (replaceSameCount) {
    keptRecords = records.filter(r => r.actionCount !== actionCount);
  } else if (actionType === 'continue') {
    // Retrying a Continue reuses the same actionCount and never re-fires
    // input, so the previous generation's record would pile up unpruned.
    // Its output is gone from history (the host removed it), so drop
    // same-count continue records whose text no longer exists there.
    const historyTexts = new Set(
      (Array.isArray(history) ? history : [])
        .map(item => normalizeActionText(item && item.text))
        .filter(Boolean)
    );
    keptRecords = records.filter(r => {
      if (r.actionType !== 'continue' || r.actionCount !== actionCount) return true;
      const stored = normalizeActionText(r.responseText);
      if (!stored) return true;
      if (historyTexts.has(stored)) return true;
      // Truncation gate must use the stored flag (or the RAW capped length),
      // never the normalized length: a whitespace-heavy truncated record
      // normalizes shorter than the cap while still needing prefix matching
      // (same contract as storedResponseMatchesHistory).
      return (r.truncated || stored.length >= WTG_MAX_STORED_TEXT_LENGTH) &&
        [...historyTexts].some(t => t.startsWith(stored));
    });
  } else {
    keptRecords = records;
  }

  writeTurnData(keptRecords.concat([record]));
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

function getActionCount() {
  const value = typeof info !== 'undefined' && info && Number(info.actionCount);
  return Number.isFinite(value) ? value : (Array.isArray(history) ? history.length : 0);
}

function hasExplicitClockInitializationMarker() {
  const dataCard = storyCards.find(card => card.title === "WTG Data");
  return Boolean(dataCard && dataCard.entry && dataCard.entry.includes('[SETTIME_INITIALIZED]'));
}

function hasSavedOutputAnchors(turnData) {
  return Array.isArray(turnData) && turnData.some(record =>
    record.version >= 4 && normalizeActionText(record.responseText)
  );
}

function hasGeneratedOutputInHistory(turnData, historyItems) {
  const actions = Array.isArray(historyItems) ? historyItems : [];
  if (actions.some(action => String(action && action.type || '').toLowerCase() === 'continue')) {
    return true;
  }
  return Boolean(findLatestTurnDataEntryInHistory(turnData, actions));
}

function isOpeningGeneration(turnData = getTurnData()) {
  const actions = Array.isArray(history) ? history : [];
  const typedActions = actions.filter(action => (
    action && typeof action.type === 'string' && action.type.trim()
  ));

  if (hasGeneratedOutputInHistory(turnData, actions)) {
    return false;
  }

  if (typedActions.length > 0) {
    return true;
  }

  if (hasSavedOutputAnchors(turnData)) {
    return false;
  }

  return getActionCount() <= WTG_MAX_OPENING_ACTIONS;
}

function refreshOpeningClockForRetry(turnData = getTurnData()) {
  // An explicit config-card time IS the start time: there is nothing random
  // left to re-roll, so the opening refresh has no purpose. Without one the
  // opening is random by definition and each retry re-rolls.
  applySceneConfigCard();
  if (state.wtgSceneStartTime) return false;
  if (hasExplicitClockInitializationMarker()) return false;
  if (!isOpeningGeneration(turnData)) return false;

  state.startingDate = getSceneStartDate();
  state.startingTime = getSceneDefaultStartTime();
  state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  const current = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
  state.currentDate = current.currentDate;
  state.currentTime = current.currentTime;
  state.settimeInitialized = true;
  clearDynamicMinuteRemainder();
  // A fresh opening clock is authoritative evidence again.
  delete state.wtgClockUnverified;
  state.changed = true;
  return true;
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
 * Sleep-arc ledger (P15): a sleep declaration in the player's action text
 * opens a time frame {kind, durationMinutes, targetDeltaMinutes, baseMinutes};
 * the arc resolves when the story narrates waking (output hook). Magnitude
 * ("sleep for two hours") and target ("until tomorrow afternoon") are both
 * captured at declaration. Present tense only - past-form recounts
 * ("I slept two hours") are completed narration and flow through the normal
 * estimate. A waking input leaves the arc open for this turn's resolution.
 * @param {string} text - Raw player input
 */
function trackSleepArcDeclaration(text) {
  const raw = String(text || '');
  if (new RegExp(WTG_WAKE_VERB_SOURCE, 'i').test(raw)) {
    return; // waking input: the arc (if any) resolves at this turn's output
  }
  const lower = normalizeActionText(raw).toLowerCase();
  const sleepIntentSource = WTG_TIME_FRAMES.sleep.open;
  if (!new RegExp(sleepIntentSource, 'i').test(lower)) {
    delete state.wtgOpenTimeFrame;
    return;
  }

  // Say/do vetting for the declaration itself (P18): "Want to sleep for two
  // hours" is a desire, not a commitment - it does not open a frame. Each
  // sleep-verb occurrence is sentence-window vetted against the shared
  // exclusion list; the first committed occurrence opens the frame, and
  // intention markers in OTHER sentences do not veto it.
  const scanRegex = new RegExp(sleepIntentSource, 'gi');
  let committedIndex = -1;
  let verbMatch;
  while ((verbMatch = scanRegex.exec(lower)) !== null) {
    const window = sentenceScopedWindow(lower, verbMatch.index, verbMatch[0].length);
    if (!WTG_SAY_DO_EXCLUSION_REGEX.test(window)) {
      committedIndex = verbMatch.index;
      break;
    }
  }
  if (committedIndex === -1) {
    delete state.wtgOpenTimeFrame;
    return;
  }

  let durationMinutes = null;
  const durationRegex = new RegExp(`\\b(${WTG_AMOUNT_WORDS_SOURCE})\\s*(?:of\\s+)?(?:an?\\s+)?(minutes?|mins?|hours?|hrs?|days?|weeks?)\\b`, 'i');
  const durationMatch = lower.match(durationRegex);
  if (durationMatch) {
    const amount = parseDurationAmount(durationMatch[1]);
    const unitMinutes = WTG_DURATION_UNIT_MINUTES[durationMatch[2].toLowerCase()];
    if (amount && unitMinutes) durationMinutes = Math.round(amount * unitMinutes);
  }

  let targetDeltaMinutes = null;
  const targetMatch = lower.match(/\b(?:until|till|to)\s+(?:the\s+)?(?:(tomorrow|next|following)\s+)?(morning|noon|midday|afternoon|evening|dusk|sunset|night|dawn|sunrise|midnight)\b/i);
  const now = state.currentTime && state.currentTime !== 'Unknown' ? parseClockTime(state.currentTime) : null;
  if (targetMatch && now) {
    const anchor = WTG_PHASE_CLOCK_ANCHORS[targetMatch[2].toLowerCase()];
    if (anchor != null) {
      const dayQualified = /tomorrow|next|following/i.test(targetMatch[1] || '');
      const nowMin = now.hour * 60 + now.min;
      let delta = anchor - nowMin;
      if (dayQualified) delta = 1440 - nowMin + anchor;
      else if (delta <= 0) delta += 1440;
      targetDeltaMinutes = delta;
    }
  }

  state.wtgOpenTimeFrame = {
    kind: 'sleep',
    durationMinutes,
    targetDeltaMinutes,
    baseMinutes: Math.round(turnTimeToApproxSeconds(state.turnTime) / 60)
  };
  state.wtgSleepArcFresh = true;
}

/**
 * Fast rewind/retry pruning driven by info.actionCount, the authoritative
 * position signal the host maintains. Record actionCount values are compared
 * against the current count:
 *   - records from a discarded future (count > current) are dropped;
 *   - the record with count === current is dropped on retry (the host reuses
 *     the same position for a new generation).
 * Retry is only recognized when the input hook ran this cycle: retry re-fires
 * input, but Continue generations do not — pruning on a bare count match would
 * discard the advance a same-turn command (e.g. [sleep]) had already applied.
 * Returns true when any record was removed, so callers know the turn log and
 * the clock need realignment. Records without an actionCount (legacy v3) are
 * left untouched here — text matching remains their fallback path.
 * @param {Array} turnData - Current turn data records
 * @param {boolean} inputRanThisCycle - True when the input hook fired this cycle
 * @returns {boolean} True if the turn log was pruned
 */
function pruneTurnDataByActionCount(turnData, inputRanThisCycle) {
  if (typeof info === 'undefined' || !info || !Number.isInteger(info.actionCount)) {
    return false;
  }
  if (info.actionCount <= 0) return false;

  const currentCount = info.actionCount;
  const lastCountedIndex = turnData.reduce((acc, record, i) => (
    record.actionCount !== null ? i : acc
  ), -1);

  // A surviving count === current record means the host position was already
  // reflected in the log; treat it as retry evidence only when the input hook
  // ran this cycle and the log ends exactly at the current position.
  const retrySuspected = Boolean(inputRanThisCycle) &&
    lastCountedIndex >= 0 &&
    turnData[lastCountedIndex].actionCount === currentCount &&
    lastCountedIndex === turnData.length - 1;

  const cutoff = retrySuspected ? currentCount - 1 : currentCount;
  const keptRecords = turnData.filter(record => (
    record.actionCount === null || record.actionCount <= cutoff
  ));

  if (keptRecords.length === turnData.length) return false;

  writeTurnData(keptRecords);
  return true;
}

/**
 * Finds the most recent persisted AI output that is still present in history.
 * Fallback path for sessions whose records carry no actionCount (legacy v3)
 * and for host environments where info.actionCount is unavailable.
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
      if (!storedResponseMatchesHistory(responseText, turnData[i].truncated, historyTexts[historyIndex])) continue;

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
          !storedResponseMatchesHistory(previousResponse, turnData[recordIndex].truncated, historyTexts[previousHistoryIndex])
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
 * Skipped while the clock is unverified: surviving records are the recovery
 * evidence, and the post-rewind turn time may still move back up.
 * @param {Object} currentTT - Current turn time object
 */
function cleanupWTGDataCardByTimestamp(currentTT, records = getTurnData()) {
  if (state.wtgClockUnverified) return;
  if (records.length === 0) return;

  const keptRecords = records.filter(record => {
    const entryTT = parseTurnTime(record.timestamp);
    return entryTT && compareTurnTime(entryTT, currentTT) <= 0;
  });

  writeTurnData(keptRecords);
}

/**
 * Cleans storycards with future timestamps
 * Skipped entirely while the clock is unverified: after a rewind landed before
 * the whole tracked span, every legitimately old stamp would look future-dated
 * and be mass-deleted. Evidence is preserved for clock re-establishment.
 * @param {string} currentDate - Current date in mm/dd/yyyy format
 * @param {string} currentTime - Current time in hh:mm AM/PM format
 */
function cleanupStoryCardsByTimestamp(currentDate, currentTime) {
  if (state.wtgClockUnverified) return;
  const currentDateTime = parseDateTime(currentDate, currentTime);
  if (!currentDateTime) return;

  // Iterate through storycards and remove future timestamps
  for (let i = storyCards.length - 1; i >= 0 && i >= storyCards.length - WTG_MAX_STORYCARDS_TO_PROCESS; i--) {
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
    // Negative diffs take the pure-seconds path (days-only approximation,
    // months collapsed at 30d/month), intentionally asymmetric with the
    // calendar-month positive path below. Live-clock callers reject negative
    // diffs (flashback guard in recoverUnverifiedClock), so this only feeds
    // short back-dated ranges; forward/backward round trips may drift by
    // days. Accepted approximation — do not "fix" without a design pass.
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
function getLastTimestampFromWTGData(records = getTurnData()) {
  for (let i = records.length - 1; i >= 0; i--) {
    const timestamp = records[i].timestamp;
    if (timestamp && timestamp.match(/-?\d+y\d+m\d+d\d+h\d+n\d+s/)) {
      return parseTurnTime(timestamp);
    }
  }

  return null;
}

/**
 * Scans story cards for the newest discovery timestamp line
 * (Discovered on / Met on / Visited date time).
 * @returns {{date: string, time: string, dt: Date}|null} Newest stamp, or null
 */
function getMaxCardStamp() {
  let best = null;
  const scanCount = Math.min(storyCards.length, WTG_MAX_STORYCARDS_TO_PROCESS);
  for (let i = 0; i < scanCount; i++) {
    const card = storyCards[i];
    if (!card.entry || isWTGInternalCard(card)) continue;
    const match = card.entry.match(WTG_STORYCARD_TIMESTAMP_REGEX);
    if (!match) continue;
    const dt = parseDateTime(match[2], match[3]);
    if (dt && (!best || dt > best.dt)) {
      best = {date: match[2], time: match[3], dt};
    }
  }
  return best;
}

/**
 * Raises the clock to the newest story-card discovery stamp — evidence the
 * story had reached at least that date. Only ever raises time, and refuses to
 * run while the clock is unverified (stamps may describe a discarded future).
 * The comparison baseline is derived from the live turnTime, NOT the displayed
 * clock: mid-hook (prune -> recover) the displayed date can still show the
 * pre-prune future, which would make every legitimate stamp look "already
 * passed" and permanently stall recovery.
 * @returns {boolean} True when the clock was raised
 */
function applyCardStampFloor() {
  if (state.wtgClockUnverified) return false;

  const stamp = getMaxCardStamp();
  if (!stamp) return false;

  const parsedStampDate = normalizeDateInput(stamp.date);
  const normalizedTime = normalizeTime(stamp.time);
  if (parsedStampDate.error || !normalizedTime) return false;

  const base = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
  const curDT = parseDateTime(base.currentDate, base.currentTime);
  if (curDT && stamp.dt <= curDT) return false;

  state.turnTime = getDateDiff(
    state.startingDate,
    state.startingTime,
    parsedStampDate.date,
    normalizedTime
  );
  state.currentDate = parsedStampDate.date;
  state.currentTime = normalizedTime;
  state.changed = true;
  return true;
}

/**
 * Re-establishes the clock from surviving evidence after a rewind landed
 * before the whole tracked span. Order mirrors WTG 3.0's [reset]:
 *   1. surviving turn-log anchor (newest timestamp),
 *   2. most recent date/time mention in retained history text,
 *   3. newest story-card discovery stamp (floor: only raises time).
 * Clears the unverified flag when any evidence re-establishes the clock.
 * @returns {boolean} True when the clock was re-established
 */
function recoverUnverifiedClock(records = getTurnData()) {
  if (!state.wtgClockUnverified) return false;

  // 1. Surviving anchor in the turn log.
  const anchorTT = getLastTimestampFromWTGData(records);
  if (anchorTT) {
    state.turnTime = anchorTT;
    const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
    state.currentDate = currentDate;
    state.currentTime = currentTime;
    delete state.wtgClockUnverified;
    state.changed = true;
    return true;
  }

  // 2. Most recent date/time mention in history text. Mentions before the
  //    starting date are flashbacks, not scene time: a negative turn time
  //    would clear the unverified flag and let cleanup destroy the very
  //    evidence recovery exists to protect. Reject and fall through.
  const histDate = getCurrentDateFromHistory('', true);
  const histTime = getCurrentTimeFromHistory('', true);
  if (histDate) {
    const parsedDate = normalizeDateInput(histDate);
    const normalizedTime = histTime ? normalizeTime(histTime) : state.startingTime;
    if (!parsedDate.error && normalizedTime && parseClockTime(normalizedTime)) {
      const diff = getDateDiff(state.startingDate, state.startingTime, parsedDate.date, normalizedTime);
      if (getTurnTimeSign(diff) !== -1) {
        state.turnTime = diff;
        state.currentDate = parsedDate.date;
        state.currentTime = normalizedTime;
        delete state.wtgClockUnverified;
        state.changed = true;
        return true;
      }
    }
  }

  // 3. Story-card stamp floor (only raises; refuses while unverified, so the
  //    flag is cleared first and re-set if nothing applies).
  delete state.wtgClockUnverified;
  const floored = applyCardStampFloor();
  if (!floored) {
    state.wtgClockUnverified = true;
  }
  return floored;
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
      dataCard.type = "System";
      dataCard.keys = "";
      dataCard.entry = "";
      dataCard.description = "System data for World Time Generator - Internal use only, do not include in context";
    }
  }
  if (dataCard) {
    dataCard.type = "System";
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
    // No keys: the card documents the clock and holds internal turn-time
    // data. Key-triggered activation would leak that ledger into the AI
    // context on common words like "time" or "clock" — the context injection
    // line is the only intended information channel. (Same call as WTG 3.0.)
    dateTimeCard.keys = "";
    dateTimeCard.description = "Commands:\n[settime mm/dd/yyyy time] - Set starting date and time\n[setcurrent mm/dd/yyyy [time]] or [setcurrent h:mm AM/PM] - Set current date/time without changing the start\n[advance N [minutes|hours|days|months|years] or combos like 1month 2days] - Advance time/date\n[sleep] or [sleep N hours] - Sleep using the current clock or an explicit duration\n[reset] - Reset to most recent mention in history\n\nThe AI may pace the scene with (sleep) or (advance N unit), subject to cooldowns.";
  }
  dateTimeCard.type = "System";
  dateTimeCard.keys = "";
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
    existingDateTimeCard.type = "System";
  }

  // Scene config card must be read before any default clock is established.
  applySceneConfigCard();

  const parsedStartDate = state.startingDate
    ? normalizeDateInput(state.startingDate)
    : {error: true};
  const validStartTime = state.startingTime && parseClockTime(state.startingTime);

  if (parsedStartDate.error || !validStartTime) {
    if (recoverClockStateFromDateTimeCard()) return;

    state.startingDate = getSceneStartDate();
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
  const weekday = state.currentDate && state.currentDate !== 'Unknown' ? getDayOfWeek(state.currentDate) : null;
  const weekdaySuffix = weekday ? ` ${weekday}` : '';
  let entry = `Current date: ${state.currentDate || 'Unknown'}${weekdaySuffix}\nCurrent time: ${state.currentTime || 'Unknown'}\nStarting date: ${state.startingDate || 'Unknown'}\nStarting time: ${state.startingTime || 'Unknown'}\nTurn time: ${ttForm}`;
  dateTimeCard.entry = entry;
  updateWTGDebugCard();
}

function getWTGDebugCard(createIfMissing = true) {
  let debugCard = storyCards.find(card => card.title === "WTG Debug");
  if (!debugCard && createIfMissing) {
    addStoryCard("WTG Debug");
    debugCard = storyCards[storyCards.length - 1];
    debugCard.type = "System";
    debugCard.keys = "";
    debugCard.description = "WTG debug information. Empty keys keep this card out of AI context.";
  }
  if (debugCard) {
    debugCard.type = "System";
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
    || card.title === "WTG Cooldowns"
    || card.title === WTG_SCENE_CONFIG_CARD_TITLE;
}

function updateWTGDebugCard() {
  if (!getWTGBooleanSetting("Debug Mode")) {
    const existingCard = getWTGDebugCard(false);
    if (existingCard) existingCard.entry = "";
    // Release debug telemetry so a mode toggle doesn't leave stale state keys.
    delete state.wtgSimilarity;
    delete state.wtgLastDynamicEstimate;
    return;
  }

  const debugCard = getWTGDebugCard(true);
  if (state.wtgClockUnverified) {
    debugCard.entry = "Clock unverified after deep rewind.\nTimestamp cleanup paused. Use [settime]/[setcurrent]/[advance] or let the story re-establish time to recover.";
    return;
  }
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

    const escapedKey = escapeRegexLiteral(key);
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

  const scanCount = Math.min(storyCards.length, WTG_MAX_STORYCARDS_TO_PROCESS);
  for (let i = 0; i < scanCount; i++) {
    const card = storyCards[i];

    // Skip system cards
    if (isWTGInternalCard(card)) {
      continue;
    }

    if (card.entry && (card.entry.includes("Discovered on") || card.entry.includes("Met on") || card.entry.includes("Visited"))) {
      if (card.entry.includes("Unknown")) {
        // Replace placeholder timestamp with new timestamp
        card.entry = card.entry.replace(/(Discovered on|Met on|Visited) \d{1,2}\/\d{1,2}\/\d{4}[ \t]+Unknown/, `$1 ${timestamp}`);
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
    settingsCard.type = "System";
    settingsCard.keys = ""; // No keys to avoid entering AI context
    settingsCard.description = "World Time Generator Settings - Edit the values below to configure the system.";
    settingsCard.entry = `Time Duration Multiplier: 1.0
Explicit Duration Cap: ${WTG_DYNAMIC_MAX_EXPLICIT_MINUTES}
Text Characters per Turn: ${WTG_DEFAULT_TEXT_CHARS_PER_TURN}
Number of Turns per Hour: ${WTG_DEFAULT_TURNS_PER_HOUR}
AI Time Commands: true
Debug Mode: false
WTG Disabled: false`;
  } else {
    settingsCard.type = "System";
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
  if (!/^\s*Explicit Duration Cap:\s*\d+(?:\.\d+)?\s*$/im.test(settingsCard.entry)) {
    settingsCard.entry = settingsCard.entry.trim()
      ? `${settingsCard.entry.trim()}\nExplicit Duration Cap: ${WTG_DYNAMIC_MAX_EXPLICIT_MINUTES}`
      : `Explicit Duration Cap: ${WTG_DYNAMIC_MAX_EXPLICIT_MINUTES}`;
  }
  if (!/^\s*AI Time Commands:\s*(true|false)\s*$/im.test(settingsCard.entry)) {
    settingsCard.entry = settingsCard.entry.trim()
      ? `${settingsCard.entry.trim()}\nAI Time Commands: true`
      : `AI Time Commands: true`;
  }
  if (!/^\s*Text Characters per Turn:\s*\d+(?:\.\d+)?\s*$/im.test(settingsCard.entry)) {
    settingsCard.entry = settingsCard.entry.trim()
      ? `${settingsCard.entry.trim()}\nText Characters per Turn: ${WTG_DEFAULT_TEXT_CHARS_PER_TURN}`
      : `Text Characters per Turn: ${WTG_DEFAULT_TEXT_CHARS_PER_TURN}`;
  }
  if (!/^\s*Number of Turns per Hour:\s*\d+(?:\.\d+)?\s*$/im.test(settingsCard.entry)) {
    settingsCard.entry = settingsCard.entry.trim()
      ? `${settingsCard.entry.trim()}\nNumber of Turns per Hour: ${WTG_DEFAULT_TURNS_PER_HOUR}`
      : `Number of Turns per Hour: ${WTG_DEFAULT_TURNS_PER_HOUR}`;
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
 * Returns true when the AI may issue (sleep)/(advance) pacing commands.
 * @returns {boolean}
 */
function areAITimeCommandsEnabled() {
  return getWTGBooleanSetting("AI Time Commands");
}

/**
 * Returns true while the story is in its opening turn(s): the clock has just
 * been established and no real baseline exists yet. Opening text loves to
 * narrate nights passing and mornings arriving, and the AI loves to fire
 * (sleep) right away — both would jump the clock hours before the scene
 * actually settles. During the opening window:
 *   - AI time commands are suppressed (recognized, stripped, not executed);
 *   - automatic time estimation is skipped entirely: the opening text
 *     establishes the scene, time has not started moving yet.
 * The window is the first player action (actionCount <= 1, same condition as
 * the storycard auto-[settime] scan) while no turn time has accumulated.
 * @returns {boolean}
 */
function isOpeningTimeGuardActive() {
  if (typeof info === 'undefined' || !info || !Number.isInteger(info.actionCount)) {
    return false;
  }
  if (info.actionCount > 1) return false;

  const tt = normalizeTurnTimeSign(state.turnTime);
  return !hasTurnTimeMagnitude(tt);
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

function getExplicitDurationCapMinutes() {
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return WTG_DYNAMIC_MAX_EXPLICIT_MINUTES;

  const regex = /^\s*Explicit Duration Cap:\s*((?:\d+(?:\.\d*)?)|(?:\.\d+))\s*$/im;
  const match = settingsCard.entry.match(regex);
  if (match) {
    const value = Math.floor(parseFloat(match[1]));
    return Number.isFinite(value) && value > 0 ? value : WTG_DYNAMIC_MAX_EXPLICIT_MINUTES;
  }
  return WTG_DYNAMIC_MAX_EXPLICIT_MINUTES;
}

/**
 * Derives characters-per-minute from the Text Characters per Turn and
 * Number of Turns per Hour settings — the same two-knob calibration model as
 * WTG 3.0 (600 chars × 30 turns/hour → 300 chars per in-game minute).
 * @returns {number} Story characters per in-game minute of dynamic time
 */
function getCharsPerMinute() {
  const defaultCPM = (WTG_DEFAULT_TEXT_CHARS_PER_TURN * WTG_DEFAULT_TURNS_PER_HOUR) / 60;
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return defaultCPM;

  const numberPattern = '((?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))';
  const charsMatch = settingsCard.entry.match(new RegExp(`^\\s*Text Characters per Turn:\\s*${numberPattern}\\s*$`, 'im'));
  const turnsMatch = settingsCard.entry.match(new RegExp(`^\\s*Number of Turns per Hour:\\s*${numberPattern}\\s*$`, 'im'));
  const chars = charsMatch ? parseFloat(charsMatch[1]) : WTG_DEFAULT_TEXT_CHARS_PER_TURN;
  const turns = turnsMatch ? parseFloat(turnsMatch[1]) : WTG_DEFAULT_TURNS_PER_HOUR;
  if (!Number.isFinite(chars) || chars <= 0 || !Number.isFinite(turns) || turns <= 0) return defaultCPM;
  return (chars * turns) / 60;
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
  // Time-ledger semantics (WTG 3.0 flow model): the full raw estimate
  // accumulates across turns — no per-turn truncation, so long turns bank
  // their excess instead of discarding it. Category factors still scale the
  // raw (a memory turn still sits at zero); only the discarding is gone.
  const totalMinutes = previousRemainder + rawMinutes;
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

// ============================================================================
// AI COMMAND COOLDOWNS
// ============================================================================
// Sleep/advance commands issued by the AI (in parentheses) are allowed only
// when the in-game clock has passed the cooldown threshold recorded at the
// last AI command of that kind. Thresholds live in state as turn-time strings
// so they rewind naturally with the clock.

/**
 * Returns true when the [sleep] command is still on cooldown, i.e. the
 * current turn time has not yet reached the stored wake threshold.
 * @returns {boolean}
 */
function isSleepCooldownActive() {
  const threshold = state.wtgSleepCooldownUntil;
  if (!threshold) return false;
  const available = parseTurnTime(threshold);
  return available ? compareTurnTime(state.turnTime, available) < 0 : false;
}

/**
 * Returns true when the advance command is still on cooldown.
 * @returns {boolean}
 */
function isAdvanceCooldownActive() {
  const threshold = state.wtgAdvanceCooldownUntil;
  if (!threshold) return false;
  const available = parseTurnTime(threshold);
  return available ? compareTurnTime(state.turnTime, available) < 0 : false;
}

/**
 * Sets the sleep cooldown to expire after the given turn-time duration.
 * @param {Object} duration - {hours?, minutes?...} added to current turn time
 */
function setSleepCooldown(duration) {
  state.wtgSleepCooldownUntil = formatTurnTime(addToTurnTime(state.turnTime, duration));
}

/**
 * Sets the advance cooldown to expire after the given turn-time duration.
 * @param {Object} duration - {hours?, minutes?...} added to current turn time
 */
function setAdvanceCooldown(duration) {
  state.wtgAdvanceCooldownUntil = formatTurnTime(addToTurnTime(state.turnTime, duration));
}

/**
 * Clears cooldowns whose thresholds now lie in the future relative to the
 * given turn time. Called after any time rewind: a threshold set by the
 * erased branch must not stay stuck active forever.
 * @param {Object} newTT - The rewound turn time object
 */
function clearFutureCooldowns(newTT) {
  for (const key of ['wtgSleepCooldownUntil', 'wtgAdvanceCooldownUntil']) {
    const threshold = state[key];
    if (!threshold) continue;
    const thresholdTT = parseTurnTime(threshold);
    if (thresholdTT && compareTurnTime(thresholdTT, newTT) > 0) {
      delete state[key];
    }
  }
}

function hasQuotedSpeech(text) {
  return /"[^"]+"/.test(String(text || ''));
}

function countSpeakerLines(text) {
  const internalLabels = /^(current date|current time|starting date|starting time|turn time|time duration multiplier|debug mode|wtg disabled|source|category|text length|scene factor|similarity factor|time multiplier|raw minutes|previous remainder|stored remainder|explicit minutes|similarity|last dynamic time estimate|\[warning)$/i;
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
  // Recollection veto: past-speech narration WITHOUT any quoted dialogue is
  // remembered events, not a live scene. Attribution inside quotes ("she
  // said") is live dialogue and must not trip this veto — otherwise the most
  // common chat turns lose the dialogue bucket and its one-minute floor and
  // fall into the floorless neutral bucket.
  if (!hasQuotedSpeech(rawText) && hasPastSpeechMemoryContext(rawText, actionType)) return false;

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
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
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
  if (valueMap[normalized] != null) {
    return valueMap[normalized];
  }
  // Compound tens-ones: "forty-five", "twenty five". Without this the regex
  // would match the trailing ones-word alone ("forty-five minutes" -> 5),
  // a silent 9x under-count.
  const compound = normalized.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s](one|two|three|four|five|six|seven|eight|nine))?$/);
  if (compound) {
    return valueMap[compound[1]] + (compound[2] ? valueMap[compound[2]] : 0);
  }
  return null;
}

// Shared parsing sources for the duration/phase machinery (explicit-duration
// extractor, sleep-arc ledger): one definition, multiple consumers.
const WTG_COMPOUND_TENS_SOURCE = '(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?';
const WTG_AMOUNT_WORDS_SOURCE = `a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter|couple|few|several|${WTG_COMPOUND_TENS_SOURCE}|\\d+(?:\\.\\d+)?`;
const WTG_DURATION_UNIT_MINUTES = { minute: 1, minutes: 1, min: 1, mins: 1, hour: 60, hours: 60, hr: 60, hrs: 60, day: 1440, days: 1440, week: 10080, weeks: 10080 };
const WTG_WAKE_VERB_SOURCE = '\\b(?:wakes?|waking|woke|woken|awaken(?:s|ed|ing)?|awake|stirs?|stirring)\\b';
const WTG_PHASE_CLOCK_ANCHORS = { morning: 480, noon: 720, midday: 720, afternoon: 840, evening: 1080, dusk: 1200, sunset: 1200, night: 1320, dawn: 360, sunrise: 360, midnight: 0 };
// Say/do exclusion source: markers that mark a time mention as memory,
// hearsay, hypothetical, or mere intention. Shared by the explicit-duration
// extractor and the sleep-arc declaration detector so both apply the same
// 空说/实做 (words vs deeds) standard.
const WTG_SAY_DO_EXCLUSION_SOURCE = 'ago|had\\s|lasted|lasts|would|could|should|might|used to|remember(?:ed|s)?|recall(?:ed|s)?|dream(?:ed|t)|envision(?:ed|s)?|imagined?|foretold|prophecy|prophesied|once|previously|earlier|said|asked|replied|answered|told|spoke|spoken|talked|whispered|muttered|shouted|argued|explained|mentioned|recounted|narrated|according to|let\'s|let us|we\'ll|we will|we can|we must|we need to|going to|gonna|about to|supposed to|meant to|won\'t|\\w+\'ll\\b|if|maybe|suggest(?:s|ed|ing)?|propos(?:es|ed|ing)?|plan(?:s|ned|ning)?|intend(?:s|ed|ing)?|agree(?:s|d)? to|decide(?:s|d)? to|vow(?:s|ed)? to|promise(?:s|d)? to|volunteer(?:s|ed)? to|offer(?:s|ed)? to|hopes? to|wants? to|wishes? to';
const WTG_SAY_DO_EXCLUSION_REGEX = new RegExp('\\b(' + WTG_SAY_DO_EXCLUSION_SOURCE + ')\\b', 'i');
// Phase vocabulary, single home: every phase word's clock anchor lives here
// and every other structure (floor table, wake-arrival patterns) derives
// from it. Adding/renaming a phase happens in exactly one place.
// Transition-floor table (P2/P7 vocabulary, single home). Day-phase entries
// ({target, fallback}) compute the gap from the current clock to the narrated
// phase, falling back to the flat anchor; plain-number entries apply as flat
// sleep-scale / next-day anchors. Targets bypass the Explicit Duration Cap
// (self-limiting landing points); magnitude claims do not.
const WTG_TIME_FLOORS = {
  'until noon': { target: WTG_PHASE_CLOCK_ANCHORS.noon, fallback: 360 },
  'past noon': { target: WTG_PHASE_CLOCK_ANCHORS.noon, fallback: 360 },
  'through the morning': { target: WTG_PHASE_CLOCK_ANCHORS.noon, fallback: 480 },
  'all morning': { target: WTG_PHASE_CLOCK_ANCHORS.noon, fallback: 480 },
  'into the afternoon': { target: WTG_PHASE_CLOCK_ANCHORS.afternoon, fallback: 360 },
  'through the afternoon': { target: WTG_PHASE_CLOCK_ANCHORS.evening, fallback: 360 },
  'all afternoon': { target: WTG_PHASE_CLOCK_ANCHORS.evening, fallback: 360 },
  'until evening': { target: WTG_PHASE_CLOCK_ANCHORS.evening, fallback: 360 },
  'until nightfall': { target: WTG_PHASE_CLOCK_ANCHORS.evening, fallback: 360 },
  'through the day': { target: WTG_PHASE_CLOCK_ANCHORS.evening, fallback: 360 },
  'all day': { target: WTG_PHASE_CLOCK_ANCHORS.evening, fallback: 360 },
  'into the evening': { target: WTG_PHASE_CLOCK_ANCHORS.dusk, fallback: 360 },
  'overnight': 480,
  'through the night': 480,
  'all night': 480,
  'until morning': 480,
  'into the morning': 480,
  'tomorrow': 1440,
  'next morning': 1440,
  'next day': 1440,
  'the following day': 1440
};
const WTG_TIME_FLOOR_SOURCE = Object.keys(WTG_TIME_FLOORS).map(escapeRegexLiteral).join('|');
// Open time-frame classes (P15 general form): each kind declares the verb
// vocabulary that opens (player announcement) and closes (narrated
// completion) its arc. The ledger and the completion detectors are
// kind-agnostic; adding a new arc kind is a table row, not new plumbing.
const WTG_TIME_FRAMES = {
  sleep: {
    open: '\\b(?:sleep|sleeps|sleeping|naps?|napping|rest|rests|resting|turn in|turns in|turning in|go to bed|goes to bed|going to bed|bed down|hit the hay|hit the sack)\\b',
    close: WTG_WAKE_VERB_SOURCE
  }
};

/**
 * Isolates the sentence containing a match: ±60 characters of context cut
 * down to the surrounding sentence boundaries on both sides, so exclusion
 * markers in neighbouring sentences neither poison the match nor get
 * poisoned by it.
 * @param {string} lower - Full normalized lowercase text
 * @param {number} matchIndex - Match start index in lower
 * @param {number} matchLength - Match length
 * @returns {string} The vetting window around the match
 */
function sentenceScopedWindow(lower, matchIndex, matchLength) {
  const ctxStart = Math.max(0, matchIndex - 60);
  const ctxEnd = Math.min(lower.length, matchIndex + matchLength + 60);
  let window = lower.slice(ctxStart, ctxEnd);
  let matchOffset = matchIndex - ctxStart;
  let matchEndOffset = matchOffset + matchLength;

  const frontCut = Math.max(
    window.lastIndexOf('. ', matchOffset),
    window.lastIndexOf('! ', matchOffset),
    window.lastIndexOf('? ', matchOffset)
  );
  if (frontCut > 0) {
    window = window.slice(frontCut + 1);
    matchOffset = Math.max(0, matchOffset - (frontCut + 1));
    matchEndOffset = Math.max(0, matchEndOffset - (frontCut + 1));
  }

  const backCut = [window.indexOf('. ', matchEndOffset), window.indexOf('! ', matchEndOffset), window.indexOf('? ', matchEndOffset)]
    .filter(idx => idx !== -1)
    .sort((a, b) => a - b)[0];
  if (backCut !== undefined) {
    window = window.slice(0, backCut);
  }

  return window;
}

function extractExplicitDurationMinutes(turnText) {
  const lower = normalizeActionText(turnText).toLowerCase();
  if (!lower) return 0;

  // Say/do gating, part 1 (P13): anything inside double-quoted spans is
  // character speech - words, never deeds. "You say, 'I sleep until tomorrow
  // afternoon'" announces a plan; it does not walk the clock there.
  // Duration matches and floor phrases inside quotes are skipped wholesale.
  const quotedSpans = [];
  const quoteSpanRegex = /"[^"]*"/g;
  let quoteSpanMatch;
  while ((quoteSpanMatch = quoteSpanRegex.exec(lower)) !== null) {
    quotedSpans.push([quoteSpanMatch.index, quoteSpanMatch.index + quoteSpanMatch[0].length]);
  }
  const insideQuotes = (index) => quotedSpans.some(span => index >= span[0] && index < span[1]);

  const unitMinutes = WTG_DURATION_UNIT_MINUTES;
  // Compound tens-ones are matched as one token so "forty-five minutes" can
  // never degrade into its trailing "five minutes" (a silent 45 -> 5 error).
  const amountWords = WTG_AMOUNT_WORDS_SOURCE;
  const durationRegex = new RegExp(`\\b(${amountWords})\\s*(?:of\\s+)?(?:an?\\s+)?(minutes?|mins?|hours?|hrs?|days?|weeks?)\\b`, 'gi');
  // Matches that refer to past events, hypotheticals, reported speech, or
  // MERE INTENTION ("Let's sit here until noon.", "We'll wait twenty
  // minutes") describe other times or un-started plans, not elapsed scene
  // time — skipping them keeps the clock from absorbing a remembered battle,
  // a forecast travel time, a character's hearsay, or a plan nobody has
  // lived through yet. Verb list is the past-tense counterpart of
  // hasPastSpeechReference's speech verbs. Accepted trade-off: narration
  // like "For two hours, no one spoke" is under-counted, and same-sentence
  // decision+passage ("He decided to wait, and twenty minutes went by")
  // is excluded with it.
  const pastOrHypotheticalRegex = WTG_SAY_DO_EXCLUSION_REGEX;
  let statedMinutes = 0;     // duration matches, bounded by Explicit Duration Cap
  let transitionMinutes = 0; // floor / wake-arrival targets (self-limiting)
  let match;

  while ((match = durationRegex.exec(lower)) !== null) {
    const amount = parseDurationAmount(match[1]);
    const unit = match[2].toLowerCase();
    if (!amount || !unitMinutes[unit]) continue;
    if (insideQuotes(match.index)) continue;

    // Window around this specific mention: past/hypothetical/intention
    // markers nearby disqualify the match (see sentenceScopedWindow).
    const window = sentenceScopedWindow(lower, match.index, match[0].length);

    if (pastOrHypotheticalRegex.test(window)) continue;

    statedMinutes += amount * unitMinutes[unit];
  }

  // The Explicit Duration Cap bounds magnitude claims ("three days") only.
  // Transition targets (floors, wake-arrivals) form a closed, say/do-vetted
  // phrase set whose landing point is self-limiting - they bypass the cap
  // and compete by max() below.
  statedMinutes = Math.round(clampNumber(statedMinutes, 0, getExplicitDurationCapMinutes()));

  // Scene-time transition floors: these phrases move the narration through a
  // phase of the day even without a stated duration. The vocabulary lives in
  // WTG_TIME_FLOORS (single home, derived from the phase anchors); every
  // occurrence goes through the same sentence-window and say/do vetting as a
  // duration match ("Let's sit here until noon." is a plan; "You sit there
  // until noon." is a fact). Day-phase entries compute the actual gap from
  // the current clock to the narrated phase; flat entries (sleep-scale /
  // next-day) apply as-is. Transition targets bypass the Explicit Duration
  // Cap (self-limiting landing points); magnitude claims do not.
  const floorRegex = new RegExp('\\b(' + WTG_TIME_FLOOR_SOURCE + ')\\b', 'gi');
  let floorMatch;
  while ((floorMatch = floorRegex.exec(lower)) !== null) {
    if (insideQuotes(floorMatch.index)) continue;
    const window = sentenceScopedWindow(lower, floorMatch.index, floorMatch[0].length);
    if (pastOrHypotheticalRegex.test(window)) continue;

    const entry = WTG_TIME_FLOORS[floorMatch[1].toLowerCase()];
    let floorValue;
    if (typeof entry === 'number') {
      floorValue = entry;
    } else {
      const now = state.currentTime && state.currentTime !== 'Unknown' ? parseClockTime(state.currentTime) : null;
      const delta = now ? entry.target - (now.hour * 60 + now.min) : null;
      floorValue = delta && delta > 0 ? delta : entry.fallback;
    }
    transitionMinutes = Math.max(transitionMinutes, floorValue);
  }

  // P14: wake-arrival floors. The canonical sleep-skip completion is a
  // waking narration ("You wake the next afternoon."); the verb is
  // load-bearing here - "in the evening" alone describes a state, while
  // "You wake in the evening." is an arrival. Arrival computes to the
  // narrated phase from the current clock: same-day phases only move
  // forward (waking "in the evening" at 9 PM moves nothing), day-qualified
  // forms ("the next afternoon", "tomorrow afternoon") always land on the
  // next day's phase. Quoted spans are excluded above; unknown clocks fall
  // back to flat anchors.
  const wakeArrivalRegex = new RegExp(WTG_TIME_FRAMES.sleep.close, 'gi');
  const phaseWordSource = Object.keys(WTG_PHASE_CLOCK_ANCHORS).join('|');
  const phaseArrivalSource = `\\b(?:(the next|next|the following|tomorrow)\\s+)?(${phaseWordSource})\\b`;
  const phaseArrivalRegex = new RegExp(phaseArrivalSource, 'gi');
  const phaseAnchors = WTG_PHASE_CLOCK_ANCHORS;
  let wakeMatch;
  while ((wakeMatch = wakeArrivalRegex.exec(lower)) !== null) {
    if (insideQuotes(wakeMatch.index)) continue;
    const window = sentenceScopedWindow(lower, wakeMatch.index, wakeMatch[0].length);
    if (pastOrHypotheticalRegex.test(window)) continue;

    let phaseMatch;
    const arrivalRegex = new RegExp(phaseArrivalSource, 'gi');
    let arrivalValue = null;
    while ((phaseMatch = arrivalRegex.exec(window)) !== null) {
      const dayQualified = /(the next|next|the following|tomorrow)/.test(phaseMatch[1] || '');
      const phaseKey = phaseMatch[2];
      const now = state.currentTime && state.currentTime !== 'Unknown' ? parseClockTime(state.currentTime) : null;
      if (phaseKey === 'day') {
        if (dayQualified) {
          arrivalValue = now ? 1440 - (now.hour * 60 + now.min) : 1440;
          break;
        }
        continue;
      }
      const anchor = phaseAnchors[phaseKey];
      if (anchor == null) continue;
      if (!now) {
        arrivalValue = 360;
        break;
      }
      const delta = anchor - (now.hour * 60 + now.min);
      if (delta < 0) continue; // phase already behind: no movement
      arrivalValue = dayQualified ? delta + 1440 : delta;
      break;
    }
    if (arrivalValue != null) {
      transitionMinutes = Math.max(transitionMinutes, arrivalValue);
    }
  }

  return Math.round(clampNumber(Math.max(statedMinutes, transitionMinutes), 0, 43200));
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
  // Opening turns skip this estimator entirely (see the estimate gate in the
  // output hook), so no opening-specific guard is needed here.
  const explicitMinutes = extractExplicitDurationMinutes(normalizedText);

  if (explicitMinutes > 0) {
    // The Explicit Duration Cap is applied inside the extractor to magnitude
    // claims only; transition targets arrive already resolved.
    const rawMinutes = explicitMinutes * multiplier;
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
    // Repeated/retried prose still earns time — just 15% less. (Was 0.7,
    // which made grinding loops crawl at a fraction of the flow rate.)
    similarityFactor = 0.85;
  } else if (similarityClamped < 0.1) {
    similarityFactor = 1.3;
  }

  const calculatedMinutes = (textLength / getCharsPerMinute())
    * sceneFactor
    * similarityFactor
    * multiplier;
  const rawMinutes = Math.max(minimumMinutes * multiplier, calculatedMinutes);
  const minutes = sceneFactor === 0
    ? 0
    : Math.floor(rawMinutes);

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

// ============================================================================
// AI-ISSUED TIME COMMANDS
// ============================================================================
// The AI may issue (sleep) or (advance N unit) in its output. Commands are
// executed against the clock like player commands, gated by in-game-time
// cooldowns, and always stripped from the visible narrative.

/**
 * Parses the argument tail of an AI advance command, e.g. " 2 hours" or
 * "1 month 2 days". Reuses parseAdvanceSpec so AI and player share one
 * grammar. Returns the same {add, summary} or {error} shape.
 * @param {string} argText - Raw argument tail inside the parentheses
 * @returns {Object} Parsed result from parseAdvanceSpec
 */
function parseAIAdvanceArgs(argText) {
  const raw = String(argText || '').trim();
  if (!raw) {
    return {error: '[AI advance requires an amount, e.g. (advance 30 minutes).]'};
  }
  return parseAdvanceSpec(raw);
}

/**
 * True when parseAIAdvanceArgs produced a usable, non-zero duration object.
 * Shared by the executor and the well-formedness probe so both treat the
 * same inputs as prose.
 * @param {Object} parsed - Result of parseAIAdvanceArgs
 * @returns {boolean}
 */
function isUsableAdvanceAdd(parsed) {
  if (!parsed || parsed.error || !parsed.add) return false;
  const add = parsed.add;
  return Boolean(add.years || add.months || add.days || add.hours || add.minutes);
}

/**
 * Finds AI-issued time commands in output text.
 * @param {string} text - Raw AI output
 * @returns {Array<{full: string, command: string, args: string}>} Match list
 */
function findAITimeCommands(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  const regex = new RegExp(WTG_AI_COMMAND_REGEX.source, 'gi');
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      full: match[0],
      command: match[1].toLowerCase(),
      args: String(match[2] || '').trim()
    });
  }
  return matches;
}

/**
 * Executes AI-issued time commands found in the output, subject to cooldowns.
 * Executed commands advance the clock and set their cooldown; suppressed ones
 * are recorded as skipped. Commands that fail to parse are NOT executed and
 * are NOT marked for removal — parenthesized prose like "(advance to the
 * next room)" stays in the narrative untouched.
 * When the AI Time Commands setting is off, nothing is executed and nothing
 * is stripped: parenthesized text is treated as pure narrative.
 * @param {string} text - Raw AI output
 * @returns {{executed: number, skipped: number, removable: string[]}} Counts
 *   plus the exact command texts to strip from the narrative
 */
function executeAITimeCommands(text) {
  const result = {executed: 0, skipped: 0, removable: [], applied: []};
  if (!areAITimeCommandsEnabled()) return result;

  const commands = findAITimeCommands(text);

  // Opening-turn guard runs first: same suppression shape as unverified
  // (recognized commands stripped, not executed), so the AI cannot jump the
  // clock before the scene settles. Unlike the unverified gate, this one
  // expires naturally as soon as real turn time exists past the opening.
  const openingGuard = isOpeningTimeGuardActive();
  if (openingGuard || state.wtgClockUnverified) {
    for (const cmd of commands) {
      if (isWellFormedAICommand(cmd)) {
        result.removable.push(cmd.full);
        result.skipped++;
      }
    }
    return result;
  }

  // P17: frame-scoped pacing authority. While an open time-frame with a
  // declared magnitude/target is live, each AI command is clamped to the
  // remaining budget - the story declared how long this arc lasts, and the
  // model's improvisation stops there. An exhausted frame suppresses further
  // pacing until the arc resolves (waking narration) or the player takes
  // over. Commands remain unclamped when no frame is open.
  const frameCandidate = state.wtgOpenTimeFrame || null;
  const frameDeclared = frameCandidate
    ? (frameCandidate.durationMinutes != null ? frameCandidate.durationMinutes : frameCandidate.targetDeltaMinutes)
    : null;
  const frame = frameDeclared != null ? frameCandidate : null;
  let frameRemaining = null;
  if (frame) {
    frameRemaining = Math.max(0, frameDeclared - (turnTimeToApproxSeconds(state.turnTime) / 60 - frame.baseMinutes));
  }
  let largeSkipUsed = false;
  for (const cmd of commands) {
    if (cmd.command === 'sleep') {
      // Validate arguments BEFORE the cooldown gate: unparseable arguments
      // are narrative prose and must survive untouched even while the
      // cooldown is active (same ordering rule as the advance branch).
      let explicitAdd = null;
      if (cmd.args) {
        const parsed = parseAIAdvanceArgs(cmd.args);
        if (!isUsableAdvanceAdd(parsed)) continue;
        explicitAdd = parsed.add;
      }
      if (isSleepCooldownActive()) {
        result.skipped++;
        result.removable.push(cmd.full);
        continue;
      }
      // Bare (sleep) shares the player's [sleep] time-of-day model; an
      // explicit (sleep 9 hours) applies the requested duration directly.
      let add = explicitAdd || getSleepDuration(state.currentTime);
      if (frameRemaining != null) {
        if (frameRemaining <= 0) {
          result.skipped++;
          result.removable.push(cmd.full);
          continue;
        }
        const wanted = turnTimeToApproxSeconds(add) / 60;
        if (wanted > frameRemaining) add = {minutes: Math.round(frameRemaining)};
      }
      state.turnTime = addToTurnTime(state.turnTime, add);
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      setSleepCooldown(WTG_AI_SLEEP_COOLDOWN);
      result.executed++;
      result.removable.push(cmd.full);
      result.applied.push(cmd.full + ' -> ' + Math.round(turnTimeToApproxSeconds(add) / 60) + 'min');
      if (frameRemaining != null) {
        const applied = turnTimeToApproxSeconds(add) / 60;
        frame.appliedMinutes = (frame.appliedMinutes || 0) + applied;
        frameRemaining -= applied;
      }
    } else if (cmd.command === 'advance') {
      // Validate BEFORE the cooldown gate: prose lookalikes such as
      // "(advance to the next room)" must never be stripped just because
      // the cooldown happens to be active.
      const parsed = parseAIAdvanceArgs(cmd.args);
      if (!isUsableAdvanceAdd(parsed)) {
        // Unparseable argument: almost certainly narrative prose, not a
        // command. Leave the text alone.
        continue;
      }
      let add = parsed.add;
      if (frameRemaining != null) {
        if (frameRemaining <= 0) {
          result.skipped++;
          result.removable.push(cmd.full);
          continue;
        }
        const wanted = turnTimeToApproxSeconds(add) / 60;
        if (wanted > frameRemaining) add = {minutes: Math.round(frameRemaining)};
      }
      // Large-skip guard: the 5-minute cooldown cannot chain-break multi-day
      // jumps (each jump leaves the threshold far behind), so at most ONE
      // multi-day advance is honored per output; further large advances are
      // suppressed and stripped like cooldown-skipped ones.
      const isLargeSkip = (add.days || 0) >= 1 || (add.months || 0) >= 1 || (add.years || 0) >= 1;
      if (isLargeSkip && largeSkipUsed) {
        result.skipped++;
        result.removable.push(cmd.full);
        continue;
      }
      if (isAdvanceCooldownActive()) {
        result.skipped++;
        result.removable.push(cmd.full);
        continue;
      }
      const current = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      const advanced = advanceDateTimeValue(current.currentDate, current.currentTime, add);
      if (!advanced) {
        result.skipped++;
        result.removable.push(cmd.full);
        continue;
      }
      state.currentDate = advanced.date;
      state.currentTime = advanced.time;
      state.turnTime = getDateDiff(state.startingDate, state.startingTime, state.currentDate, state.currentTime);
      setAdvanceCooldown(WTG_AI_ADVANCE_COOLDOWN);
      result.executed++;
      result.removable.push(cmd.full);
      result.applied.push(cmd.full + ' -> ' + Math.round(turnTimeToApproxSeconds(add) / 60) + 'min');
      if (isLargeSkip) largeSkipUsed = true;
      if (frameRemaining != null) {
        const applied = turnTimeToApproxSeconds(add) / 60;
        frame.appliedMinutes = (frame.appliedMinutes || 0) + applied;
        frameRemaining -= applied;
      }
    }
  }

  if (result.executed > 0) {
    clearDynamicMinuteRemainder();
    state.changed = true;
  }
  return result;
}

/**
 * Checks whether an AI command's arguments are well-formed time-command
 * syntax. Used to distinguish recognizable pacing commands (strip from the
 * narrative even when suppressed) from parenthesized prose (keep). Must stay
 * consistent with the executor's prose rules via isUsableAdvanceAdd.
 * @param {Object} cmd - Command from findAITimeCommands
 * @returns {boolean} True when the command syntax is valid
 */
function isWellFormedAICommand(cmd) {
  if (cmd.command === 'sleep') {
    // Bare (sleep) is always well-formed; (sleep N unit) must parse to a
    // usable duration, otherwise it is narrative prose.
    if (!cmd.args) return true;
    return isUsableAdvanceAdd(parseAIAdvanceArgs(cmd.args));
  }
  if (cmd.command === 'advance') {
    return isUsableAdvanceAdd(parseAIAdvanceArgs(cmd.args));
  }
  return false;
}

/**
 * Removes specific AI time commands from the visible narrative. Only the
 * commands the executor recognized (executed or suppressed) are removed;
 * prose lookalikes survive.
 * @param {string} text - Output text possibly containing (sleep)/(advance ...)
 * @param {string[]} removable - Exact command texts to strip
 * @returns {string} Cleaned text
 */
function stripAITimeCommands(text, removable = []) {
  if (!text || typeof text !== 'string' || removable.length === 0) return text;
  let cleaned = text;
  for (const cmd of removable) {
    cleaned = cleaned.replace(new RegExp(escapeRegexLiteral(cmd), 'g'), '');
  }
  return cleaned.replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n');
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
  cleaned = cleaned.replace(/^\s*Do not (?:recreate or reference any system commands|write player commands in \[square brackets\]).*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*(?:You may (?:pace the scene with|control pacing by writing)|Scene pacing is resting for now).*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Keep scene chronology consistent with the hidden current date\/time below\..*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Do not expose system metadata.*(?:\n|$)/gim, '');
  cleaned = cleaned.replace(/^\s*Only mention exact time when the narrative naturally requires it\..*(?:\n|$)/gim, '');

  // Remove internal tags and explicit system command leakage.
  cleaned = cleaned.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, '');
  cleaned = cleaned.replace(/\[(?:settime|setcurrent|advance)(?:\s+[^\]]*)?\]/gi, '');
  cleaned = cleaned.replace(/\[(?:reset|sleep|time)(?:\s+[^\]]*)?\]/gi, '');
  // Bare-line pacing attempts (model dropped the parentheses): they never
  // execute, so clean them from display like bracket echoes. Duration-bearing
  // forms only - a bare "sleep" could be a narrative beat.
  cleaned = cleaned.replace(/^[ \t]*(?:advance|sleep)\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?|weeks?)[ \t]*$/gim, '');
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

  // If a deep rewind left the clock unverified, re-establish it from surviving
  // evidence before any command operates on the base time.
  recoverUnverifiedClock();

  state.changed = state.changed || false;

  let modifiedText = text;
  let messages = [];

  clearPendingPlayerInput();
  delete state.wtgSkipNextAutomaticTiming;

  // Mark that the input hook ran this cycle: retry (which re-fires input)
  // must be distinguishable from a Continue generation (which does not) when
  // the context prune compares actionCounts.
  state.wtgInputRanThisCycle = true;

  // Prioritize handling the dedicated [sleep] command as it completely replaces this input.
  const sleepCommandMatch = text.trim().match(/^\[sleep(?:\s+([^\]]+))?\]$/i);
  if (sleepCommandMatch) {
    state.wtgSkipNextAutomaticTiming = true;
    // [sleep] is the player's direct clock authority: supersede the arc.
    delete state.wtgOpenTimeFrame;
    delete state.wtgSleepArcFresh;
    const explicitSleepSpec = String(sleepCommandMatch[1] || '').trim();
    if (explicitSleepSpec) {
      if (state.startingTime === 'Unknown' || !parseClockTime(state.startingTime)) {
        messages.push('[Sleep duration not applied as current time is descriptive. Use [settime] to set a numeric time if needed.]');
      } else {
        const parsedSleep = parseAdvanceSpec(explicitSleepSpec);
        if (parsedSleep.error) {
          messages.push('[Invalid sleep duration. Use [sleep] or [sleep 9 hours].]');
        } else {
          const add = parsedSleep.add;
          const current = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
          const advanced = advanceDateTimeValue(current.currentDate, current.currentTime, add);
          if (!advanced) {
            messages.push('[Sleep duration could not be calculated from the current date/time.]');
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
            messages.push(`\n\n[SYSTEM] You sleep for ${parsedSleep.summary} and wake up on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]\n\n`);
            clearDynamicMinuteRemainder();
            delete state.wtgClockUnverified;
            state.changed = true;
          }
        }
      }
    } else if (state.currentTime !== 'Unknown') {
      // Sleep should advance the current clock without mutating the fixed scene starting time.
      let add = getSleepDuration(state.currentTime);
      state.turnTime = addToTurnTime(state.turnTime, add);
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      const ttMarker = formatTurnTime(state.turnTime);
      messages.push(`\n\n[SYSTEM] You go to sleep and wake up on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]\n\n`);
      clearDynamicMinuteRemainder();
      delete state.wtgClockUnverified;
      state.changed = true;
    } else {
      // If the current clock is unknown, preserve the fixed scene start and only advance the day count.
      state.turnTime = addToTurnTime(state.turnTime, {days: 1});
      const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
      state.currentDate = currentDate;
      state.currentTime = currentTime;
      const ttMarker = formatTurnTime(state.turnTime);
      messages.push(`\n\n[SYSTEM] You go to sleep and wake up on ${state.currentDate} at ${state.currentTime}. [[${ttMarker}]]\n\n`);
      clearDynamicMinuteRemainder();
      delete state.wtgClockUnverified;
      state.changed = true;
    }
    modifiedText = '';
  }
  // Handle [settime], [advance], [reset] and other bracket commands.
  else {
    let trimmedText = text.trim();
    if (trimmedText.match(/^\[(.+?)\]$/)) {
      state.wtgSkipNextAutomaticTiming = true;
      // A bracket command is the player's direct clock authority: any open
      // sleep-arc declaration is superseded.
      delete state.wtgOpenTimeFrame;
      delete state.wtgSleepArcFresh;
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
            // The clock restarts at zero: thresholds from the old timeline are
            // all in the future now and must not freeze AI pacing.
            clearFutureCooldowns(state.turnTime);
            delete state.wtgClockUnverified;
            state.changed = true;
          }
        } else {
          messages.push('[Invalid date. Use command: settime mm/dd/yyyy h:mm AM/PM.]');
        }
      } else if (command === 'setcurrent') {
        // Accepted forms:
        //   [setcurrent mm/dd/yyyy [time]] - absolute date, optional time
        //   [setcurrent h:mm AM/PM]        - time only: today if not yet
        //                                    passed, otherwise tomorrow
        // A bare "H:MM" without AM/PM resolves to whichever of AM/PM is
        // nearer the current clock, matching the goTo convention.
        const firstArgIsDate = /^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}$/.test(parts[1] || '');
        let dateStr = firstArgIsDate ? parts[1] : null;
        let timeStr = firstArgIsDate ? parts.slice(2).join(' ') : parts.slice(1).join(' ');

        if (!dateStr && !timeStr) {
          messages.push('[Invalid date. Use command: setcurrent mm/dd/yyyy [time] or setcurrent h:mm AM/PM.]');
        } else if (!state.startingDate || !state.startingTime || state.startingTime === 'Unknown' || !parseClockTime(state.startingTime)) {
          messages.push('[Current date/time cannot be recalculated until a numeric starting time exists. Use [settime mm/dd/yyyy h:mm AM/PM] first.]');
        } else {
          let parsedDate = dateStr ? normalizeDateInput(dateStr) : null;
          let fallbackTime = parseClockTime(state.currentTime) ? state.currentTime : state.startingTime;

          // Bare H:MM without meridiem: pick the nearer of AM/PM. Must run
          // BEFORE the day-roll below, which otherwise reads the bare hour as
          // 24h ("3:00" -> 03:00, already passed) and wrongly rolls to
          // tomorrow for a not-yet-passed PM time.
          if (timeStr && !/\b(?:am|pm)\b/i.test(timeStr) && /^\d{1,2}:\d{2}$/.test(timeStr.trim())) {
            const bare = parseTime(timeStr);
            if (bare.valid && bare.hour >= 1 && bare.hour <= 12) {
              const currentParsed = parseTime(state.currentTime);
              if (currentParsed.valid) {
                const curMinutes = currentParsed.hour * 60 + currentParsed.min;
                const amMinutes = (bare.hour === 12 ? 0 : bare.hour) * 60 + bare.min;
                const pmMinutes = (bare.hour === 12 ? 12 : bare.hour + 12) * 60 + bare.min;
                const target = Math.abs(amMinutes - curMinutes) <= Math.abs(pmMinutes - curMinutes) ? amMinutes : pmMinutes;
                timeStr = formatClockTime(Math.floor(target / 60), target % 60);
              }
            }
          }

          // Time-only form: roll the target to tomorrow when the requested
          // clock has already passed today.
          if (!dateStr) {
            const todayParts = state.currentDate.split('/').map(Number);
            const targetParsed = parseClockTime(timeStr);
            if (!parsedDate && !targetParsed) {
              parsedDate = {error: `[Invalid time: ${timeStr}. Use h:mm AM/PM, HH:mm, or mm/dd/yyyy with an optional time.]`};
            } else if (targetParsed) {
              const currentParsed = parseTime(state.currentTime);
              const targetMinutes = targetParsed.hour * 60 + targetParsed.min;
              const currentMinutes = currentParsed.valid ? currentParsed.hour * 60 + currentParsed.min : -1;
              const dayOffset = targetMinutes <= currentMinutes ? 1 : 0;
              const rolled = advanceDate(
                `${String(todayParts[0]).padStart(2, '0')}/${String(todayParts[1]).padStart(2, '0')}/${todayParts[2]}`,
                dayOffset
              );
              parsedDate = {date: rolled};
              dateStr = rolled;
            }
          }

          const normalizedTime = timeStr ? normalizeTime(timeStr) : fallbackTime;

          if (parsedDate && parsedDate.error) {
            messages.push(parsedDate.error);
          } else if (!parsedDate || !parsedDate.date) {
            messages.push('[Invalid date. Use command: setcurrent mm/dd/yyyy [time] or setcurrent h:mm AM/PM.]');
          } else if (!normalizedTime || !parseClockTime(normalizedTime)) {
            messages.push(`[Invalid time: ${timeStr || '(current time unavailable)'}. Use h:mm AM/PM, HH:mm, or omit time to keep the current clock.]`);
          } else {
            state.turnTime = getDateDiff(state.startingDate, state.startingTime, parsedDate.date, normalizedTime);
            state.currentDate = parsedDate.date;
            state.currentTime = normalizedTime;

            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);
            cleanupWTGDataCardByTimestamp(state.turnTime);
            cleanupStoryCardsByTimestamp(state.currentDate, state.currentTime);
            // Rolling the clock backwards must not strand AI command
            // cooldowns in the erased future.
            clearFutureCooldowns(state.turnTime);

            const ttMarker = formatTurnTime(state.turnTime);
            messages.push(`\n\n[SYSTEM] Current date/time set to ${state.currentDate} ${state.currentTime}. Elapsed turn time recalculated from start: ${ttMarker}. [[${ttMarker}]]\n\n`);
            markSettimeAsInitialized();
            clearDynamicMinuteRemainder();
            delete state.wtgClockUnverified;
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
                delete state.wtgClockUnverified;
                state.changed = true;
              }
            }
          }
        }
      } else if (command === 'reset') {
        // [reset] realigns the clock from the best surviving evidence, in order:
        //   1. newest turn-log anchor (exact turn time),
        //   2. most recent explicit date/time mention in history text,
        //   3. newest story-card discovery stamp (floor: only raises time).
        // A successful reset from layers 1-2 also clears an unverified state.
        let valid = false;
        const anchorTT = getLastTimestampFromWTGData();
        if (anchorTT) {
          state.turnTime = anchorTT;
          const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
          state.currentDate = currentDate;
          state.currentTime = currentTime;
          valid = true;
        } else {
          let newDate = getCurrentDateFromHistory('', true);
          let newTime = getCurrentTimeFromHistory('', true);
          if (newDate) {
            const parsedDate = normalizeDateInput(newDate);
            if (!parsedDate.error) {
              let tempCurrentDate = parsedDate.date;
              let tempCurrentTime = newTime ? normalizeTime(newTime) : state.startingTime;
              if (tempCurrentTime && parseClockTime(tempCurrentTime)) {
                state.turnTime = getDateDiff(state.startingDate, state.startingTime, tempCurrentDate, tempCurrentTime);
                state.currentDate = tempCurrentDate;
                state.currentTime = tempCurrentTime;
                valid = true;
              }
            }
          }
        }
        if (!valid) {
          // Layer 3: card-stamp floor. Refuses while unverified (stamps may
          // describe a discarded future), so clear the flag first and restore
          // it if nothing applies.
          const wasUnverified = Boolean(state.wtgClockUnverified);
          delete state.wtgClockUnverified;
          valid = applyCardStampFloor();
          if (!valid && wasUnverified) {
            state.wtgClockUnverified = true;
          }
        }
        if (valid) {
          // After reset, realign placeholder/default storycard timestamps.
          updateAllStoryCardTimestamps(state.currentDate, state.currentTime);
          // [reset] can move the clock backwards; stranded cooldown thresholds
          // in the erased future must not stay active.
          clearFutureCooldowns(state.turnTime);
          delete state.wtgClockUnverified;
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`\n\n[SYSTEM] Date and time reset to most recent mention: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]\n\n`);
          clearDynamicMinuteRemainder();
          state.changed = true;
        } else {
          messages.push(`[No date or time mentions found in history.]`);
        }
      } else if (command === 'time') {
        // [time] — read-only clock query. The [SYSTEM] message doubles as a
        // canonical time-format example the AI can see in context.
        if (state.currentTime && state.currentTime !== 'Unknown') {
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`\n\n[SYSTEM] It is ${state.currentTime} on ${state.currentDate}. [[${ttMarker}]]\n\n`);
        } else {
          messages.push(`[Current time is not established yet. Use [settime mm/dd/yyyy h:mm AM/PM] first.]`);
        }
        // Read-only: no state change, but the message must reach the output.
        state.wtgSkipNextAutomaticTiming = true;
      } else {
        messages.push('[Invalid command. Available: settime, setcurrent, advance, reset, sleep, time.]');
      }
      modifiedText = '';
    } else if (trimmedText) {
      rememberPendingPlayerInput(text);
      trackSleepArcDeclaration(text);
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
/**
 * Reconciles the persisted turn log against the host's current position.
 * This is the whole rewind/retry recovery stage of the context hook, run
 * before the clock is recomputed for display. Steps:
 *   1. actionCount prune (primary) — drop records from a discarded future,
 *      plus the same-count record on a retry;
 *   2. text-match fallback — for legacy v3 records without counts;
 *   3. deep-rewind detection — freeze destructive cleanup (unverified clock)
 *      when neither an anchor nor a history marker survived;
 *   4. opening-clock refresh, base-turn-time selection, precise-marker trust;
 *   5. cooldown cleanup for the erased future, evidence recovery.
 * @returns {Array} The (possibly rewritten) turn-log records, for the caller's
 *   subsequent timestamp cleanup.
 */
function reconcileTurnLog() {
  let turnData = getTurnData();
  let historyRolledBack = false;
  let rollbackTurnTime = null;

  // --- Rewind / Retry Recovery, primary path -------------------------------
  // info.actionCount is the host's authoritative position signal: it drops on
  // rewind and stays put on retry. Compare it against the logged record counts
  // and prune the discarded tail. Fast, and immune to narrative-text reuse.
  // The input-ran flag is consumed immediately: if this turn's generation
  // later fails, a stale flag must not turn a future Continue into a fake
  // retry.
  const inputRanThisCycle = Boolean(state.wtgInputRanThisCycle);
  delete state.wtgInputRanThisCycle;
  if (pruneTurnDataByActionCount(turnData, inputRanThisCycle)) {
    turnData = getTurnData();
    rollbackTurnTime = getLastTimestampFromWTGData();
    historyRolledBack = true;
  }

  // --- Rewind / Retry Recovery, text-match fallback ------------------------
  // Covers legacy v3 records (no actionCount) and host environments without a
  // usable info.actionCount. Every saved AI output is a timeline anchor,
  // including Continue generations: if the newest anchor is no longer present
  // in history, restore the newest retained output timestamp and remove the
  // erased branch from WTG Data.
  const hasCountedRecords = turnData.some(record => record.actionCount !== null);
  if (!hasCountedRecords) {
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
  }
  // The host-managed state is the authoritative running clock.
  // Storycard data may still contain entries from the erased future.
  // A [[turntime]] marker in retained history is itself authoritative
  // evidence: it counts as surviving evidence when deciding whether a deep
  // rewind left the clock unverifiable.
  const {lastTT, found: markerFound} = getLastTurnTime(history);
  if (historyRolledBack) {
    clearDynamicMinuteRemainder();
    delete state.wtgOpenTimeFrame;
    delete state.wtgSleepArcFresh;
    if (!rollbackTurnTime && !markerFound) {
      // No anchor and no marker survived: the rewind landed before the whole
      // tracked span. Freeze destructive cleanup until evidence re-establishes
      // the clock; card stamps and narrative dates become the recovery source.
      state.wtgClockUnverified = true;
    }
  }

  const openingClockRefreshed = refreshOpeningClockForRetry(turnData);

  let baseTT = normalizeTurnTimeSign(state.turnTime);
  if (historyRolledBack || openingClockRefreshed) {
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
    const {currentDate, currentTime} = computeCurrent(state.startingDate || getSceneStartDate(), state.startingTime || 'Unknown', state.turnTime);
    state.currentDate = currentDate;
    state.currentTime = currentTime;
    // A precise marker is authoritative evidence.
    delete state.wtgClockUnverified;
    state.changed = true;
  } else {
    state.turnTime = baseTT;
  }
  if (historyRolledBack || openingClockRefreshed) {
    state.changed = true;
  }

  // A rewind must not leave cooldown thresholds stranded in the erased future.
  if (historyRolledBack) {
    clearFutureCooldowns(state.turnTime);
  }

  // After a deep rewind, try to re-establish the clock from surviving evidence
  // (anchor -> history text -> card stamp floor) before displaying anything.
  // Reuses the parsed records where possible: cleanup may have rewritten the
  // card, so recoverUnverifiedClock re-reads only when a prune/trim happened.
  recoverUnverifiedClock(turnData);

  return turnData;
}

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

  // Reconcile the turn log with the host position (rewind/retry recovery).
  const turnData = reconcileTurnLog();

  const {currentDate, currentTime} = computeCurrent(
    state.startingDate || getSceneStartDate(),
    state.startingTime || 'Unknown',
    state.turnTime
  );
  state.currentDate = currentDate;
  state.currentTime = currentTime;

  // Remove WTG Data entries that are now in the future relative to the reconstructed clock.
  cleanupWTGDataCardByTimestamp(state.turnTime, turnData);

  // After erase/reset processing, remove future timestamps from non-system storycards.
  cleanupStoryCardsByTimestamp(state.currentDate, state.currentTime);
  updateWTGDebugCard();
  // Pacing permission is cooldown-aware (WTG 3.0 parity): a command on
  // cooldown is not advertised, so the AI never wastes attempts on pacing
  // that would be silently suppressed. Opening turns hide it entirely —
  // time has not started moving and the opening text needs no pacing. The
  // prohibitions stay unconditional.
  let instructions = '';
  if (areAITimeCommandsEnabled() && !isOpeningTimeGuardActive()) {
    const sleepReady = !isSleepCooldownActive();
    const advanceReady = !isAdvanceCooldownActive();
    if (sleepReady && advanceReady) {
      instructions += ` You may control pacing by writing (sleep) or (advance 30 minutes); when the story jumps ahead - days go by, a journey ends - use larger skips like (advance 3 days). Actions like travelling, waiting, or searching imply time on their own even without a stated duration - give them a fitting (advance ...), e.g. (advance 20 minutes) for a short trip. Pacing commands always sit on their own line, never woven into a sentence; they have short in-game cooldowns and are removed from the story automatically.`;
    } else if (sleepReady) {
      instructions += ` You may control pacing by writing (sleep). Pacing commands have short in-game cooldowns and are removed from the story automatically.`;
    } else if (advanceReady) {
      instructions += ` You may control pacing by writing (advance 30 minutes), or larger skips like (advance 3 days) when the story jumps ahead. Actions like travelling, waiting, or searching imply time on their own even without a stated duration - give them a fitting (advance ...), e.g. (advance 20 minutes) for a short trip. Pacing commands always sit on their own line, never woven into a sentence; they have short in-game cooldowns and are removed from the story automatically.`;
    } else {
      instructions += ` Scene pacing is resting for now - narrate normally.`;
    }
  }
  instructions += `\nDo not write player commands in [square brackets], do not expose system metadata, and only mention exact time when the narrative naturally requires it. Keep scene chronology consistent with the hidden current date/time below.`;

  modifiedText += instructions;

  // Inject current date/time once either the default or an explicit clock is initialized.
  let dateTimeInjection = '';
  if (hasSettimeBeenInitialized() && state.currentTime !== 'Unknown') {
    const timeBucket = isPreciseTime(state.currentTime) ? ` (${getDescriptiveBucketFromPreciseTime(state.currentTime)})` : '';
    const weekday = getDayOfWeek(state.currentDate);
    const weekdayPrefix = weekday ? `${weekday}, ` : '';
    dateTimeInjection = `\nCurrent date: ${weekdayPrefix}${state.currentDate}; Current time: ${state.currentTime}${timeBucket}`;
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
  if (state.startingDate === getSceneStartDate() && info.actionCount <= 1) {
    // Scan all storycards for [settime] commands
    const scanCount = Math.min(storyCards.length, WTG_MAX_STORYCARDS_TO_PROCESS);
    for (let cardIndex = 0; cardIndex < scanCount; cardIndex++) {
      const card = storyCards[cardIndex];
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

  // AI-issued time commands: execute (sleep)/(advance ...) before dynamic
  // estimation, then strip the system syntax from the narrative. Commands
  // beyond their in-game cooldown are counted as skipped and only removed.
  // The estimate below must read the POST-strip text: an executed command's
  // own wording ("(advance 2 hours)", "Two hours later") would otherwise be
  // counted a second time by the explicit-duration extractor.
  const preStripNarrative = modifiedText;
  const aiCommandResult = executeAITimeCommands(modifiedText);
  modifiedText = stripAITimeCommands(modifiedText, aiCommandResult.removable);
  // The estimate below must read the POST-strip text (see its comment above):
  // even when the safety net below restores the command wording for display,
  // the restored text must not flow back into the estimator.
  narrative = modifiedText;
  // Safety net (mirrors WTG 3.0): stripping pacing commands must never yield
  // an empty response. A turn made only of pacing commands falls back to the
  // pre-strip narrative so the player still sees the AI's turn instead of a
  // blank one.
  if (aiCommandResult.removable.length > 0 && !modifiedText.trim() && preStripNarrative.trim()) {
    modifiedText = preStripNarrative;
  }

  // Sleep-arc ledger (P15) + frame authority (P17): the arc resolves when
  // the story narrates waking; AI commands during the arc are clamped to the
  // declared budget instead of superseding it; a fresh announcement
  // suppresses this turn's estimate (a plan is not passage).
  const arc = state.wtgOpenTimeFrame || null;
  const arcWakeNarrated = arc ? new RegExp(WTG_WAKE_VERB_SOURCE, 'i').test(modifiedText) : false;
  const arcAnnouncedThisTurn = Boolean(state.wtgSleepArcFresh);
  delete state.wtgSleepArcFresh;

  const skipAutomaticTiming = Boolean(state.wtgSkipNextAutomaticTiming);
  const timingActionType = pendingPlayerInput
    ? (state.wtgPendingPlayerInputType || actionType || 'do')
    : 'continue';
  // An executed AI pacing command is this turn's authoritative time jump. The
  // post-strip narrative echoes the commanded duration in prose ("Half an
  // hour later", "slept through the night"), and the explicit-duration
  // extractor below would count that echo a second time — skip the estimate
  // on such turns. Suppressed commands (cooldown/guard) gate nothing: they
  // moved the clock zero, so normal estimation still applies.
  // Opening turns (first action, no accumulated time) are exempt entirely:
  // the opening text establishes the scene — time has not started moving yet.
  const shouldEstimateTime = !skipAutomaticTiming &&
    (!pendingPlayerInput || freshPendingPlayerInput) &&
    aiCommandResult.executed === 0 &&
    !isOpeningTimeGuardActive() &&
    !arcAnnouncedThisTurn;

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

    // Debug-only telemetry: only occupy state while Debug Mode needs it, so
    // normal play leaves no residue. The debug card reader clears the keys
    // when the mode is off.
    if (getWTGBooleanSetting("Debug Mode")) {
      state.wtgSimilarity = similarity;
      state.wtgLastDynamicEstimate = estimate;
    }
    state.wtgPendingPlayerInputNeedsTiming = false;

    if (estimate.minutes > 0) {
      state.turnTime = addToTurnTime(state.turnTime, {minutes: estimate.minutes});
      const current = computeCurrent(
        state.startingDate || getSceneStartDate(),
        state.startingTime || 'Unknown',
        state.turnTime
      );
      state.currentDate = current.currentDate;
      state.currentTime = current.currentTime;
      state.changed = true;
    }
    updateWTGDebugCard();
  }

  // Sleep-arc resolution: top the clock up to the declared magnitude/target
  // when the waking narration alone did not carry it that far. The estimate
  // (which includes the wake-arrival floor when the wake text names a phase)
  // has already banked its minutes above; the arc only supplies the
  // difference. One-shot: the ledger clears whether or not anything applied.
  if (arc && arcWakeNarrated) {
    if (!isOpeningTimeGuardActive()) {
      const declaredMinutes = Math.max(arc.targetDeltaMinutes || 0, arc.durationMinutes || 0);
      const nowAbsolute = turnTimeToApproxSeconds(state.turnTime) / 60;
      const extra = Math.round(arc.baseMinutes + declaredMinutes - nowAbsolute);
      if (extra > 0) {
        state.turnTime = addToTurnTime(state.turnTime, {minutes: extra});
        const current = computeCurrent(
          state.startingDate || getSceneStartDate(),
          state.startingTime || 'Unknown',
          state.turnTime
        );
        state.currentDate = current.currentDate;
        state.currentTime = current.currentTime;
        state.changed = true;
      }
    }
    delete state.wtgOpenTimeFrame;
  }
  delete state.wtgSkipNextAutomaticTiming;

  // Timestamp storycards mentioned in the combined "player action + AI response" text.
  // Skipped while unverified: the clock may still be re-established backwards,
  // and stamps written now would pin a wrong discovery date.
  if (!state.wtgClockUnverified && lastAction && hasSettimeBeenInitialized() && state.currentTime !== 'Unknown') {
    const combinedText = lastAction.text + ' ' + modifiedText;

    const scanCount = Math.min(storyCards.length, WTG_MAX_STORYCARDS_TO_PROCESS);
    for (let i = 0; i < scanCount; i++) {
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
    // addTurnData replaces the stale same-actionCount record on retry (input
    // re-fired) and appends normally otherwise; Continue generations never
    // replace the player-action record they share a count with.
    addTurnData(persistedActionType, persistedActionText, persistedResponse, timestamp, {pacing: (aiCommandResult.applied || []).join('; ')});
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
