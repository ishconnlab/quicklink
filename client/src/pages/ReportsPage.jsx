import { useEffect, useState, useMemo } from 'react';
import {
  FileText,
  Download,
  Eye,
  FileSpreadsheet,
  School,
  Building2,
  MapPin,
  CalendarRange,
  Layers,
  X,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal } from '../components/layout.jsx';
import { Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fetchReportBlob, triggerDownload, previewReportData } from '../lib/reports.js';
import { formatNumber, displayCount, TRADE_KEYS, TRADE_LABELS, formatDate } from '../lib/format.js';

const REPORT_TYPES = [
  { key: 'all', label: 'Complete report', desc: 'All recorded schools', icon: Layers },
  { key: 'holding', label: 'Holding / project', desc: 'Schools under a holding', icon: Building2 },
  { key: 'district', label: 'District', desc: 'Schools in a district', icon: MapPin },
  { key: 'range', label: 'Date range', desc: 'Records in a period', icon: CalendarRange },
  { key: 'school', label: 'Individual school', desc: 'A single school record', icon: School },
];

export default function ReportsPage() {
  const toast = useToast();
  const [type, setType] = useState('all');
  const [holding, setHolding] = useState('');
  const [district, setDistrict] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  // Reference data for pickers.
  useEffect(() => {
    api
      .get('/dashboard')
      .then((res) => {
        setHoldings(res.data.data.byHolding);
        setDistricts(res.data.data.byDistrict.map((d) => d.district));
      })
      .catch(() => {});
    api
      .get('/schools', { params: { limit: 200, status: 'active' } })
      .then((res) => setSchools(res.data.data.schools))
      .catch(() => {});
  }, []);

  // Release object URLs when they change.
  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  const params = useMemo(() => {
    const p = {};
    if (type === 'holding' && holding) p.holding = holding;
    if (type === 'district' && district) p.district = district;
    if (type === 'range') {
      if (from) p.from = from;
      if (to) p.to = to;
    }
    if (type === 'school' && schoolId) p.id = schoolId;
    return p;
  }, [type, holding, district, from, to, schoolId]);

  const canGenerate = () => {
    if (type === 'holding') return !!holding;
    if (type === 'district') return !!district;
    if (type === 'range') return !!from || !!to;
    if (type === 'school') return !!schoolId;
    return true;
  };

  const loadPreview = async () => {
    if (!canGenerate()) {
      toast.error('Please choose the report options first.');
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const data = await previewReportData(type, params);
      setPreview(data);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPdfPreview = async () => {
    if (!canGenerate()) {
      toast.error('Please choose the report options first.');
      return;
    }
    setPdfLoading(true);
    try {
      const blob = await fetchReportBlob('pdf', type, params);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!canGenerate()) {
      toast.error('Please choose the report options first.');
      return;
    }
    try {
      const blob = await fetchReportBlob('pdf', type, params);
      triggerDownload(blob, `quicklink-${type}-report.pdf`);
      toast.success('PDF downloaded.');
    } catch (err) {
      toast.error(apiError(err).message);
    }
  };

  const downloadCsv = async () => {
    if (!canGenerate()) {
      toast.error('Please choose the report options first.');
      return;
    }
    setCsvLoading(true);
    try {
      const blob = await fetchReportBlob('csv', type, params);
      triggerDownload(blob, `quicklink-${type}-report.csv`);
      toast.success('CSV downloaded.');
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate, preview and export PDF or CSV reports" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="card">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Report type</h2>
            <div className="space-y-2">
              {REPORT_TYPES.map((r) => {
                const Icon = r.icon;
                const active = type === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => setType(r.key)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${active ? 'text-brand-800' : 'text-slate-800'}`}>
                        {r.label}
                      </p>
                      <p className="truncate text-xs text-slate-400">{r.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Options</h2>
            {type === 'holding' && (
              <div>
                <label className="label">Holding / project</label>
                <select value={holding} onChange={(e) => setHolding(e.target.value)} className="input">
                  <option value="">Select a holding…</option>
                  {holdings.map((h) => (
                    <option key={h.id || h.name} value={h.id || ''}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {type === 'district' && (
              <div>
                <label className="label">District</label>
                <select value={district} onChange={(e) => setDistrict(e.target.value)} className="input">
                  <option value="">Select a district…</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {type === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
                </div>
              </div>
            )}
            {type === 'school' && (
              <div>
                <label className="label">School</label>
                <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className="input">
                  <option value="">Select a school…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.schoolName} — {s.district}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={loadPreview} disabled={previewLoading} className="btn-secondary">
                {previewLoading ? <Spinner size={16} /> : <Eye size={16} />} Preview
              </button>
              <button onClick={openPdfPreview} disabled={pdfLoading} className="btn-secondary">
                {pdfLoading ? <Spinner size={16} /> : <FileText size={16} />} PDF view
              </button>
              <button onClick={downloadPdf} className="btn-primary col-span-2">
                <Download size={16} /> Download PDF
              </button>
              <button onClick={downloadCsv} disabled={csvLoading} className="btn-secondary col-span-2">
                {csvLoading ? <Spinner size={16} /> : <FileSpreadsheet size={16} />} Download CSV
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card min-h-[300px]">
            {!preview ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                <FileText size={40} className="mb-3 opacity-50" />
                <p className="text-sm">
                  Choose a report type and options, then tap <b>Preview</b> to see the data.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{preview.report.title}</h2>
                    <p className="text-sm text-slate-500">{preview.report.subtitle}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {preview.report.holdingName} · {preview.report.districtName} ·{' '}
                      {preview.report.period}
                    </p>
                  </div>
                  {preview.incomplete > 0 && (
                    <Badge color="amber">{preview.incomplete} incomplete</Badge>
                  )}
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {TRADE_KEYS.map((k) => (
                    <div key={k} className="rounded-lg bg-slate-50 p-2 text-center">
                      <p className="text-[10px] font-medium uppercase text-slate-400">
                        {TRADE_LABELS[k]}
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatNumber(preview.totals[k])}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-brand-50 p-2 text-center">
                    <p className="text-[10px] font-medium uppercase text-brand-500">Schools</p>
                    <p className="text-sm font-bold text-brand-800">
                      {formatNumber(preview.totals.schools)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2 text-center">
                    <p className="text-[10px] font-medium uppercase text-emerald-500">Students</p>
                    <p className="text-sm font-bold text-emerald-800">
                      {formatNumber(preview.totals.students)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-medium uppercase text-slate-400">Laptops</p>
                    <p className="text-sm font-bold text-slate-800">
                      {formatNumber(preview.totals.laptops)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-medium uppercase text-slate-400">Teachers</p>
                    <p className="text-sm font-bold text-slate-800">
                      {formatNumber(preview.totals.teachers)}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">School</th>
                        <th className="px-3 py-2 font-medium">District</th>
                        {TRADE_KEYS.map((k) => (
                          <th key={k} className="px-2 py-2 text-right font-medium">
                            {TRADE_LABELS[k]}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-right font-medium">Total</th>
                        <th className="px-2 py-2 text-right font-medium">Laptops</th>
                        <th className="px-2 py-2 text-right font-medium">Teachers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.schools.map((s) => (
                        <tr key={s.id} className={s.isIncomplete ? 'bg-amber-50/50' : ''}>
                          <td className="px-3 py-2 font-medium text-slate-800">{s.schoolName}</td>
                          <td className="px-3 py-2 text-slate-500">{s.district}</td>
                          {TRADE_KEYS.map((k) => (
                            <td key={k} className="px-2 py-2 text-right text-slate-600">
                              {displayCount(s.trades[k])}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-right font-semibold text-slate-900">
                            {formatNumber(s.totalStudents)}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-600">
                            {displayCount(s.laptops)}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-600">
                            {displayCount(s.teachers)}
                          </td>
                        </tr>
                      ))}
                      {preview.schools.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                            No records match this report.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Generated date: {formatDate(new Date())}. The downloadable PDF also includes per-school
                  feedback, missing-data notes and page numbers.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={!!pdfUrl} onClose={() => setPdfUrl(null)} title="PDF preview" size="lg">
        <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-slate-200">
          {pdfUrl && <iframe title="PDF preview" src={pdfUrl} className="h-full w-full" />}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setPdfUrl(null)} className="btn-secondary">
            <X size={16} /> Close
          </button>
          <button onClick={downloadPdf} className="btn-primary">
            <Download size={16} /> Download
          </button>
        </div>
      </Modal>
    </div>
  );
}
