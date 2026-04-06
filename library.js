// library.js - Core time management functions for WTG Lightweight Modified
// Derivative of WTG 2.0 by thedenial. - Apache 2.0 - See LICENSE

// ============================================================================
// WTG Scene Start Configuration
// Modify these when switching between different story scenarios
// ============================================================================
const WTG_SCENE_START_DATE = '04/04/2026'; // Or change it as needed
const WTG_SCENE_START_TIME_MODE = 'random'; // 'random' | 'fixed'
const WTG_SCENE_FIXED_START_TIME = '8:00 PM'; // Or change it as needed

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
    return normalizeTime(WTG_SCENE_FIXED_START_TIME);
  }

  let randHour = Math.floor(Math.random() * 12) + 1;
  let randMinute = Math.floor(Math.random() * 60);
  let ampm = Math.random() < 0.5 ? 'AM' : 'PM';
  let formattedMinute = randMinute.toString().padStart(2, '0');

  return `${randHour}:${formattedMinute} ${ampm}`;
}

/**
 * Checks whether the current mode is lightweight
 * @returns {boolean} True if in lightweight mode
 */
function isLightweightMode() {
  return state.wtgMode === 'lightweight';
}

/**
 * Normalizes a time expression to standard format
 * @param {string} str - The time string to normalize
 * @returns {string} Normalized time string
 */
function normalizeTime(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  if (descriptiveMap.has(lower)) {
    return descriptiveMap.get(lower).defaultTime;
  }
  return capitalize(str);
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
  return Boolean(timeStr && /\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M/i.test(timeStr));
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
    config = getDescriptiveTimeConfig(getDescriptiveBucketFromPreciseTime(currentTime));
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
  let parts = timeStr.split(/[: ]/);
  let hourStr = parts[0];
  let minStr = '00';
  let period = '';
  if (parts.length === 3) {
    minStr = parts[1];
    period = parts[2];
  } else if (parts.length === 2) {
    if (isNaN(parseInt(parts[1], 10))) {
      period = parts[1];
    } else {
      minStr = parts[1];
    }
  }
  if (/[a-zA-Z]/i.test(hourStr)) {
    let match = hourStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      hourStr = match[1];
      period = match[2];
    }
  }
  if (/[a-zA-Z]/i.test(minStr)) {
    let match = minStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      minStr = match[1];
      period = match[2];
    }
  }
  period = period.replace(/\./g, '').toLowerCase();
  let hour = parseInt(hourStr, 10);
  let min = parseInt(minStr, 10);
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  let currentSeconds = hour * 3600 + min * 60 + 0;
  let addedSeconds = hours * 3600 + minutes * 60 + seconds;
  let totalSeconds = currentSeconds + addedSeconds;
  let extraDays = Math.floor(totalSeconds / 86400);
  let wrappedSeconds = totalSeconds % 86400;
  hour = Math.floor(wrappedSeconds / 3600);
  let remaining = wrappedSeconds % 3600;
  min = Math.floor(remaining / 60);
  let sec = remaining % 60;
  period = (hour < 12) ? 'AM' : 'PM';
  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;
  let newTime = `${hour}:${String(min).padStart(2, '0')}${sec > 0 ? `:${String(sec).padStart(2, '0')}` : ''} ${period}`;
  return { time: newTime, days: extraDays };
}

/**
 * Capitalizes the first letter of a string, or converts time to 12-hour format
 * @param {string} str - String to process
 * @returns {string} Processed string or formatted time
 */
function capitalize(str) {
  str = str || 'Unknown';
  if (str === 'Unknown') return str;
  if (/\d/.test(str)) {
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      return convertTo12Hour(str);
    }
    str = str.replace(/\s*(am|pm|a\.m\.|p\.m\.)$/i, (match, meridiem) => ` ${meridiem.replace(/\./g, '').toUpperCase()}`);
    if (!/:\d{2}/.test(str)) {
      str = str.replace(/(\d+)\s*([AP]M)?$/i, (match, p1, p2) => {
        let period = p2 ? ` ${p2.toUpperCase()}` : '';
        return `${p1}:00${period}`;
      });
    }
    return str;
  } else {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

/**
 * Converts 24-hour time to 12-hour format
 * @param {string} timeStr - 24-hour time string (hh:mm)
 * @returns {string} 12-hour time string (h:mm AM/PM)
 */
function convertTo12Hour(timeStr) {
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  let min = minStr ? `:${minStr}` : ':00';
  const period = (hour < 12) ? 'AM' : 'PM';
  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;
  return `${hour}${min} ${period}`;
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
  const match = str.match(/(\d+)y(\d+)m(\d+)d(\d+)h(\d+)n(\d+)s/);
  if (!match) return {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  return {
    years: parseInt(match[1]),
    months: parseInt(match[2]),
    days: parseInt(match[3]),
    hours: parseInt(match[4]),
    minutes: parseInt(match[5]),
    seconds: parseInt(match[6])
  };
}

/**
 * Formats a turn time object into a string
 * @param {Object} tt - Turn time object
 * @returns {string} Formatted turn time string
 */
function formatTurnTime(tt) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  return `${String(tt.years).padStart(2, '0')}y${String(tt.months).padStart(2, '0')}m${String(tt.days).padStart(2, '0')}d${String(tt.hours).padStart(2, '0')}h${String(tt.minutes).padStart(2, '0')}n${String(tt.seconds).padStart(2, '0')}s`;
}

/**
 * Adds time values to a turn time object
 * @param {Object} tt - Turn time object
 * @param {Object} add - Time values to add
 * @returns {Object} New turn time object
 */
function addToTurnTime(tt, add) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
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
  return newTT;
}

/**
 * Computes current date and time from starting date, starting time, and turn time
 * @param {string} startingDate - Starting date string
 * @param {string} startingTime - Starting time string
 * @param {Object} tt - Turn time object
 * @returns {Object} Object containing currentDate and currentTime
 */
function computeCurrent(startingDate, startingTime, tt) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  if (startingTime === 'Unknown') {
    let approxDays = (tt.years || 0) * 365 + (tt.months || 0) * 30 + (tt.days || 0);
    let currentDate = advanceDate(startingDate, approxDays);
    return { currentDate, currentTime: 'Unknown' };
  }
  let [month, day, year] = startingDate.split('/').map(Number);
  let date = new Date(year, month - 1, day);
  date.setFullYear(date.getFullYear() + (tt.years || 0));
  date.setMonth(date.getMonth() + (tt.months || 0));
  date.setDate(date.getDate() + (tt.days || 0));
  let {time, days} = advanceTime(startingTime, tt.hours || 0, tt.minutes || 0, tt.seconds || 0);
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
  if (!str || str === 'Unknown') return {hour: 0, min: 0, sec: 0};
  let parts = str.split(/[: ]/);
  let hourStr = parts[0];
  let minStr = '00';
  let period = '';
  if (parts.length === 3) {
    minStr = parts[1];
    period = parts[2];
  } else if (parts.length === 2) {
    if (isNaN(parseInt(parts[1], 10))) {
      period = parts[1];
    } else {
      minStr = parts[1];
    }
  }
  if (/[a-zA-Z]/i.test(hourStr)) {
    let match = hourStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      hourStr = match[1];
      period = match[2];
    }
  }
  if (/[a-zA-Z]/i.test(minStr)) {
    let match = minStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      minStr = match[1];
      period = match[2];
    }
  }
  period = period.replace(/\./g, '').toLowerCase();
  let hour = parseInt(hourStr, 10);
  let min = parseInt(minStr, 10);
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return {hour, min, sec: 0};
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

  if (tt1.years !== tt2.years) return tt1.years < tt2.years ? -1 : 1;
  if (tt1.months !== tt2.months) return tt1.months < tt2.months ? -1 : 1;
  if (tt1.days !== tt2.days) return tt1.days < tt2.days ? -1 : 1;
  if (tt1.hours !== tt2.hours) return tt1.hours < tt2.hours ? -1 : 1;
  if (tt1.minutes !== tt2.minutes) return tt1.minutes < tt2.minutes ? -1 : 1;
  if (tt1.seconds !== tt2.seconds) return tt1.seconds < tt2.seconds ? -1 : 1;
  return 0;
}

/**
 * Reads turn data from the WTG Data storycard
 * @returns {Array} Array of turn data objects
 */
function getTurnData() {
  const dataCard = getWTGDataCard();
  if (!dataCard.entry) return [];

  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...dataCard.entry.matchAll(turnDataRegex)];

  return matches.map(match => ({
    actionType: match[1],
    actionText: match[2],
    responseText: match[3],
    timestamp: match[4]
  }));
}

/**
 * Appends turn data to the WTG Data storycard (lightweight simplified format)
 * @param {string} actionType - Action type (do, say, story, continue)
 * @param {string} actionText - Full action text
 * @param {string} responseText - AI response text
 * @param {string} timestamp - Turntime-formatted timestamp
 */
function addTurnData(actionType, actionText, responseText, timestamp) {
  const dataCard = getWTGDataCard();

  const turnDataEntry = `[Turn Data]
Action Type: ${actionType}
Action Text: ${actionText}
Response Text: ${responseText || ''}
Timestamp: ${timestamp}
[/Turn Data]`;

  if (dataCard.entry) {
    dataCard.entry += '\n\n' + turnDataEntry;
  } else {
    dataCard.entry = turnDataEntry;
  }
}

/**
 * Gets the most recent turn data entry.
 * @param {Array} turnData - Array returned by getTurnData()
 * @returns {Object|null} Most recent entry; null if none exists
 */
function getLatestTurnDataEntry(turnData) {
  if (!turnData || turnData.length === 0) return null;
  return turnData[turnData.length - 1];
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

/**
 * Checks whether two player actions should be treated as the same action for timing purposes.
 * @param {string} typeA - First action type
 * @param {string} textA - First action text
 * @param {string} typeB - Second action type
 * @param {string} textB - Second action text
 * @returns {boolean} True if the actions are equivalent
 */
function isSameAction(typeA, textA, typeB, textB) {
  return typeA === typeB && normalizeActionText(textA) === normalizeActionText(textB);
}

/**
 * Builds a stable action signature for retry/erase identity checks.
 * @param {string} type - Action type
 * @param {string} text - Action text
 * @returns {string} Stable signature
 */
function getActionSignature(type, text) {
  return `${type || ''}:${normalizeActionText(text)}`;
}

/**
 * Records the most recent player action that WTG has accepted and written to the timeline.
 * This state is used to distinguish "genuinely new actions" from "retry regeneration of the same action".
 * @param {Object|null} action - Most recent player action
 */
function rememberProcessedAction(action) {
  if (!action) return;
  state.wtgLastProcessedActionCount = info.actionCount;
  state.wtgLastProcessedActionType = action.type;
  state.wtgLastProcessedActionText = normalizeActionText(action.text);
  state.wtgLastProcessedActionSignature = getActionSignature(action.type, action.text);
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
  state.wtgPendingPlayerInputCount = info.actionCount;
  state.wtgPendingPlayerInputNeedsTiming = true;
}

/**
 * Clears the pending player input marker after the cycle has been consumed.
 */
function clearPendingPlayerInput() {
  delete state.wtgPendingPlayerInputText;
  delete state.wtgPendingPlayerInputRaw;
  delete state.wtgPendingPlayerInputCount;
  delete state.wtgPendingPlayerInputNeedsTiming;
}

/**
 * Checks whether a fresh player input is currently pending processing.
 * @returns {boolean} True if the current cycle originated from a new player input
 */
function hasPendingPlayerInput() {
  return Boolean(state.wtgPendingPlayerInputText);
}

/**
 * Checks whether a pending player input still needs automatic timing for this cycle.
 * @returns {boolean} True if automatic timing has not yet been consumed
 */
function hasFreshPendingPlayerInput() {
  return Boolean(state.wtgPendingPlayerInputText && state.wtgPendingPlayerInputNeedsTiming);
}

/**
 * Returns the current action that should drive automatic timing.
 * Prefer the pending player input captured in onInput_WTG, and only fall back to history
 * when it matches that pending input or when no pending input exists.
 * @param {Array} historyItems - History array
 * @returns {Object|null} Timing action object
 */
function getTimingAction(historyItems) {
  const latestAction = getLatestPlayerAction(historyItems);
  if (hasPendingPlayerInput()) {
    if (latestAction && normalizeActionText(latestAction.text) === state.wtgPendingPlayerInputText) {
      return latestAction;
    }
    return {
      type: latestAction ? latestAction.type : 'do',
      text: state.wtgPendingPlayerInputRaw || state.wtgPendingPlayerInputText
    };
  }
  return latestAction;
}

/**
 * Checks whether the specified text still appears in the most recent history.
 * Retry often replaces the previous AI response; continue usually preserves it.
 * @param {Array} historyItems - History array
 * @param {string} responseText - Previous AI response
 * @returns {boolean} True if the response is still in recent history
 */
function isResponseStillPresentInHistory(historyItems, responseText) {
  const normalizedResponse = (responseText || '').trim();
  if (!normalizedResponse) return false;

  // Only check recent entries to avoid false positives from old repeated sentences.
  const recentHistoryText = (historyItems || [])
    .slice(-6)
    .map(item => (item && item.text) ? item.text : '')
    .join('\n');

  // Short texts can easily collide; for longer responses, use prefix matching.
  if (normalizedResponse.length >= 32) {
    const probe = normalizedResponse.slice(0, 64);
    return recentHistoryText.includes(probe);
  }

  return recentHistoryText.includes(normalizedResponse);
}

/**
 * Determines whether the current generation is more likely a retry of the same player action,
 * rather than a new continue.
 * The logic closely follows the host's actual behavior:
 * - The most recent player action matches the last processed action
 * - The last entry in WTG Data also corresponds to the same action
 * - But the previous AI response is no longer in recent history, suggesting it was replaced by retry
 * @param {Array} historyItems - History array
 * @param {Array} turnData - Array returned by getTurnData()
 * @returns {boolean} True if judged as retry
 */
function isRetryGeneration(historyItems, turnData) {
  if (hasPendingPlayerInput()) return false;
  const latestAction = getLatestPlayerAction(historyItems);
  const latestTurnData = getLatestTurnDataEntry(turnData);
  if (!latestAction || !latestTurnData) return false;

  const sameProcessedAction = isSameAction(
    state.wtgLastProcessedActionType,
    state.wtgLastProcessedActionText,
    latestAction.type,
    latestAction.text
  );
  const sameTurnDataAction = isSameAction(
    latestTurnData.actionType,
    latestTurnData.actionText,
    latestAction.type,
    latestAction.text
  );
  const sameProcessedActionCount = state.wtgLastProcessedActionCount === info.actionCount;
  const previousResponseStillPresent = isResponseStillPresentInHistory(historyItems, latestTurnData.responseText);

  return Boolean(sameProcessedAction && sameProcessedActionCount && sameTurnDataAction && !previousResponseStillPresent);
}

/**
 * Finds the newest persisted turn entry that matches the specified player action.
 * @param {Object|null} action - Most recent player action
 * @param {Array} turnData - Array returned by getTurnData()
 * @returns {Object|null} Matching persisted turn entry; null if none exists
 */
function findMatchingTurnDataEntry(action, turnData) {
  if (!action || !turnData || turnData.length === 0) return null;
  for (let i = turnData.length - 1; i >= 0; i--) {
    const entry = turnData[i];
    if (isSameAction(entry.actionType, entry.actionText, action.type, action.text)) {
      return entry;
    }
  }
  return null;
}

/**
 * Checks whether the latest persisted turn already corresponds to the same player action.
 * @param {Object|null} action - Most recent player action
 * @param {Array} turnData - Array returned by getTurnData()
 * @returns {boolean} True if the latest persisted turn already matches the action
 */
function isActionAlreadyTimed(action, turnData) {
  if (!action || !turnData || turnData.length === 0) return false;
  const latestTurnData = getLatestTurnDataEntry(turnData);
  return Boolean(latestTurnData && isSameAction(latestTurnData.actionType, latestTurnData.actionText, action.type, action.text));
}

/**
 * Checks whether the current generation is reusing the same player action without a new submission.
 * This acts as the primary retry/erase+continue guard for time advancement.
 * @param {Object|null} action - Most recent player action
 * @returns {boolean} True if this should be treated as a retry-like regeneration
 */
function isRetryLikeAction(action) {
  if (hasPendingPlayerInput() || !action) return false;

  const currentSignature = getActionSignature(action.type, action.text);
  const sameProcessedAction = state.wtgLastProcessedActionSignature === currentSignature;
  const sameActionCount = state.wtgLastProcessedActionCount === info.actionCount;

  return Boolean(sameProcessedAction && sameActionCount);
}

/**
 * In retry scenarios, overwrites the last turn data entry with the new AI response
 * rather than appending a duplicate.
 * If the last entry doesn't match the current action, falls back to normal append.
 * @param {string} actionType - Action type
 * @param {string} actionText - Player action text
 * @param {string} responseText - AI response text
 * @param {string} timestamp - Turntime-formatted timestamp
 */
function upsertLatestTurnData(actionType, actionText, responseText, timestamp) {
  const dataCard = getWTGDataCard();
  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...(dataCard.entry || '').matchAll(turnDataRegex)];

  if (matches.length === 0) {
    addTurnData(actionType, actionText, responseText, timestamp);
    return;
  }

  const lastMatch = matches[matches.length - 1];
  const lastActionType = lastMatch[1];
  const lastActionText = lastMatch[2];
  if (!isSameAction(lastActionType, lastActionText, actionType, actionText)) {
    addTurnData(actionType, actionText, responseText, timestamp);
    return;
  }

  const rebuiltEntries = matches.map((match, index) => {
    if (index === matches.length - 1) {
      return `[Turn Data]
Action Type: ${actionType}
Action Text: ${actionText}
Response Text: ${responseText || ''}
Timestamp: ${timestamp}
[/Turn Data]`;
    }
    return `[Turn Data]
Action Type: ${match[1]}
Action Text: ${match[2]}
Response Text: ${match[3]}
Timestamp: ${match[4]}
[/Turn Data]`;
  });

  dataCard.entry = rebuiltEntries.join('\n\n');
}

/**
 * Cleans entries from WTG Data card with timestamps later than the current time
 * @param {Object} currentTT - Current turn time object
 */
function cleanupWTGDataCardByTimestamp(currentTT) {
  const dataCard = getWTGDataCard();
  if (!dataCard.entry) return;

  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...dataCard.entry.matchAll(turnDataRegex)];

  // Only keep entries with timestamps less than or equal to the current time
  let newEntry = "";
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const entryTT = parseTurnTime(match[4]);

    // Skip entries with invalid timestamps
    if (!entryTT) continue;

    // If entry timestamp is less than or equal to current timestamp, keep it
    if (compareTurnTime(entryTT, currentTT) <= 0) {
      const turnDataEntry = `[Turn Data]
Action Type: ${match[1]}
Action Text: ${match[2]}
Response Text: ${match[3]}
Timestamp: ${match[4]}
[/Turn Data]`;

      if (newEntry) {
        newEntry += '\n\n' + turnDataEntry;
      } else {
        newEntry = turnDataEntry;
      }
    }
  }

  dataCard.entry = newEntry;
}

/**
 * Cleans storycards with future timestamps
 * @param {string} currentDate - Current date in mm/dd/yyyy format
 * @param {string} currentTime - Current time in hh:mm AM/PM format
 */
function cleanupStoryCardsByTimestamp(currentDate, currentTime) {
  const currentDateTime = parseDateTime(currentDate, currentTime);

  // Iterate through storycards and remove future timestamps
  for (let i = storyCards.length - 1; i >= 0; i--) {
    const card = storyCards[i];

    // Skip WTG Data card and cards without entry
    if (card.title === "WTG Data" || card.title === "Current Date and Time" || !card.entry) {
      continue;
    }

    // Check if the card has a timestamp
    const discoveredMatch = card.entry.match(/(?:Discovered on|Met on|Visited) (\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)/);
    if (discoveredMatch) {
      const cardDate = discoveredMatch[1];
      const cardTime = discoveredMatch[2];
      const cardDateTime = parseDateTime(cardDate, cardTime);

      // If card timestamp is later than current time, remove the timestamp
      if (cardDateTime > currentDateTime) {
        card.entry = card.entry.replace(/\n\n(?:Discovered on|Met on|Visited) .+/, '');
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
  let [sMonth, sDay, sYear] = startStr.split('/').map(Number);
  let startParsed = parseTime(startTimeStr);
  let start = new Date(sYear, sMonth - 1, sDay, startParsed.hour, startParsed.min, startParsed.sec);
  let [eMonth, eDay, eYear] = endStr.split('/').map(Number);
  let endParsed = parseTime(endTimeStr);
  let end = new Date(eYear, eMonth - 1, eDay, endParsed.hour, endParsed.min, endParsed.sec);
  if (end < start) return {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  let hours = end.getHours() - start.getHours();
  let minutes = end.getMinutes() - start.getMinutes();
  let seconds = end.getSeconds() - start.getSeconds();
  if (seconds < 0) {
    minutes--;
    seconds += 60;
  }
  if (minutes < 0) {
    hours--;
    minutes += 60;
  }
  if (hours < 0) {
    days--;
    hours += 24;
  }
  if (days < 0) {
    months--;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return {years, months, days, hours, minutes, seconds};
}

/**
 * Gets the most recent timestamp from the WTG Data storycard
 * @returns {Object|null} Most recent turn time object, or null if not found
 */
function getLastTimestampFromWTGData() {
  const dataCard = getWTGDataCard();
  if (!dataCard || !dataCard.entry) return null;

  // lightweight format
  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...dataCard.entry.matchAll(turnDataRegex)];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const timestamp = lastMatch[4];
    if (timestamp && timestamp.match(/\d+y\d+m\d+d\d+h\d+n\d+s/)) {
      return parseTurnTime(timestamp);
    }
  }

  return null;
}

/**
 * Gets the most recent turn time from history and the character count after it
 * @param {Array} history - History array
 * @returns {Object} Object containing lastTT, charsAfter, and found (whether marker was found)
 */
function getLastTurnTimeAndChars(history) {
  let lastTT = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  let charsAfter = 0;
  let found = false;
  for (let i = history.length - 1; i >= 0; i--) {
    const actionText = history[i].text;
    const match = actionText.match(/\[\[(\d+y\d+m\d+d\d+h\d+n\d+s)\]\]/);
    if (match) {
      lastTT = parseTurnTime(match[1]);
      found = true;
      break;
    } else {
      charsAfter += actionText.length;
    }
  }

  // If no marker in history, try to recover timestamp from WTG Data storycard
  if (!found) {
    const wtgDataTimestamp = getLastTimestampFromWTGData();
    if (wtgDataTimestamp) {
      lastTT = wtgDataTimestamp;
      found = true;
      // If recovering from WTG Data, only count the last action's character length
      charsAfter = history.length > 0 ? history[history.length - 1].text.length : 0;
    } else {
      // Only use cumulative character count when there's no timestamp source at all
      charsAfter = history.reduce((sum, action) => sum + action.text.length, 0);
    }
  }
  return {lastTT, charsAfter, found};
}

/**
 * Parses date and time strings into a Date object
 * @param {string} dateStr - Date string in mm/dd/yyyy format
 * @param {string} timeStr - Time string in hh:mm AM/PM format
 * @returns {Date} Parsed Date object
 */
function parseDateTime(dateStr, timeStr) {
  const [month, day, year] = dateStr.split('/').map(Number);
  const time = parseTime(timeStr);
  return new Date(year, month - 1, day, time.hour, time.min, time.sec);
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
      dataCard.keys = "wtg_internal_data,do_not_include_in_context";
      dataCard.entry = "";
      dataCard.description = "System data for World Time Generator - Internal use only, do not include in context";
    }
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
    dateTimeCard.type = "event";
    dateTimeCard.keys = "date,time,current date,current time,clock,hour,am,pm";
    dateTimeCard.description = "Commands:\n[settime mm/dd/yyyy time] - Set starting date and time\n[advance N [minutes|hours|days|months|years] or combos like 1month 2days] - Advance time/date\n[sleep] - Sleep and advance time based on the current clock\n[reset] - Reset to most recent mention in history";
  }
  return dateTimeCard;
}

/**
 * Updates the Current Date and Time storycard
 */
function updateDateTimeCard() {
  const dateTimeCard = getCurrentDateTimeCard();
  const ttForm = formatTurnTime(state.turnTime);
  let entry = `Current date: ${state.currentDate || 'Unknown'}\nCurrent time: ${state.currentTime || 'Unknown'}\nStarting date: ${state.startingDate || 'Unknown'}\nStarting time: ${state.startingTime || 'Unknown'}\nTurn time: ${ttForm}`;
  dateTimeCard.entry = entry;
}

/**
 * Adds a timestamp to a storycard if it doesn't already have one
 * @param {Object} card - Storycard to update
 * @param {string} timestamp - Timestamp to append
 */
function addTimestampToCard(card, timestamp) {
  // If still using default引导 date/time, don't write timestamp
  if (timestamp && (timestamp.includes(WTG_SCENE_START_DATE) || timestamp.includes("Unknown"))) {
    return;
  }

  // Only append if the card doesn't already have a timestamp
  if (card && card.entry && !card.entry.includes("Discovered on") && !card.entry.includes("Met on") && !card.entry.includes("Visited")) {
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
  return card && card.entry && (card.entry.includes("Discovered on") || card.entry.includes("Met on") || card.entry.includes("Visited"));
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

    // Check if the key appears as a whole word in the text
    // Use word boundaries to avoid partial matches
    const keyRegex = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (keyRegex.test(normalizedText)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts a timestamp from a storycard
 * @param {Object} card - Storycard to check
 * @returns {string|null} Timestamp string if found, null otherwise
 */
function getCardTimestamp(card) {
  if (!card || !card.entry) return null;
  const match = card.entry.match(/(?:Discovered on|Met on|Visited) (\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

/**
 * Updates placeholder timestamps in all existing storycards after a time reset
 * @param {string} newDate - New date in mm/dd/yyyy format
 * @param {string} newTime - New time in hh:mm AM/PM format
 */
function updateAllStoryCardTimestamps(newDate, newTime) {
  const timestamp = `${newDate} ${newTime}`;

  // Update storycards with Unknown or default date timestamps
  for (let i = 0; i < storyCards.length; i++) {
    const card = storyCards[i];

    // Skip system cards
    if (card.title === "WTG Data" || card.title === "Current Date and Time" || card.title === "World Time Generator Settings") {
      continue;
    }

    // Update timestamps containing Unknown or default date (placeholder/default timestamps)
    if (card.entry && (card.entry.includes("Discovered on") || card.entry.includes("Met on") || card.entry.includes("Visited"))) {
      if (card.entry.includes("Unknown")) {
        // Replace placeholder timestamp with new timestamp
        card.entry = card.entry.replace(/(Discovered on|Met on|Visited) \d{1,2}\/\d{1,2}\/\d{4}\s+Unknown/, `$1 ${timestamp}`);
      } else if (card.entry.includes(WTG_SCENE_START_DATE)) {
        // Replace default configured placeholder timestamp with new timestamp
        const placeholderRegex = new RegExp(`(Discovered on|Met on|Visited) ${WTG_SCENE_START_DATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[\\d:]+ [AP]M`);
        card.entry = card.entry.replace(placeholderRegex, `$1 ${timestamp}`);
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
Enable Dynamic Time: true
Debug Mode: false
Disable WTG Entirely: false`;
  } else {
    // Always ensure keys is empty
    settingsCard.keys = "";
  }
  return settingsCard;
}

/**
 * Gets or creates the WTG Cooldowns storycard
 * @returns {Object} WTG Cooldowns storycard object
 */
function getCooldownCard() {
  let cooldownCard = storyCards.find(card => card.title === "WTG Cooldowns");
  if (!cooldownCard) {
    addStoryCard("WTG Cooldowns");
    cooldownCard = storyCards[storyCards.length - 1];
    cooldownCard.type = "system";
    cooldownCard.keys = ""; // Empty keys to avoid entering context
    cooldownCard.description = "Internal cooldown tracking for AI commands; no keys; not included in context";
  }
  return cooldownCard;
}

/**
 * Checks whether the sleep command cooldown is still active
 * @returns {boolean} True if sleep cooldown is active
 */
function isSleepCooldownActive() {
  if (!state.sleepAvailableAtTT || !state.turnTime) return false;
  const currentTT = state.turnTime;
  const availableTT = parseTurnTime(state.sleepAvailableAtTT);
  if (!availableTT) return false;
  return compareTurnTime(currentTT, availableTT) < 0;
}

/**
 * Checks whether the advance command cooldown is still active
 * @returns {boolean} True if advance cooldown is active
 */
function isAdvanceCooldownActive() {
  if (!state.advanceAvailableAtTT || !state.turnTime) return false;
  const currentTT = state.turnTime;
  const availableTT = parseTurnTime(state.advanceAvailableAtTT);
  if (!availableTT) return false;
  return compareTurnTime(currentTT, availableTT) < 0;
}

/**
 * Sets the sleep command cooldown
 * @param {Object} duration - Duration object with time units (e.g., {hours: 8})
 */
function setSleepCooldown(duration) {
  const availableTT = addToTurnTime(state.turnTime, duration);
  state.sleepAvailableAtTT = formatTurnTime(availableTT);
  state.sleepWakeTime = formatTurnTime(availableTT);
  updateCooldownCard();
}

/**
 * Sets the advance command cooldown
 * @param {Object} duration - Duration object with time units (e.g., {minutes: 5})
 */
function setAdvanceCooldown(duration) {
  const availableTT = addToTurnTime(state.turnTime, duration);
  state.advanceAvailableAtTT = formatTurnTime(availableTT);
  state.advanceEndTime = formatTurnTime(availableTT);
  updateCooldownCard();
}

/**
 * Clears all command cooldowns
 * @param {string} source - Source that triggered the clear (for legacy interface compatibility)
 */
function clearCommandCooldowns(source) {
  state.sleepAvailableAtTT = null;
  state.advanceAvailableAtTT = null;
  state.sleepWakeTime = null;
  state.advanceEndTime = null;
  updateCooldownCard();
}

/**
 * Updates the WTG Cooldowns storycard with current cooldown information
 */
function updateCooldownCard() {
  const cooldownCard = getCooldownCard();
  let entry = "";

  if (state.sleepAvailableAtTT) {
    const sleepTT = parseTurnTime(state.sleepAvailableAtTT);
    const {currentDate: sleepDate, currentTime: sleepTime} = computeCurrent(state.startingDate, state.startingTime, sleepTT);
    entry += `Sleep available after: ${sleepDate} ${sleepTime}\n`;
  }

  if (state.advanceAvailableAtTT) {
    const advanceTT = parseTurnTime(state.advanceAvailableAtTT);
    const {currentDate: advanceDate, currentTime: advanceTime} = computeCurrent(state.startingDate, state.startingTime, advanceTT);
    entry += `Advance available after: ${advanceDate} ${advanceTime}\n`;
  }

  cooldownCard.entry = entry.trim();
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

/**
 * Reads the time multiplier from the WTG Settings card
 * @returns {number} Time multiplier value (default 1.0)
 */
function getTimeMultiplier() {
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return 1.0;

  const regex = /Time Duration Multiplier:\s*([\d.]+)/i;
  const match = settingsCard.entry.match(regex);
  if (match) {
    const value = parseFloat(match[1]);
    return isNaN(value) ? 1.0 : value;
  }
  return 1.0;
}

/**
 * Estimates automatic elapsed minutes from the newest player action itself.
 * The model uses weighted semantic cues plus a deterministic tie-breaker so actions
 * with similar wording stay stable, while keywords do not directly hardcode fixed minutes.
 * @param {string} turnText - Latest player action text
 * @param {string} actionType - Player action type
 * @param {number} similarity - Similarity to recent turns (0~1)
 * @returns {number} Estimated number of minutes
 */
function estimateDynamicMinutes(turnText, actionType = 'do', similarity = 0.5) {
  const normalizedText = normalizeActionText(turnText);
  const lower = normalizedText.toLowerCase();
  const charCount = normalizedText.length;

  if (!normalizedText) return 0;

  const explicitPassagePattern =
    /\b(later|afterward|afterwards|eventually|overnight|tomorrow|hourly|nightfall|daybreak|meanwhile)\b|after that/gi;
  const travelPattern =
    /\b(travel|journey|trek|hike|march|ride|sail|fly|drive|cross|return|leave|arrive|reach|head|move|proceed)\b/gi;
  const explorationPattern =
    /\b(search|explore|inspect|investigate|track|follow|climb|descend|enter|open|unlock|gather|cook|tend|examine|study|scout|prepare|work|build|repair)\b/gi;
  const pausePattern =
    /\b(wait|rest|pause|linger|watch|listen)\b/gi;
  const combatPattern =
    /\b(attack|fight|block|parry|dodge|slash|stab|shoot|strike|lunge|grapple|wrestle)\b/gi;
  const socialPattern =
    /\b(say|ask|talk|whisper|reply|speak|chat|converse|laugh|cry|smile|frown|sigh|gasp|grin|smirk|nod|shrug|gesture|blink|hesitate|glance|look|notice|realize)\b/gi;

  const countMatches = (pattern) => {
    const matches = lower.match(pattern);
    return matches ? matches.length : 0;
  };

  const explicitPassageHits = countMatches(explicitPassagePattern);
  const travelHits = countMatches(travelPattern);
  const explorationHits = countMatches(explorationPattern);
  const pauseHits = countMatches(pausePattern);
  const combatHits = countMatches(combatPattern);
  const socialHits = countMatches(socialPattern);

  let score = 0;

  if (actionType === 'story') {
    score += 0.18;
  } else if (actionType === 'say') {
    score -= 0.18;
  }

  score += Math.min(3.2, explicitPassageHits * 1.55);
  score += Math.min(1.8, travelHits * 0.7);
  score += Math.min(1.4, explorationHits * 0.48);
  score += Math.min(0.9, pauseHits * 0.35);
  score -= Math.min(1.0, combatHits * 0.3);
  score -= Math.min(0.9, socialHits * 0.22);

  if (charCount >= 380) {
    score += 0.45;
  } else if (charCount >= 180) {
    score += 0.22;
  } else if (charCount <= 45) {
    score -= 0.18;
  }

  if (similarity >= 0.82) {
    score -= 0.35;
  } else if (similarity >= 0.65) {
    score -= 0.18;
  } else if (similarity <= 0.15) {
    score += 0.14;
  }

  if (socialHits > 0 && explicitPassageHits === 0 && travelHits === 0 && explorationHits === 0 && pauseHits === 0) {
    score = Math.min(score, 0.85);
  }

  if (combatHits > 0 && explicitPassageHits === 0 && travelHits === 0 && explorationHits === 0) {
    score = Math.min(score, 1.0);
  }

  if (explicitPassageHits === 0 && travelHits === 0 && explorationHits === 0 && pauseHits === 0 && socialHits === 0 && combatHits === 0) {
    score = Math.min(score, 0.35);
  }

  let hash = 0;
  for (let i = 0; i < normalizedText.length; i++) {
    hash = (hash * 31 + normalizedText.charCodeAt(i)) % 1000003;
  }
  const jitter = ((hash % 17) - 8) / 100;
  const adjustedScore = Math.max(0, score + jitter);

  if (adjustedScore < 0.45) return 0;
  if (adjustedScore < 1.2) return 1;
  if (adjustedScore < 2.35) return 2;
  if (explicitPassageHits === 0) return 3;
  if (adjustedScore < 3.8) return 3;
  if (adjustedScore < 4.8) return 4;
  return 5;
}

/**
 * Estimates automatic elapsed minutes for a plain continue generation.
 * Continue has no new player action text, so its rhythm is inferred from how much text
 * has accumulated after the last authoritative marker.
 * @param {number} charsAfter - Characters after the last turn-time marker
 * @param {number} similarity - Similarity to recent turns (0~1)
 * @returns {number} Estimated number of minutes
 */
function estimateContinuationMinutes(charsAfter = 0, similarity = 0.5) {
  let score = charsAfter / 950;

  if (charsAfter >= 1800) {
    score += 0.7;
  } else if (charsAfter >= 900) {
    score += 0.35;
  } else if (charsAfter <= 180) {
    score -= 0.2;
  }

  if (similarity >= 0.82) {
    score -= 0.25;
  } else if (similarity <= 0.18) {
    score += 0.15;
  }

  if (score < 0.4) return 0;
  if (score < 1.15) return 1;
  if (score < 2.15) return 2;
  if (score < 3.2) return 3;
  return 4;
}

/**
 * Get dynamic time factor based on turn content analysis.
 * This preserves the original WTG "charsAfter * factor" structure while allowing
 * more scene-specific multipliers.
 * @param {string} turnText - Text used for dynamic-time classification
 * @returns {number} Time factor
 */
function getDynamicTimeFactor(turnText) {
  const lowerText = normalizeActionText(turnText).toLowerCase();
  if (!lowerText) return 1.0;

  const explicitPassagePattern =
    /\b(later|afterward|afterwards|eventually|overnight|tomorrow|hourly|nightfall|daybreak)\b|after that/;
  const transitionPattern =
    /\b(journey|travel|trek|hike|march|ride|sail|fly|drive|walk|cross|return|leave|arrive|reach|head|move|proceed|wait|rest|camp)\b/;
  const explorationPattern =
    /\b(search|explore|inspect|investigate|track|follow|climb|descend|enter|open|unlock|gather|cook|tend|examine|study|scout|prepare|work|build|repair)\b/;
  const combatPattern =
    /\b(attack|fight|block|parry|dodge|slash|stab|shoot|strike|lunge|grapple|wrestle)\b/;
  const dialoguePattern =
    /\b(say|ask|talk|whisper|reply|speak|chat|converse|laugh|cry|smile|frown|sigh|gasp|grin|smirk|nod|shrug|gesture|blink|hesitate|glance|look|notice|realize|watch|listen)\b/;

  let factor = 1.0;

  if (explicitPassagePattern.test(lowerText)) {
    factor = 1.45;
  } else if (transitionPattern.test(lowerText)) {
    factor = 1.1;
  } else if (explorationPattern.test(lowerText)) {
    factor = 0.95;
  } else if (combatPattern.test(lowerText)) {
    factor = 0.8;
  } else if (dialoguePattern.test(lowerText)) {
    factor = 0.65;
  }

  // Slightly slow down terse turns, but do not collapse them to zero by force.
  if (lowerText.length <= 60) {
    factor *= 0.9;
  } else if (lowerText.length >= 260 && factor < 1.45) {
    factor *= 1.05;
  }

  return Math.max(0.55, Math.min(1.5, factor));
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

// ====================================================================================
// Functions for NORMAL mode only
// ====================================================================================

/**
 * Normalizes a name to title case (Normal mode only)
 */
function normalizeNameCase(name) {
  if (!name) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
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
  cleaned = cleaned.replace(/\[(settime\s+[^\]]+|advance\s+[^\]]+|reset|sleep)\]/gi, '');

  // Collapse any excess blank lines and edge whitespace that may result from cleanup.
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
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    return text;
  }

  // Only bootstrap default lightweight values once on first run.
  // Preserves old behavior: fixed default date + randomly generated clock.
  if (state.startingDate === undefined) {
    state.startingDate = WTG_SCENE_START_DATE;
    state.startingTime = getSceneDefaultStartTime();
    state.currentDate = state.startingDate;
    state.currentTime = state.startingTime;
    state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
    state.settimeInitialized = true;
    if (!isLightweightMode()) {
      state.timeMultiplier = 1.0;
    }
  }

  state.changed = state.changed || false;
  state.insertMarker = false;

  let modifiedText = text;
  let messages = [];

  clearPendingPlayerInput();

  // Prioritize handling the dedicated [sleep] command as it completely replaces this input.
  if (text.trim().toLowerCase() === '[sleep]') {
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
    state.insertMarker = true;
    state.changed = true;
    setSleepCooldown({hours: 8});
    modifiedText = '';
  }
  // Handle [settime], [advance], [reset] and other bracket commands.
  else {
    let trimmedText = text.trim();
    if (trimmedText.match(/^\[(.+?)\]$/)) {
      const commandStr = trimmedText.match(/^\[(.+?)\]$/)[1].trim().toLowerCase();
      const parts = commandStr.split(/\s+/);
      const command = parts[0];

      if (command === 'settime') {
        // [settime] explicitly replaces the starting point and resets cumulative turn time.
        let dateStr = parts[1];
        let timeStr = parts.slice(2).join(' ');
        if (dateStr) {
          dateStr = dateStr.replace(/[.-]/g, '/');
          let [part1, part2, year] = dateStr.split('/').map(Number);
          if (year < 100) year += 2000;
          let month = part1;
          let day = part2;
          if (month > 12 && day <= 12) [month, day] = [day, part1];
          if (isValidDate(month, day, year)) {
            state.startingDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
            if (timeStr) {
              state.startingTime = normalizeTime(timeStr);
            }
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
            state.insertMarker = true;
            state.changed = true;
            // When user resets time, clear existing AI command cooldowns (Normal mode only)
            if (!isLightweightMode()) {
              clearCommandCooldowns("user settime command");
            }
          } else {
            messages.push(`[Invalid date: ${dateStr}. Use mm/dd/yyyy or dd/mm/yyyy.]`);
          }
        }
      } else if (command === 'advance') {
        // [advance] directly accumulates relative time delta onto turnTime.
        if (state.startingTime === 'Unknown') {
          messages.push(`[Time advancement not applied as current time is descriptive (${state.startingTime}). Use [settime] to set a numeric time if needed.]`);
        } else {
          const parsedAdvance = parseAdvanceSpec(parts.slice(1).join(' '));
          if (parsedAdvance.error) {
            messages.push(parsedAdvance.error);
          } else {
            const add = parsedAdvance.add;
            if (add.years || add.months || add.days || add.hours || add.minutes) {
              state.turnTime = addToTurnTime(state.turnTime, add);
              const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
              state.currentDate = currentDate;
              state.currentTime = currentTime;
              const ttMarker = formatTurnTime(state.turnTime);
              messages.push(`\n\n[SYSTEM] Advanced ${parsedAdvance.summary}. New date/time: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]\n\n`);
              state.insertMarker = true;
              state.changed = true;
              setAdvanceCooldown({minutes: 5});
            }
          }
        }
      } else if (command === 'reset') {
        // [reset] finds the most recent explicit date/time in history and realigns the clock accordingly.
        let newDate = getCurrentDateFromHistory('', true);
        let newTime = getCurrentTimeFromHistory('', true);
        let valid = false;
        if (newDate) {
          let [part1, part2, year] = newDate.split('/').map(Number);
          if (year < 100) year += 2000;
          let month = part1;
          let day = part2;
          if (month > 12 && day <= 12) [month, day] = [day, part1];
          if (isValidDate(month, day, year)) {
            let tempCurrentDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
            let tempCurrentTime = newTime ? normalizeTime(newTime) : state.startingTime;
            state.turnTime = getDateDiff(state.startingDate, state.startingTime, tempCurrentDate, tempCurrentTime);
            state.currentDate = tempCurrentDate;
            state.currentTime = tempCurrentTime;

            // After reset, realign placeholder/default storycard timestamps.
            updateAllStoryCardTimestamps(state.currentDate, state.currentTime);

            // Clear cooldowns when resetting time
            clearCommandCooldowns("reset command");

            valid = true;
          }
        }
        if (valid) {
          const ttMarker = formatTurnTime(state.turnTime);
          messages.push(`\n\n[SYSTEM] Date and time reset to most recent mention: ${state.currentDate} ${state.currentTime}. [[${ttMarker}]]\n\n`);
          state.insertMarker = true;
          state.changed = true;
        } else {
          messages.push(`[No date or time mentions found in history.]`);
        }
      } else {
        messages.push('[Invalid command. Available: settime, advance, reset, sleep.]');
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
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    return text;
  }

  let modifiedText = text;

  // Read lightweight turn log for reconstructing history and recovering from erase states.
  let turnData = getTurnData();
  const latestAction = getLatestPlayerAction(history);
  const timingAction = getTimingAction(history);

  // Only clean future turn data when history has clearly rolled back to a previously saved action.
  if (!hasPendingPlayerInput() && latestAction && turnData.length > 0) {
    const latestTurnData = getLatestTurnDataEntry(turnData);
    const matchingEntry = findMatchingTurnDataEntry(latestAction, turnData);
    if (
      latestTurnData &&
      matchingEntry &&
      !isSameAction(latestTurnData.actionType, latestTurnData.actionText, latestAction.type, latestAction.text)
    ) {
      cleanupWTGDataCardByTimestamp(parseTurnTime(matchingEntry.timestamp));
      turnData = getTurnData();
    }
  }

  const currentTurnData = turnData;
  const generationAlreadyTimed = state.wtgLastTimedGenerationCount === info.actionCount;

  // Build keyword sets for dynamic time similarity calculation.
  let lastKeywords = [];
  let secondLastKeywords = [];

  if (currentTurnData.length >= 1) {
    lastKeywords = extractKeywords(currentTurnData[currentTurnData.length - 1].actionText + " " + (currentTurnData[currentTurnData.length - 1].responseText || ''));
  }

  if (currentTurnData.length >= 2) {
    secondLastKeywords = extractKeywords(currentTurnData[currentTurnData.length - 2].actionText + " " + (currentTurnData[currentTurnData.length - 2].responseText || ''));
  }

  // Follow the original WTG structure: compare this generation's visible context shape
  // to the last two saved turns, while still allowing pending player input to influence factor selection.
  const currentTurnText = hasPendingPlayerInput() ? state.wtgPendingPlayerInputRaw : modifiedText;
  const currentKeywords = extractKeywords(modifiedText);

  // Calculate similarity with the two most recent turns
  const similarity1 = calculateKeywordSimilarity(lastKeywords, currentKeywords);
  const similarity2 = calculateKeywordSimilarity(secondLastKeywords, currentKeywords);

  // Store similarity for onOutput_WTG to use (key for two-layer dynamic time merging)
  state.wtgSimilarity = Math.max(similarity1, similarity2);

  // Recover the most recent authoritative turn marker and count characters after it.
  const {lastTT, charsAfter, found: markerFound} = getLastTurnTimeAndChars(history);

  // Check if lastTT came from the most recent action (usually means it came from a user command).
  // If the last action ends with a precise [[turntime]], trust that marker instead of continuing to accumulate time.
  let useLastTTDirectly = false;
  if (history.length > 0) {
    const lastActionText = history[history.length - 1].text;
    if (lastActionText.match(/\[\[(\d+y\d+m\d+d\d+h\d+n\d+s)\]\]$/)) {
      useLastTTDirectly = true;
    }
  }

  let additionalMinutes = 0;

  if (generationAlreadyTimed) {
    // Retry regenerates within the same actionCount cycle and must not advance time twice.
    state.turnTime = lastTT;
    const {currentDate, currentTime} = computeCurrent(state.startingDate || WTG_SCENE_START_DATE, state.startingTime || 'Unknown', state.turnTime);
    state.currentDate = currentDate;
    state.currentTime = currentTime;
  } else if (useLastTTDirectly) {
    // If the most recent action already ends with a precise [[turntime]],
    // trust that marker and don't append elapsed time here.
    state.turnTime = lastTT;
    const {currentDate, currentTime} = computeCurrent(state.startingDate || WTG_SCENE_START_DATE, state.startingTime || 'Unknown', state.turnTime);
    state.currentDate = currentDate;
    state.currentTime = currentTime;
    state.changed = true;
  } else if (markerFound) {
    // Original WTG model: previous marker + charsAfter/700, then adjust by dynamic factor and similarity.
    const timeMultiplier = getTimeMultiplier();
    additionalMinutes = Math.floor((charsAfter / 700) * timeMultiplier);
    if (getWTGBooleanSetting("Enable Dynamic Time")) {
      additionalMinutes = Math.floor(additionalMinutes * getDynamicTimeFactor(currentTurnText));
      if (additionalMinutes > 0) {
        if (similarity1 > 0.3 || similarity2 > 0.3) {
          additionalMinutes = Math.floor(additionalMinutes * 0.7);
        } else if (similarity1 < 0.1 && similarity2 < 0.1) {
          additionalMinutes = Math.floor(additionalMinutes * 1.3);
        }
      }
    }

    // Update turn time
    if (additionalMinutes > 0) {
      state.turnTime = addToTurnTime(lastTT, {minutes: additionalMinutes});
      state.changed = true;
    } else {
      state.turnTime = lastTT;
    }
    const {currentDate, currentTime} = computeCurrent(state.startingDate || WTG_SCENE_START_DATE, state.startingTime || 'Unknown', state.turnTime);
    state.currentDate = currentDate;
    state.currentTime = currentTime;
  } else {
    // No marker remains; preserve original lightweight fallback using in-memory turnTime.
    if (state.turnTime && state.startingTime !== 'Unknown') {
      const timeMultiplier = getTimeMultiplier();
      additionalMinutes = Math.floor((charsAfter / 700) * timeMultiplier);
      if (getWTGBooleanSetting("Enable Dynamic Time")) {
        additionalMinutes = Math.floor(additionalMinutes * getDynamicTimeFactor(currentTurnText));
        if (additionalMinutes > 0) {
          if (similarity1 > 0.3 || similarity2 > 0.3) {
            additionalMinutes = Math.floor(additionalMinutes * 0.7);
          } else if (similarity1 < 0.1 && similarity2 < 0.1) {
            additionalMinutes = Math.floor(additionalMinutes * 1.3);
          }
        }
      }

      if (additionalMinutes > 0) {
        state.turnTime = addToTurnTime(state.turnTime, {minutes: additionalMinutes});
        const {currentDate, currentTime} = computeCurrent(state.startingDate || WTG_SCENE_START_DATE, state.startingTime || 'Unknown', state.turnTime);
        state.currentDate = currentDate;
        state.currentTime = currentTime;
        state.changed = true;
      }
    }
    // If state.turnTime doesn't exist, keep currentDate/currentTime unchanged
  }

  state.wtgLastTimedGenerationCount = info.actionCount;

  // Remove WTG Data entries that are now in the future relative to the reconstructed clock.
  cleanupWTGDataCardByTimestamp(state.turnTime);

  // After erase/reset processing, remove future timestamps from non-system storycards.
  cleanupStoryCardsByTimestamp(state.currentDate, state.currentTime);

  state.insertMarker = (charsAfter >= 7000);

  let instructions = `\nDo not recreate or reference any system commands such as [settime], [advance], [reset], or [sleep]. Keep scene chronology consistent with the hidden current date/time below. Do not expose system metadata, and only mention exact time when the narrative naturally requires it.`;

  modifiedText += instructions;

  // Only inject visible current date/time into context after explicit [settime] has been established.
  // Default random start time is also a valid clock, so decide based on current initialization state.
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

  // If mode is not set, default initialize to lightweight
  if (!state.wtgMode) {
    state.wtgMode = 'lightweight';
  }

  let modifiedText = text;

  // Check if WTG is completely disabled
  if (getWTGBooleanSetting("Disable WTG Entirely")) {
    return ensureLeadingSpace(text);
  }

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

          // Normalize date separators
          dateStr = dateStr.replace(/[.-]/g, '/');
          let [part1, part2, year] = dateStr.split('/').map(Number);
          if (year < 100) year += 2000;
          let month = part1;
          let day = part2;
          if (month > 12 && day <= 12) [month, day] = [day, part1];

          if (isValidDate(month, day, year)) {
            // Set starting date and time
            state.startingDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
            state.startingTime = normalizeTime(timeStr);
            state.turnTime = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
            const {currentDate, currentTime} = computeCurrent(state.startingDate, state.startingTime, state.turnTime);
            state.currentDate = currentDate;
            state.currentTime = currentTime;
            state.changed = true;

            // Since this is auto-detected [settime], mark as initialized here
            markSettimeAsInitialized();

            // Initialize required system storycards
            updateDateTimeCard();
            getWTGSettingsCard();
            getCooldownCard();
            if (!isLightweightMode()) {
              getWTGDataCard();
            }

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

  // ========================================================================
  // LIGHTWEIGHT MODE
  // ========================================================================
  if (isLightweightMode()) {

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
    const pendingInputMatchesLastAction = hasPendingPlayerInput() && lastAction && normalizeActionText(lastAction.text) === state.wtgPendingPlayerInputText;
    const turnData = getTurnData();
    const generationAlreadyLogged = state.wtgLastLoggedGenerationCount === info.actionCount;
    // Hidden AI time-skip consumption logic on output side is currently disabled;
    // At this stage, onOutput_WTG only retains text analysis, timestamps, and turn data maintenance.
    // Lightweight mode removes trailing [[turntime]] marker before returning visible body text.
    const ttMatch = modifiedText.match(/\[\[(.*?)\]\]$/);
    let parsedTT = ttMatch ? parseTurnTime(ttMatch[1]) : null;
    let narrative = ttMatch ? modifiedText.replace(/\[\[.*\]\]$/, '').trim() : modifiedText.trim();
    let charCount = narrative.length;

    // When there's no hidden AI command to process time, advancing by character count is lightweight's fallback.
    // When the model rewrites turn-time metadata, preserve the original warning.
    if (parsedTT) {
      const currentTTForm = formatTurnTime(state.turnTime);
      if (ttMatch[1] !== currentTTForm) {
        modifiedText += '\n[Warning: Turn time metadata altered by AI. Please retry.]';
      }
    }
    // Currently, output side does not submit minutesToAdd;
    // Actual time advancement still primarily happens in onContext_WTG.
    // Update text after removing turn time marker
    modifiedText = narrative;

    // Timestamp storycards mentioned in the combined "player action + AI response" text.
    if (lastAction && state.currentDate !== WTG_SCENE_START_DATE && state.currentTime !== 'Unknown') {
      // Per original lightweight behavior, Current Date and Time card also gets timestamped.
      const dateTimeCard = storyCards.find(card => card.title === "Current Date and Time");
      if (dateTimeCard) {
        addTimestampToCard(dateTimeCard, `${state.currentDate} ${state.currentTime}`);
      }

      // Keyword detection checks both player action and AI response.
      const combinedText = (lastAction ? lastAction.text : '') + ' ' + modifiedText;

      // Append timestamps to storycards that don't have timestamps yet but have keywords mentioned in text
      for (let i = 0; i < storyCards.length; i++) {
        const card = storyCards[i];

        // Skip system cards
        if (card.title === "WTG Data" || card.title === "Current Date and Time" || card.title === "World Time Generator Settings" || card.title === "WTG Cooldowns") {
          continue;
        }

        // Only append timestamp if card doesn't have one yet and its keywords appear in the text
        if (card.entry && !hasTimestamp(card) && isCardKeywordMentioned(card, combinedText)) {
          addTimestampToCard(card, `${state.currentDate} ${state.currentTime}`);
        }
      }
    }

    // Store lightweight turn data for subsequent reconstruction and erase cleanup.
    if (lastAction && pendingInputMatchesLastAction && actionType !== "continue") {
      const timestamp = formatTurnTime(state.turnTime);
      if (generationAlreadyLogged) {
        upsertLatestTurnData(actionType, lastAction.text, narrative, timestamp);
      } else {
        addTurnData(actionType, lastAction.text, narrative, timestamp);
      }
      rememberProcessedAction(lastAction);
      state.wtgLastLoggedGenerationCount = info.actionCount;
    }

    if (pendingInputMatchesLastAction) {
      clearPendingPlayerInput();
    }

    // When state changes or at periodic checkpoints, refresh the visible date/time storycard.
    if (state.changed || info.actionCount === 1 || info.actionCount % 5 === 0) {
      updateDateTimeCard();
      delete state.changed;
    }

    delete state.insertMarker;

    // Before final visible output, sanitize accidental system time and system command leakage.
    modifiedText = sanitizeSystemLeakage(modifiedText);

    // Ensure modified text starts with leading space
    modifiedText = ensureLeadingSpace(modifiedText);

    return modifiedText;
  }

  modifiedText = sanitizeSystemLeakage(modifiedText);
  return ensureLeadingSpace(modifiedText);
}
