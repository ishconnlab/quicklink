import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Modal, PageHeader } from '../components/layout.jsx';
import { CheckCircle2, Download, Filter, MessageCircle, ReceiptText, Search, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime, formatMoney } from '../lib/format.js';

const paymentTone = { not_required: 'slate', unpaid: 'amber', pending: 'brand', paid: 'green', rejected: 'red', waived: 'green' };
const paymentLabel = { not_required: 'Not required', unpaid: 'Unpaid', pending: 'Pending review', paid: 'Paid', rejected: 'Rejected', waived: 'Waived' };
const csvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function AdminEnrollmentsPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: searchParams.get('search') || '', paymentStatus: searchParams.get('paymentStatus') || '', status: 'enrolled' });
  const [state, setState] = useState({ loading: true, enrollments: [], page: 1, pages: 1, total: 0 });
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ status: 'pending', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (page = 1) => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
      const response = await api.get('/admin/enrollments', { params: { ...query, page, limit: 20 } });
      setState({ loading: false, ...response.data.data });
      setSelected([]);
    } catch (error) {
      toast.error(apiError(error).message);
      setState((current) => ({ ...current, loading: false }));
    }
  }, [filters, toast]);

  useEffect(() => {
    const timer = setTimeout(() => load(1), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const pageIds = useMemo(() => state.enrollments.map((enrollment) => enrollment.id), [state.enrollments]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const openPayment = (enrollment) => {
    setEditing(enrollment);
    setPaymentForm({ status: enrollment.paymentStatus === 'not_required' ? 'pending' : enrollment.paymentStatus, note: enrollment.paymentNote || '' });
  };

  const updatePayment = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await api.patch(`/admin/enrollments/${editing.id}/payment`, paymentForm);
      setState((current) => ({ ...current, enrollments: current.enrollments.map((item) => item.id === editing.id ? { ...item, ...response.data.data.enrollment } : item) }));
      toast.success('Payment status updated and the student notified.');
      setEditing(null);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const exportCsv = (rows) => {
    const headers = ['Student', 'Email', 'WhatsApp', 'Country', 'Province', 'Training', 'Enrolled', 'Payment status', 'Amount', 'Currency', 'Reference', 'Attendance', 'Certificate'];
    const lines = rows.map((item) => [item.student?.name, item.student?.email, item.student?.whatsapp, item.student?.country, item.student?.province, item.class?.title, item.enrolledAt, paymentLabel[item.paymentStatus] || item.paymentStatus, item.paymentAmount, item.paymentCurrency, item.paymentReference, `${item.attendance?.attended || 0}/${item.attendance?.sessions || 0}`, item.certificate ? (item.certificate.revoked ? 'Revoked' : 'Issued') : 'Not issued'].map(csvValue).join(','));
    const blob = new Blob([[headers.map(csvValue).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ishconnect-enrollments.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div>
    <PageHeader
      eyebrow="Operations"
      title="Enrollments and payments"
      subtitle="Review every enrollment, follow attendance progress, verify mobile money references, and monitor certificate issuance."
      actions={<><button className="btn-secondary" onClick={() => exportCsv(selected.length ? state.enrollments.filter((item) => selected.includes(item.id)) : state.enrollments)}><Download size={16} />Export {selected.length ? 'selected' : 'page'}</button><Link to="/students" className="btn-primary"><UserRound size={16} />Students</Link></>}
    />

    <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-900/[0.03] sm:p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"><Filter size={14} className="text-brand-700" />Filter the ledger</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="relative"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input className="input pl-9" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search student, email, WhatsApp, or training" aria-label="Search enrollments" /></label>
        <select className="input" value={filters.paymentStatus} onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })} aria-label="Filter by payment status"><option value="">All payment statuses</option>{Object.entries(paymentLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className="input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by enrollment status"><option value="enrolled">Active enrollments</option><option value="cancelled">Cancelled enrollments</option><option value="">All enrollments</option></select>
      </div>
      <p className="mt-2 text-xs text-slate-400">{state.total} enrollment{state.total === 1 ? '' : 's'}</p>
    </div>

    {state.loading ? <PageLoader label="Loading the enrollment ledger…" /> : !state.enrollments.length ? <EmptyState icon={ReceiptText} title="No enrollments found" description="Adjust the filters or enroll students from a training." /> : <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] xl:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
            <tr><th className="w-10 px-3 py-3"><input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? pageIds : [])} aria-label="Select all enrollments on this page" /></th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Training</th><th className="px-3 py-3">Enrolled</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3">Attendance</th><th className="px-3 py-3">Certificate</th><th className="px-3 py-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {state.enrollments.map((enrollment) => <tr key={enrollment.id} className="align-top transition hover:bg-green-50/30">
              <td className="px-3 py-3"><input type="checkbox" checked={selected.includes(enrollment.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, enrollment.id] : selected.filter((id) => id !== enrollment.id))} aria-label={`Select ${enrollment.student?.name}`} /></td>
              <td className="px-3 py-3"><p className="font-semibold text-slate-900">{enrollment.student?.name || 'Student'}</p><p className="text-xs text-slate-500">{enrollment.student?.email}</p>{enrollment.student?.whatsapp && <p className="text-xs text-emerald-700">{enrollment.student.whatsapp}</p>}</td>
              <td className="px-3 py-3 text-xs text-slate-600">{enrollment.student?.province || '—'}{enrollment.student?.country ? `, ${enrollment.student.country}` : ''}</td>
              <td className="max-w-48 px-3 py-3"><Link to={`/courses/${enrollment.class?.id}`} className="line-clamp-2 font-medium text-brand-800 hover:underline">{enrollment.class?.title || 'Training'}</Link><p className="text-xs text-slate-400">{enrollment.class?.level}</p></td>
              <td className="px-3 py-3 text-xs text-slate-500">{formatDateTime(enrollment.enrolledAt)}</td>
              <td className="px-3 py-3"><Badge color={paymentTone[enrollment.paymentStatus] || 'slate'}>{paymentLabel[enrollment.paymentStatus] || enrollment.paymentStatus}</Badge>{enrollment.paymentReference && <p className="mt-1 max-w-36 truncate text-[11px] text-slate-400" title={enrollment.paymentReference}>Ref: {enrollment.paymentReference}</p>}{enrollment.paymentAmount > 0 && <p className="text-[11px] font-semibold text-slate-600">{formatMoney(enrollment.paymentAmount, enrollment.paymentCurrency)}</p>}</td>
              <td className="px-3 py-3"><span className="font-semibold text-slate-700">{enrollment.attendance?.attended || 0}</span><span className="text-slate-400"> / {enrollment.attendance?.sessions || 0}</span><p className="text-[11px] text-slate-400">sessions</p></td>
              <td className="px-3 py-3">{enrollment.certificate ? <Badge color={enrollment.certificate.revoked ? 'red' : 'green'}>{enrollment.certificate.revoked ? 'Revoked' : 'Issued'}</Badge> : <span className="text-xs text-slate-400">Not issued</span>}</td>
              <td className="px-3 py-3 text-right"><div className="flex justify-end gap-1.5"><button className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs" onClick={() => openPayment(enrollment)} disabled={enrollment.paymentStatus === 'not_required'}><ShieldCheck size={14} />Payment</button>{enrollment.student?.whatsapp && <a className="btn-ghost min-h-0 px-2 py-1.5" href={`https://wa.me/${enrollment.student.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" aria-label={`Message ${enrollment.student.name} on WhatsApp`}><MessageCircle size={15} /></a>}</div></td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {state.enrollments.map((enrollment) => <article key={enrollment.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-slate-900">{enrollment.student?.name || 'Student'}</p><p className="truncate text-xs text-slate-500">{enrollment.student?.email}</p><p className="mt-0.5 text-xs text-slate-500">{enrollment.student?.whatsapp || 'No WhatsApp'} · {enrollment.student?.province || 'No province'}, {enrollment.student?.country || ''}</p></div><input type="checkbox" checked={selected.includes(enrollment.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, enrollment.id] : selected.filter((id) => id !== enrollment.id))} aria-label={`Select ${enrollment.student?.name}`} /></div>
          <Link to={`/courses/${enrollment.class?.id}`} className="mt-3 block text-sm font-semibold text-brand-800">{enrollment.class?.title}</Link>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge color={paymentTone[enrollment.paymentStatus] || 'slate'}>{paymentLabel[enrollment.paymentStatus] || enrollment.paymentStatus}</Badge><Badge>{enrollment.attendance?.attended || 0}/{enrollment.attendance?.sessions || 0} attended</Badge>{enrollment.certificate && <Badge color={enrollment.certificate.revoked ? 'red' : 'green'}>{enrollment.certificate.revoked ? 'Certificate revoked' : 'Certificate issued'}</Badge>}</div>
          {enrollment.paymentReference && <p className="mt-2 break-all rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">Reference: {enrollment.paymentReference}</p>}
          <div className="mt-3 flex flex-wrap gap-2"><button className="btn-secondary flex-1" onClick={() => openPayment(enrollment)} disabled={enrollment.paymentStatus === 'not_required'}><Wallet size={15} />Payment</button>{enrollment.student?.whatsapp && <a className="btn-secondary" href={`https://wa.me/${enrollment.student.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a>}</div>
        </article>)}
      </div>

      {state.pages > 1 && <div className="mt-5 flex items-center justify-center gap-3"><button className="btn-secondary" disabled={state.page <= 1} onClick={() => load(state.page - 1)}>Previous</button><span className="text-sm text-slate-500">Page {state.page} of {state.pages}</span><button className="btn-secondary" disabled={state.page >= state.pages} onClick={() => load(state.page + 1)}>Next</button></div>}
    </>}

    <Modal open={Boolean(editing)} onClose={() => !saving && setEditing(null)} title="Verify payment" footer={<><button className="btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button><button className="btn-primary" onClick={updatePayment} disabled={saving}>{saving ? <Spinner size={16} /> : <CheckCircle2 size={16} />}{saving ? 'Saving…' : 'Save status'}</button></>}>
      {editing && <div className="space-y-4">
        <div className="rounded-xl bg-green-50/70 p-3 text-sm"><p className="font-bold text-slate-900">{editing.student?.name}</p><p className="text-xs text-slate-500">{editing.class?.title} · {editing.student?.whatsapp}</p><p className="mt-2 text-xs text-slate-600">Reference: <span className="font-mono font-semibold">{editing.paymentReference || 'Not submitted'}</span></p>{editing.paymentAmount > 0 && <p className="mt-1 text-xs font-semibold text-slate-700">Expected: {formatMoney(editing.paymentAmount, editing.paymentCurrency)}</p>}{editing.paymentNote && <p className="mt-1 text-xs text-slate-500">Student note: {editing.paymentNote}</p>}</div>
        <label className="block"><span className="label">Payment status</span><select className="input" value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value })}><option value="pending">Pending review</option><option value="paid">Paid — confirmed</option><option value="waived">Waived</option><option value="rejected">Rejected — needs attention</option></select></label>
        <label className="block"><span className="label">Note to student</span><textarea className="input min-h-24" maxLength={1000} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} placeholder="Explain any issue or confirmation details." /></label>
        <p className="text-xs text-slate-400">The student receives an in-app notification for paid, waived, rejected, and pending statuses.</p>
      </div>}
    </Modal>
  </div>;
}
