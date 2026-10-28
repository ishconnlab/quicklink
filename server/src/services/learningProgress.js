const POSITION_TYPES = Object.freeze({
  pdf: 'page', ppt: 'slide', pptx: 'slide', xls: 'sheet', xlsx: 'sheet', doc: 'section', docx: 'section',
});

export function formatAwareProgress(format, input, now = new Date(), existing = null) {
  const positionType = POSITION_TYPES[format] || 'document';
  const totalUnits = Math.max(0, Math.floor(input.totalUnits ?? input.totalPages ?? existing?.totalUnits ?? existing?.totalPages ?? 0));
  const positionIndex = Math.min(Math.max(1, Math.floor(input.positionIndex ?? input.currentPage ?? 1)), totalUnits || 100000);
  const furthestPosition = Math.max(existing?.furthestPosition || 0, positionIndex);
  const progressPercent = totalUnits ? Math.min(100, Math.round(furthestPosition / totalUnits * 100)) : (existing?.progressPercent || 0);
  const completed = totalUnits > 0 && furthestPosition / totalUnits >= 0.95;
  return {
    currentPage: positionType === 'page' ? positionIndex : 1,
    totalPages: positionType === 'page' ? totalUnits : 0,
    positionType,
    positionIndex,
    positionLabel: input.positionLabel || '',
    furthestPosition,
    totalUnits,
    progressPercent,
    completed,
    timeSpentSeconds: (existing?.timeSpentSeconds || 0) + Math.min(120, Math.max(0, Math.floor(input.timeSpentSeconds || 0))),
    lastOpenedAt: now,
    lastReadAt: now,
  };
}

export default formatAwareProgress;
