const idString = (value) => String(value?._id || value || '');

export const DAILY_UNLOCK_HOUR = 6;
export const DEFAULT_COURSE_TIMEZONE = 'Africa/Johannesburg';

function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === '24' ? '0' : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zoneOffsetMilliseconds(date, timeZone) {
  const parts = zonedDateParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function zonedTimeToUtc(year, month, day, hour, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  let timestamp = guess;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    timestamp = guess - zoneOffsetMilliseconds(new Date(timestamp), timeZone);
  }
  return new Date(timestamp);
}

export function nextDailyUnlockAt(completedAt, timeZone = DEFAULT_COURSE_TIMEZONE, unlockHour = DAILY_UNLOCK_HOUR) {
  const completed = completedAt ? new Date(completedAt) : new Date();
  if (Number.isNaN(completed.getTime())) return null;
  let zone = timeZone || DEFAULT_COURSE_TIMEZONE;
  let parts;
  try { parts = zonedDateParts(completed, zone); }
  catch { zone = 'UTC'; parts = zonedDateParts(completed, zone); }
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return zonedTimeToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), unlockHour, zone);
}

export function isLessonAccessible(lesson, index, entries, accessMode, completed, now = new Date(), options = {}) {
  if (completed.has(idString(lesson._id))) return true;
  if (lesson.availableAt && new Date(lesson.availableAt).getTime() > now.getTime()) return false;
  if (accessMode === 'scheduled') return true;
  if (index === 0) return true;
  const previous = entries[index - 1].lesson;
  const previousId = idString(previous._id);
  if (!completed.has(previousId)) return false;
  if (accessMode === 'daily') {
    const completedAt = options.completionTimes?.get(previousId);
    if (completedAt) {
      const unlockAt = nextDailyUnlockAt(completedAt, options.timeZone, options.unlockHour ?? DAILY_UNLOCK_HOUR);
      if (unlockAt && now.getTime() < unlockAt.getTime()) return false;
    }
  }
  return true;
}

export default isLessonAccessible;
