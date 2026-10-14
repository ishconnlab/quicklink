import PDFDocument from 'pdfkit';
import { TRADE_KEYS, TRADE_LABELS } from '../models/School.js';

const ORG_NAME = process.env.ORG_NAME || 'QuickLink Education Trust';
const ORG_SUBTITLE =
  process.env.ORG_SUBTITLE || 'School Data Collection & Monitoring Programme';

const COLORS = {
  primary: '#16a34a',
  primaryDark: '#15803d',
  headerText: '#ffffff',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#d1d5db',
  zebra: '#f3f4f6',
  warning: '#b45309',
  warningBg: '#fef3c7',
};

const PAGE = { size: 'A4', layout: 'landscape', margin: 36 };
const BOTTOM_LIMIT = () => doc.page.height - doc.page.margins.bottom - 30;

let doc;

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function displayCount(v) {
  // Unknown values are shown explicitly, never silently treated as zero.
  return v === null || v === undefined ? 'N/A' : String(v);
}

function drawHeader(report) {
  const { width } = doc.page;
  const left = PAGE.margin;

  // Logo mark
  doc.save();
  doc.roundedRect(left, PAGE.margin, 42, 42, 8).fill(COLORS.primary);
  doc
    .fillColor(COLORS.headerText)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('QL', left, PAGE.margin + 12, { width: 42, align: 'center' });
  doc.restore();

  doc
    .fillColor(COLORS.primaryDark)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(ORG_NAME, left + 54, PAGE.margin + 2, { width: width - left - 54 - PAGE.margin });
  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(9)
    .text(ORG_SUBTITLE, left + 54, PAGE.margin + 22);

  const y = PAGE.margin + 56;
  doc
    .moveTo(left, y)
    .lineTo(width - PAGE.margin, y)
    .strokeColor(COLORS.primary)
    .lineWidth(1.5)
    .stroke();

  doc
    .fillColor(COLORS.text)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(report.title, left, y + 14, { width: width - left - PAGE.margin });
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.muted);
  doc.text(report.subtitle || '', left, doc.y + 2, {
    width: width - left - PAGE.margin,
  });

  doc.moveDown(0.6);
  doc
    .fillColor(COLORS.text)
    .font('Helvetica')
    .fontSize(9);
  const metaParts = [
    `Holding / Project: ${report.holdingName || 'All holdings'}`,
    `District: ${report.districtName || 'All districts'}`,
    `Reporting period: ${report.period || 'All dates'}`,
  ];
  doc.text(metaParts.join('     |     '), { width: width - left - PAGE.margin });
  doc.moveDown(0.8);
}

const TABLE_COLUMNS = [
  { key: 'schoolName', label: 'School', width: 150, align: 'left' },
  { key: 'district', label: 'District', width: 90, align: 'left' },
  { key: 'sod', label: 'SOD', width: 42, align: 'right' },
  { key: 'nit', label: 'NIT', width: 42, align: 'right' },
  { key: 'csa', label: 'CSA', width: 42, align: 'right' },
  { key: 'acc', label: 'ACC', width: 42, align: 'right' },
  { key: 'other', label: 'Other', width: 48, align: 'right' },
  { key: 'total', label: 'Total', width: 48, align: 'right' },
  { key: 'laptops', label: 'Laptops', width: 55, align: 'right' },
  { key: 'teachers', label: 'Teachers', width: 58, align: 'right' },
];

function drawTableHeader(y) {
  const left = PAGE.margin;
  doc.save();
  doc.rect(left, y, TABLE_COLUMNS.reduce((a, c) => a + c.width, 0), 22).fill(COLORS.primary);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.headerText);
  let x = left;
  for (const col of TABLE_COLUMNS) {
    doc.text(col.label, x + 4, y + 7, {
      width: col.width - 8,
      align: col.align,
    });
    x += col.width;
  }
  doc.restore();
  return y + 22;
}

function rowValues(s) {
  const t = s.trades || {};
  return {
    schoolName: s.schoolName || '—',
    district: s.district || '—',
    sod: displayCount(t.sod),
    nit: displayCount(t.nit),
    csa: displayCount(t.csa),
    acc: displayCount(t.acc),
    other: displayCount(t.other),
    total: String(s.totalStudents ?? 0),
    laptops: displayCount(s.laptops),
    teachers: displayCount(s.teachers),
  };
}

function drawRow(y, values, zebra) {
  const left = PAGE.margin;
  const tableWidth = TABLE_COLUMNS.reduce((a, c) => a + c.width, 0);
  const rowHeight = 20;

  if (zebra) {
    doc.save();
    doc.rect(left, y, tableWidth, rowHeight).fill(COLORS.zebra);
    doc.restore();
  }

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text);
  let x = left;
  for (const col of TABLE_COLUMNS) {
    const text = values[col.key];
    doc.text(String(text), x + 4, y + 5, {
      width: col.width - 8,
      align: col.align,
      ellipsis: true,
      lineBreak: false,
    });
    x += col.width;
  }

  doc
    .moveTo(left, y + rowHeight)
    .lineTo(left + tableWidth, y + rowHeight)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();

  return y + rowHeight;
}

function drawFeedback(y, school) {
  if (!school.feedback) return y;
  const left = PAGE.margin;
  const tableWidth = TABLE_COLUMNS.reduce((a, c) => a + c.width, 0);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted);
  const text = `Feedback — ${school.schoolName}: ${school.feedback}`;
  const startY = y + 3;
  doc.text(text, left + 4, startY, { width: tableWidth - 8 });
  const endY = doc.y + 3;
  doc
    .moveTo(left, endY)
    .lineTo(left + tableWidth, endY)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
  return endY;
}

function ensureSpace(y, needed) {
  if (y + needed > BOTTOM_LIMIT()) {
    doc.addPage();
    return drawTableHeader(PAGE.margin);
  }
  return y;
}

function drawTable(schools) {
  let y = drawTableHeader(doc.y);
  const tableWidth = TABLE_COLUMNS.reduce((a, c) => a + c.width, 0);

  if (schools.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.muted);
    doc.text('No school records match this report.', PAGE.margin, y + 8, {
      width: tableWidth,
    });
    y = doc.y;
    return y;
  }

  schools.forEach((school, index) => {
    const feedbackLines = school.feedback
      ? Math.ceil(school.feedback.length / 150) + 1
      : 0;
    const estimated = 20 + feedbackLines * 11;
    y = ensureSpace(y, estimated);
    y = drawRow(y, rowValues(school), index % 2 === 1);
    y = drawFeedback(y, school);
  });

  return y;
}

function drawTotals(y, schools) {
  y = ensureSpace(y, 60);
  const left = PAGE.margin;
  const tableWidth = TABLE_COLUMNS.reduce((a, c) => a + c.width, 0);

  const totals = { sod: 0, nit: 0, csa: 0, acc: 0, other: 0 };
  let students = 0;
  let laptops = 0;
  let teachers = 0;
  for (const s of schools) {
    students += s.totalStudents || 0;
    laptops += s.laptops || 0;
    teachers += s.teachers || 0;
    for (const k of TRADE_KEYS) totals[k] += s.trades?.[k] || 0;
  }

  doc.save();
  doc.rect(left, y, tableWidth, 22).fill(COLORS.primaryDark);
  doc.fillColor(COLORS.headerText).font('Helvetica-Bold').fontSize(9);
  doc.text('COMBINED TOTALS', left + 4, y + 7, { width: 200 });
  let x = left + 150 + 90;
  const cells = [
    ['sod', totals.sod],
    ['nit', totals.nit],
    ['csa', totals.csa],
    ['acc', totals.acc],
    ['other', totals.other],
  ];
  const colAfter = TABLE_COLUMNS.slice(2);
  cells.forEach(([, val], i) => {
    const col = colAfter[i];
    doc.text(String(val), x + 4, y + 7, { width: col.width - 8, align: 'right' });
    x += col.width;
  });
  doc.text(String(students), x + 4, y + 7, {
    width: TABLE_COLUMNS[7].width - 8,
    align: 'right',
  });
  x += TABLE_COLUMNS[7].width;
  doc.text(String(laptops), x + 4, y + 7, {
    width: TABLE_COLUMNS[8].width - 8,
    align: 'right',
  });
  x += TABLE_COLUMNS[8].width;
  doc.text(String(teachers), x + 4, y + 7, {
    width: TABLE_COLUMNS[9].width - 8,
    align: 'right',
  });
  doc.restore();

  y += 32;

  // Trade breakdown summary
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text);
  doc.text('Trade breakdown', left, y);
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  const breakdown = TRADE_KEYS.map(
    (k) => `${TRADE_LABELS[k]}: ${totals[k]}`
  ).join('     ');
  doc.text(
    `${breakdown}     |     Total students: ${students}     |     Laptops: ${laptops}     |     Teachers: ${teachers}`,
    left,
    y,
    { width: tableWidth }
  );
  y = doc.y + 6;
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
  doc.text(`Schools in report: ${schools.length}`, left, y);
  return doc.y + 10;
}

function drawMissingDataNotes(y, schools) {
  const incomplete = schools.filter((s) => s.isIncomplete);
  y = ensureSpace(y, 40);
  const left = PAGE.margin;
  const width = doc.page.width - left - PAGE.margin;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.warning);
  doc.text('Missing-data notes', left, y);
  y = doc.y + 2;

  if (incomplete.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    doc.text('All records in this report are complete.', left, y);
    return doc.y;
  }

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text);
  for (const s of incomplete) {
    const line = `• ${s.schoolName} (${s.district}): missing ${s.incompleteFields
      .map((f) => f.replace('trades.', '').toUpperCase())
      .join(', ')}. Unknown values were not counted as zero.`;
    y = doc.y;
    if (y + 24 > BOTTOM_LIMIT()) {
      doc.addPage();
      y = PAGE.margin;
    }
    doc.text(line, left, y, { width });
  }
  return doc.y;
}

function addPageNumbers() {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { width } = doc.page;
    const y = doc.page.height - 28;
    doc
      .moveTo(PAGE.margin, y - 6)
      .lineTo(width - PAGE.margin, y - 6)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `Generated on ${formatDate(new Date())} at ${new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        PAGE.margin,
        y,
        { width: width / 2 }
      )
      .text(`Page ${i - range.start + 1} of ${range.count}`, width / 2, y, {
        width: width / 2 - PAGE.margin,
        align: 'right',
      });
  }
}

/**
 * Build a report PDF and resolve with the complete Buffer.
 * @param {Object} report { title, subtitle, holdingName, districtName, period }
 * @param {Array} schools Array of School documents
 */
export function buildReportPdf(report, schools) {
  return new Promise((resolve, reject) => {
    try {
      doc = new PDFDocument({
        size: PAGE.size,
        layout: PAGE.layout,
        margins: {
          top: PAGE.margin,
          bottom: PAGE.margin + 20,
          left: PAGE.margin,
          right: PAGE.margin,
        },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: report.title,
          Author: ORG_NAME,
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(report);
      let y = drawTable(schools);
      y = drawTotals(y, schools);
      drawMissingDataNotes(y, schools);
      addPageNumbers();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export default buildReportPdf;
