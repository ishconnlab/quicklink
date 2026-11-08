import PDFDocument from 'pdfkit';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';

const pageWidth = 595.28;
const margin = 40;
const columns = [
  ['Student', 92], ['Email', 125], ['Session', 67], ['Status', 48], ['Joined', 53], ['Left', 53], ['Min', 37],
];

function allowed(classItem, user) {
  if (user.role !== 'admin') throw ApiError.forbidden('Attendance reports are available to administrators.');
}

function writeTableHeader(doc) {
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#475569');
  let x = margin;
  for (const [label, width] of columns) { doc.text(label, x, doc.y, { width, lineBreak: false }); x += width; }
  doc.moveDown(0.8).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.4);
}

function cellText(value, width) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, Math.max(10, Math.floor(width / 3.2)));
}

export const downloadAttendancePdf = asyncHandler(async (req, res) => {
  const classItem = await LearningClass.findById(req.params.id).populate('students', 'name email');
  if (!classItem) throw ApiError.notFound('Training not found.');
  allowed(classItem, req.user);
  const filter = { learningClass: classItem._id, status: 'ended' };
  if (req.query.from || req.query.to) {
    filter.startedAt = {};
    if (req.query.from) filter.startedAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.startedAt.$lte = new Date(req.query.to);
  }
  if (req.query.sessionId) filter._id = req.query.sessionId;
  const sessions = await LiveSession.find(filter).sort({ startedAt: -1 }).limit(200).lean();
  if (req.query.sessionId && sessions.length === 0) throw ApiError.notFound('Completed class session not found.');
  const targetStudent = req.query.studentId ? String(req.query.studentId) : null;
  if (targetStudent && !classItem.students.some((student) => student._id.toString() === targetStudent)) throw ApiError.badRequest('Student is not enrolled in this class.');
  const rows = sessions.flatMap((session) => (session.report?.attendance || [])
    .filter((entry) => !targetStudent || entry.user?.toString() === targetStudent)
    .map((entry) => ({ entry, session })));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="quicklink-attendance-${classItem._id.toString()}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 42, right: margin, bottom: 42, left: margin }, bufferPages: true, info: { Title: `Attendance report - ${classItem.title}`, Author: 'QuickLink' } });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text('QuickLink attendance report');
  doc.moveDown(0.35).font('Helvetica').fontSize(10).fillColor('#334155');
  doc.text(`Training: ${classItem.course || classItem.title}`);
  doc.text(`Class: ${classItem.title} - ${classItem.subject} - ${classItem.level}`);
  doc.text('Managed by: IshConnect administrators');
  doc.text(`Timezone: ${classItem.timezone || 'UTC'} - ${classItem.schedule || 'Scheduled time not set'}`);
  doc.text(`Planned class start: ${classItem.startsAt ? new Date(classItem.startsAt).toLocaleString('en', { timeZone: classItem.timezone || 'UTC' }) : 'Not set'} - Planned duration: ${classItem.durationMinutes || 60} minutes`);
  doc.text(`Report ID: ${classItem._id.toString()} - Generated: ${new Date().toISOString()}`);
  if (req.query.from || req.query.to) doc.text(`Date range: ${req.query.from || 'Beginning'} to ${req.query.to || 'Present'}`);
  doc.moveDown(0.8);
  const attendedRows = rows.filter(({ entry }) => entry.attended).length;
  const totalRows = rows.length;
  const percent = totalRows ? Math.round((attendedRows / totalRows) * 100) : 0;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(`Sessions: ${sessions.length}   Student records: ${totalRows}   Attendance: ${percent}%`);
  doc.moveDown(1);
  writeTableHeader(doc);
  let activeSession = null;
  for (const { entry, session } of rows) {
    if (activeSession !== session._id.toString()) {
      activeSession = session._id.toString();
      if (doc.y > 730) { doc.addPage(); writeTableHeader(doc); }
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1d4ed8').text(`Session: ${new Date(session.startedAt).toLocaleString('en', { timeZone: classItem.timezone || 'UTC' })} - Ended ${session.endedAt ? new Date(session.endedAt).toLocaleString('en', { timeZone: classItem.timezone || 'UTC' }) : '-'} - Duration ${Math.round((session.report?.durationSeconds || 0) / 60)} min - Present ${session.report?.attendedCount || 0}/${session.report?.enrolledCount || 0}`);
      doc.moveDown(0.6);
      writeTableHeader(doc);
      if (session.report?.teacherNotes) {
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#475569').text(`Session remarks: ${session.report.teacherNotes}`, { width: pageWidth - margin * 2 });
        doc.moveDown(0.5);
      }
    }
    if (doc.y > 745) { doc.addPage(); writeTableHeader(doc); }
    const values = [entry.name, entry.email, new Date(session.startedAt).toLocaleDateString('en', { timeZone: classItem.timezone || 'UTC' }), entry.status || (entry.attended ? 'present' : 'absent'), entry.firstJoinedAt ? new Date(entry.firstJoinedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', timeZone: classItem.timezone || 'UTC' }) : '-', entry.lastLeftAt ? new Date(entry.lastLeftAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', timeZone: classItem.timezone || 'UTC' }) : '-', Math.round((entry.totalSeconds || 0) / 60)];
    let x = margin;
    doc.font('Helvetica').fontSize(7).fillColor('#1e293b');
    for (let index = 0; index < columns.length; index += 1) {
      doc.text(cellText(values[index], columns[index][1]), x, doc.y, { width: columns[index][1] - 3, lineBreak: false, ellipsis: true });
      x += columns[index][1];
    }
    doc.moveDown(0.9).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.5);
  }
  if (rows.length === 0) doc.font('Helvetica').fontSize(10).fillColor('#64748b').text('No attendance records match this report.');
  const pageRange = doc.bufferedPageRange();
  for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
    doc.switchToPage(index);
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`QuickLink - ${classItem.title} - Page ${index + 1} of ${pageRange.count}`, margin, 770, { width: pageWidth - margin * 2, align: 'center' });
  }
  doc.end();
});

export default { downloadAttendancePdf };
