const idString = (value) => String(value?._id || value || '');

export function isLessonAccessible(lesson, index, entries, accessMode, completed, now = new Date()) {
  if (completed.has(idString(lesson._id))) return true;
  if (lesson.availableAt && new Date(lesson.availableAt).getTime() > now.getTime()) return false;
  if (accessMode === 'scheduled') return true;
  if (index === 0) return true;
  return completed.has(idString(entries[index - 1].lesson._id));
}

export default isLessonAccessible;
