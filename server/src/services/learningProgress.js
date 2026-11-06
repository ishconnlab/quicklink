const POSITION_TYPES = Object.freeze({
  pdf: 'page', ppt: 'slide', pptx: 'slide', xls: 'sheet', xlsx: 'sheet', doc: 'section', docx: 'section',
});

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

export function formatAwareProgress(format, input, now = new Date(), existing = null, options = {}) {
  const positionType = POSITION_TYPES[format] || 'document';
  const completionThreshold = Number(options.completionThreshold ?? 95);
  const totalUnits = Math.max(0, Math.floor(input.totalUnits ?? input.totalPages ?? existing?.totalUnits ?? existing?.totalPages ?? 0));
    const requestedIndex = Math.floor(input.positionIndex ?? input.currentPage ?? existing?.positionIndex ?? 1);
  const positionIndex = Math.min(Math.max(1, requestedIndex), totalUnits || 100000);
  const furthestPosition = Math.max(existing?.furthestPosition || 0, positionIndex);
  const unitProgress = totalUnits ? Math.min(100, Math.round(furthestPosition / totalUnits * 100)) : 0;
  const scrollPercent = Math.max(existing?.scrollPercent || 0, clampPercent(input.scrollPercent ?? input.progressPercent));
  const progressPercent = Math.max(existing?.progressPercent || 0, unitProgress, scrollPercent);
  const completed = progressPercent >= completionThreshold;
  return {
    currentPage: positionType === 'page' ? positionIndex : 1,
    totalPages: positionType === 'page' ? totalUnits : 0,
    positionType,
    positionIndex,
    positionLabel: input.positionLabel || '',
    furthestPosition,
    totalUnits,
    progressPercent,
    scrollPercent,
    completed,
    timeSpentSeconds: (existing?.timeSpentSeconds || 0) + Math.min(120, Math.max(0, Math.floor(input.timeSpentSeconds || 0))),
    lastOpenedAt: now,
    lastReadAt: now,
  };
}

export default formatAwareProgress;
