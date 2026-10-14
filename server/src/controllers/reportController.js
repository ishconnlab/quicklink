import { School, TRADE_KEYS, TRADE_LABELS } from '../models/School.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import buildReportPdf from '../services/reportService.js';

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(schools) {
  const headers = [
    'Holding/Project',
    'School Name',
    'District',
    'Date of Collection',
    'SOD',
    'NIT',
    'CSA',
    'ACC',
    'Other',
    'Total Students',
    'Laptops',
    'Teachers',
    'Status',
    'Incomplete',
    'Missing Fields',
    'Feedback',
    'Recorded By',
    'Created At',
  ];
  const rows = schools.map((s) => {
    const t = s.trades || {};
    const n = (v) => (v === null || v === undefined ? '' : v);
    return [
      s.holdingName,
      s.schoolName,
      s.district,
      s.dateOfCollection ? new Date(s.dateOfCollection).toISOString().slice(0, 10) : '',
      n(t.sod),
      n(t.nit),
      n(t.csa),
      n(t.acc),
      n(t.other),
      s.totalStudents ?? 0,
      n(s.laptops),
      n(s.teachers),
      s.status,
      s.isIncomplete ? 'YES' : 'NO',
      (s.incompleteFields || []).join('; '),
      s.feedback || '',
      s.recordedByName || '',
      s.createdAt ? new Date(s.createdAt).toISOString() : '',
    ].map(csvEscape);
  });
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

// The individual-school routes encode the id instead of a type param.
function resolveType(req) {
  return req.params.type || (req.params.id ? 'school' : null);
}

function buildFilter(query, ownerId) {
  const { holding, district, from, to, includeArchived } = query;
  const filter = { owner: ownerId };
  if (includeArchived !== 'true') filter.status = 'active';
  if (holding) filter.holding = holding;
  if (district) filter.district = district;
  if (from || to) {
    filter.dateOfCollection = {};
    if (from) filter.dateOfCollection.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.dateOfCollection.$lte = end;
    }
  }
  return filter;
}

async function loadSchools(req, type) {
  const ownerId = req.user._id;
  const filter = buildFilter(req.query, ownerId);
  let title = 'Complete School Data Report';
  let subtitle = 'All recorded schools';
  let holdingName = 'All holdings';
  let districtName = 'All districts';
  let period = 'All dates';

  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  if (type === 'school') {
    const { id } = req.params;
    const school = await School.findOne({ _id: id, owner: ownerId });
    if (!school) throw ApiError.notFound('School record not found');
    return {
      schools: [school],
      report: {
        title: 'Individual School Report',
        subtitle: school.schoolName,
        holdingName: school.holdingName,
        districtName: school.district,
        period: fmt(school.dateOfCollection),
      },
    };
  }

  if (type === 'holding') {
    const { holding } = req.query;
    if (!holding) throw ApiError.badRequest('holding is required for a holding report');
    const [first] = await School.find({ owner: ownerId, holding }).limit(1);
    holdingName = first?.holdingName || 'Selected holding';
    title = 'Holding / Project Report';
    subtitle = `All schools under ${holdingName}`;
  } else if (type === 'district') {
    const { district } = req.query;
    if (!district) throw ApiError.badRequest('district is required for a district report');
    districtName = district;
    title = 'District Report';
    subtitle = `All schools in ${district} district`;
  } else if (type === 'range') {
    const { from, to } = req.query;
    if (!from && !to) throw ApiError.badRequest('from and/or to date are required');
    title = 'Date-Range Report';
    subtitle = `Schools recorded between ${fmt(from) || 'beginning'} and ${fmt(to) || 'today'}`;
    period = `${fmt(from) || 'beginning'} – ${fmt(to) || 'today'}`;
  }

  const schools = await School.find(filter).sort({ holdingName: 1, schoolName: 1 });

  const [h, d] = await Promise.all([
    req.query.holding
      ? School.findOne({ owner: ownerId, holding: req.query.holding }).select('holdingName').lean()
      : Promise.resolve(null),
    Promise.resolve(req.query.district || null),
  ]);

  if (type !== 'holding' && h?.holdingName) holdingName = h.holdingName;
  if (type !== 'district' && d) districtName = d;
  if (type === 'range') holdingName = 'All holdings';

  return {
    schools,
    report: { title, subtitle, holdingName, districtName, period },
  };
}

export const generateReport = asyncHandler(async (req, res) => {
  const type = resolveType(req);
  const allowed = ['school', 'holding', 'district', 'all', 'range'];
  if (!allowed.includes(type)) throw ApiError.notFound('Unknown report type');

  const { schools, report } = await loadSchools(req, type);
  const pdf = await buildReportPdf(report, schools);

  const safeName = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="quicklink-${safeName}-${Date.now()}.pdf"`
  );
  res.setHeader('Content-Length', pdf.length);
  res.send(pdf);
});

export const exportCsv = asyncHandler(async (req, res) => {
  const type = resolveType(req);
  const { schools, report } = await loadSchools(req, type);
  const csv = toCsv(schools);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="quicklink-${report.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.csv"`
  );
  res.send(csv);
});

// Lightweight JSON preview data used by the in-app report preview screen.
export const previewReport = asyncHandler(async (req, res) => {
  const type = resolveType(req);
  const { schools, report } = await loadSchools(req, type);

  const totals = { sod: 0, nit: 0, csa: 0, acc: 0, other: 0 };
  let students = 0;
  let laptops = 0;
  let teachers = 0;
  for (const s of schools) {
    students += s.totalStudents || 0;
    if (typeof s.laptops === 'number') laptops += s.laptops;
    if (typeof s.teachers === 'number') teachers += s.teachers;
    for (const k of TRADE_KEYS) {
      const v = s.trades?.[k];
      if (typeof v === 'number') totals[k] += v;
    }
  }

  res.json({
    success: true,
    data: {
      report,
      schools: schools.map((s) => s.toClient()),
      totals: {
        ...totals,
        students,
        laptops,
        teachers,
        schools: schools.length,
      },
      incomplete: schools.filter((s) => s.isIncomplete).length,
    },
  });
});

export const meta = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      tradeLabels: TRADE_LABELS,
      reportTypes: [
        { key: 'school', label: 'Individual school report' },
        { key: 'holding', label: 'Holding / project report' },
        { key: 'district', label: 'District report' },
        { key: 'all', label: 'Complete report (all schools)' },
        { key: 'range', label: 'Date-range report' },
      ],
    },
  });
});

export default { generateReport, exportCsv, previewReport, meta };
