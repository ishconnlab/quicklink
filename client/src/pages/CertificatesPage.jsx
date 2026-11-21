import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, BadgeCheck, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, FilePenLine, FilePlus2, RefreshCcw,
  Search, Share2, ShieldCheck, ShieldX, Sparkles, Trash2, ChevronDown,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, Modal, PageHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { formatDateTime } from '../lib/format.js';
import { isAdmin } from '../lib/roles.js';

const PAGE_SIZE = 10;
const paymentStatusLabels = {
  unpaid: 'Payment required',
  pending: 'Payment pending',
  paid: 'Paid',
  rejected: 'Payment rejected',
  waived: 'Waived',
};
const paymentStatusColors = { unpaid: 'amber', pending: 'amber', paid: 'green', rejected: 'red', waived: 'green' };
const todayDateInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const emptyManualCertificate = () => ({
  studentName: '',
  courseTitle: '',
  description: '',
  level: 'Training',
  issueDate: todayDateInput(),
});

export default function CertificatesPage() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const toast = useToast();
  const dialog = useDialog();
  const [certificates, setCertificates] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [printTarget, setPrintTarget] = useState(null);
  const [printDetails, setPrintDetails] = useState({ studentName: '', courseTitle: '', description: '' });
  const [previewTarget, setPreviewTarget] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManualCertificate);
  const [creatingManual, setCreatingManual] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (admin) {
        const response = await api.get('/certificates/all', { timeout: 90000, params: { page, limit: PAGE_SIZE, ...(status ? { status } : {}), ...(courseId ? { courseId } : {}), ...(query ? { search: query } : {}) } });
        setCertificates(response.data.data.certificates);
        setTotal(response.data.data.total);
        setPages(response.data.data.pages);
      } else {
        const response = await api.get('/certificates/mine');
        setCertificates(response.data.data.certificates);
        setTotal(response.data.data.certificates.length);
      }
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [admin, courseId, page, query, status, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    api.get('/courses', { timeout: 90000, params: { manage: true, limit: 100 } })
      .then((response) => setCourses(response.data.data.courses))
      .catch((error) => toast.error(apiError(error).message));
  }, [admin, toast]);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const visible = useMemo(() => {
    if (admin) return certificates;
    const term = search.trim().toLowerCase();
    if (!term) return certificates;
    return certificates.filter((certificate) => `${certificate.courseTitle} ${certificate.level} ${certificate.code} ${certificate.studentName}`.toLowerCase().includes(term));
  }, [admin, certificates, search]);

  const verifyUrl = (certificate) => `${window.location.origin}${certificate.verificationPath || `/verify/${certificate.code}`}`;

  const openPreview = async (certificate) => {
    setBusyId(certificate.id);
    try {
      const response = await api.get(`/certificates/${certificate.code}.pdf`, { timeout: 120000, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      setPreviewUrl(url);
      setPreviewTarget(certificate);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const download = async (certificate) => {
    setBusyId(certificate.id);
    try {
      const response = await api.get(`/certificates/${certificate.code}.pdf`, { timeout: 120000, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ishconnect-certificate-${certificate.code}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const closePreview = () => { setPreviewTarget(null); setPreviewUrl(''); };

  const downloadPreview = () => {
    if (!previewUrl || !previewTarget) return;
    const anchor = document.createElement('a');
    anchor.href = previewUrl;
    anchor.download = `ishconnect-certificate-${previewTarget.code}.pdf`;
    anchor.click();
  };

  const share = async (certificate) => {
    const url = verifyUrl(certificate);
    try {
      if (navigator.share) await navigator.share({ title: `${certificate.courseTitle} certificate`, text: `Verified QuickLink certificate for ${certificate.studentName}`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Verification link copied.'); }
    } catch (error) { if (error.name !== 'AbortError') toast.error('Could not share the certificate link.'); }
  };

  const openPrintEditor = (certificate) => {
    setPrintTarget(certificate);
    setPrintDetails({ studentName: certificate.studentName || '', courseTitle: certificate.courseTitle || '', description: certificate.description || '' });
  };

  const savePrintDetails = async () => {
    if (!printTarget || printDetails.studentName.trim().length < 2 || printDetails.courseTitle.trim().length < 2) return;
    setSaving(true);
    try {
      const response = await api.patch(`/certificates/${printTarget.id}/print-details`, {
        studentName: printDetails.studentName.trim(),
        courseTitle: printDetails.courseTitle.trim(),
        description: printDetails.description.trim(),
      });
      setCertificates((current) => current.map((item) => item.id === printTarget.id ? response.data.data.certificate : item));
      setPrintTarget(null);
      toast.success('Certificate print details updated. Preview before downloading.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const revoke = async () => {
    if (!revokeTarget || revokeReason.trim().length < 3) return;
    setSaving(true);
    try {
      const response = await api.patch(`/certificates/${revokeTarget.id}/revoke`, { reason: revokeReason.trim() });
      setCertificates((current) => current.map((item) => item.id === revokeTarget.id ? response.data.data.certificate : item));
      toast.success('Certificate revoked. Public verification now shows the revoked status.');
      setRevokeTarget(null);
      setRevokeReason('');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const reissue = async (certificate) => {
    const approved = await dialog.confirm({ title: 'Reissue this certificate?', message: 'A new verification code will be generated and the previous code will stop verifying. The certificate remains linked to the same student and training.', confirmLabel: 'Reissue certificate' });
    if (!approved) return;
    setBusyId(certificate.id);
    try {
      const response = await api.post(`/certificates/${certificate.id}/reissue`, { reason: 'Administrative reissue' });
      setCertificates((current) => current.map((item) => item.id === certificate.id ? response.data.data.certificate : item));
      toast.success('Certificate reissued with a new verification code.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const deleteCertificate = async (certificate) => {
    const approved = await dialog.confirm({ title: 'Delete certificate record?', message: `Permanently remove ${certificate.studentName}'s certificate for ${certificate.courseTitle}. This also removes its public verification record.`, confirmLabel: 'Delete certificate' });
    if (!approved) return;
    setBusyId(certificate.id);
    try {
      await api.delete(`/certificates/${certificate.id}`);
      setCertificates((current) => current.filter((item) => item.id !== certificate.id));
      const nextTotal = Math.max(0, total - 1);
      setTotal(nextTotal);
      if (certificates.length === 1 && page > 1) setPage(Math.max(1, Math.ceil(nextTotal / PAGE_SIZE)));
      toast.success('Certificate record deleted.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };


  const createManualCertificate = async (event) => {
    event.preventDefault();
    setCreatingManual(true);
    try {
      const response = await api.post('/certificates/manual', {
        studentName: manualForm.studentName.trim(),
        courseTitle: manualForm.courseTitle.trim(),
        description: manualForm.description.trim(),
        level: manualForm.level,
        issuedAt: new Date(`${manualForm.issueDate}T12:00:00.000Z`).toISOString(),
      });
      setCertificates((current) => [response.data.data.certificate, ...current].slice(0, PAGE_SIZE));
      setTotal((current) => current + 1);
      setPage(1);
      setSearch('');
      setQuery('');
      setStatus('');
      setCourseId('');
      setManualOpen(false);
      setManualForm(emptyManualCertificate());
      toast.success('Manual certificate created and added to the registry.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setCreatingManual(false); }
  };

  const validCount = certificates.filter((certificate) => !certificate.revoked).length;
  const revokedCount = certificates.filter((certificate) => certificate.revoked).length;

  return <div>
    <PageHeader
      eyebrow={admin ? 'Credential registry' : 'Your achievements'}
      title={admin ? 'Certificates' : 'My certificates'}
      subtitle={admin ? 'Search the registry, correct printed names, revoke credentials, and reissue with a fresh verification code. Issue new certificates from a training page.' : 'Download, share, and verify the certificates you earned through QuickLink trainings. Every certificate has a public verification page.'}
      actions={admin ? <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => { setManualForm(emptyManualCertificate()); setManualOpen(true); }}><FilePlus2 size={16} />Create manual certificate</button><Link to="/courses" className="btn-primary"><Award size={17} />Issue from trainings</Link></div> : <Link to="/courses" className="btn-secondary"><Sparkles size={17} />Find another training</Link>}
    />

    {admin && <div className="mb-5 grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <StatCard label="Registry total" value={total} icon={Award} accent="brand" hint={query ? 'Matching this search' : 'All issued certificates'} />
      <StatCard label="Valid on page" value={validCount} icon={BadgeCheck} accent="green" hint={`${certificates.length} loaded`} />
      <StatCard label="Revoked on page" value={revokedCount} icon={ShieldX} accent={revokedCount ? 'red' : 'slate'} hint="Publicly marked invalid" />
      <StatCard label="Verification" value="Public" icon={ShieldCheck} accent="purple" hint="QR and share links" />
    </div>}

    {admin && <section className="mb-4 grid gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-900/[0.03] sm:grid-cols-[minmax(0,1fr)_10rem_13rem] sm:p-4">
      <label className="relative block"><span className="sr-only">Search certificates</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, training, or code" /></label>
      <label><span className="sr-only">Filter by status</span><select className="input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="valid">Valid only</option><option value="revoked">Revoked only</option></select></label>
      <label><span className="sr-only">Filter by training</span><select className="input" value={courseId} onChange={(event) => { setCourseId(event.target.value); setPage(1); }}><option value="">All trainings</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
    </section>}

    {!admin && certificates.length > 0 && <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="relative block"><span className="sr-only">Search your certificates</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your certificates" /></label><button className="btn-secondary" onClick={load} disabled={loading}>{loading ? <Spinner size={16} /> : <RefreshCcw size={16} />}Refresh</button></div>}

    {loading && !certificates.length ? <PageLoader label="Loading certificates…" /> : visible.length === 0 ? <EmptyState icon={Award} title={certificates.length ? 'No matching certificates' : admin ? 'No certificates issued' : 'No certificates yet'} description={certificates.length ? 'Try changing the search or filters.' : admin ? 'Open a training, verify completion, then issue individual or bulk certificates.' : 'Complete all training requirements, including the assessment and project when required, to unlock your certificate.'} action={!certificates.length && (admin ? <Link to="/courses" className="btn-primary">Open trainings</Link> : <Link to="/courses" className="btn-primary">Browse trainings</Link>)} /> : <>
      <div className="space-y-3">
        {visible.map((certificate) => <article key={certificate.id} className={`relative rounded-2xl border bg-white shadow-sm shadow-slate-900/[0.03] ${certificate.revoked ? 'border-red-200' : 'border-slate-200/80'}`}>
          <div className={`h-1 rounded-t-2xl ${certificate.revoked ? 'bg-red-500' : 'bg-brand-600'}`} />
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${certificate.revoked ? 'bg-red-50 text-red-600' : 'bg-green-50 text-brand-700'}`}>{certificate.revoked ? <ShieldX size={21} /> : <Award size={21} />}</span>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-bold leading-snug text-slate-900 sm:text-lg">{certificate.courseTitle}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge color={certificate.revoked ? 'red' : 'green'}>{certificate.revoked ? 'Revoked' : 'Valid'}</Badge>
                  <Badge color="slate">{certificate.level}</Badge>
                  {admin && certificate.paymentStatus && certificate.paymentStatus !== 'not_required' && <Badge color={paymentStatusColors[certificate.paymentStatus] || 'slate'}>{paymentStatusLabels[certificate.paymentStatus] || `Payment: ${certificate.paymentStatus}`}</Badge>}
                  {certificate.kind === 'manual' && <Badge color="slate">Manual issue</Badge>}
                  {certificate.reissueCount > 0 && <Badge color="amber">Reissued {certificate.reissueCount}×</Badge>}
                </div>
                <p className="mt-2 text-sm text-slate-600">Awarded to <strong className="text-slate-800">{certificate.studentName}</strong></p>
                <p className="mt-1 break-all text-xs text-slate-500">Code {certificate.code}</p>
                <p className="mt-1 text-xs text-slate-500">Issued {formatDateTime(certificate.issuedAt)}</p>
                {certificate.printDetailsUpdatedAt && <p className="mt-1 text-[11px] font-medium text-amber-700">Admin edited · {formatDateTime(certificate.printDetailsUpdatedAt)}</p>}
                {certificate.revoked && <p className="mt-3 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-700">Revoked {formatDateTime(certificate.revokedAt)}{certificate.revocationReason ? `: ${certificate.revocationReason}` : '.'}</p>}
              </div>
            </div>

            {!certificate.revoked && <button type="button" onClick={() => openPreview(certificate)} disabled={busyId === certificate.id} className="w-full max-w-[14rem] justify-self-start rounded-xl border border-green-200 bg-green-50/40 p-2 text-left transition hover:border-green-500 hover:bg-green-50 disabled:cursor-wait disabled:opacity-60 lg:justify-self-end" aria-label={`Open certificate preview for ${certificate.studentName}`}>
              <span className="block rounded-lg border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
                <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-green-800">QuickLink · Certificate</span>
                <span className="mt-2 block truncate text-xs font-semibold text-slate-800">{certificate.studentName}</span>
                <span className="mt-1 block truncate text-[10px] text-slate-500">{certificate.description || 'has successfully completed'}</span>
                <span className="mt-1 block truncate text-xs font-bold text-green-900">{certificate.courseTitle}</span>
              </span>
              <span className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-green-800">{busyId === certificate.id ? <Spinner size={13} /> : <Eye size={13} />}{busyId === certificate.id ? 'Loading preview…' : 'Preview certificate'}</span>
            </button>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            {!certificate.revoked && <button className="btn-secondary" onClick={() => download(certificate)} disabled={busyId === certificate.id}><Download size={15} />Download PDF</button>}
            {!certificate.revoked && <button className="btn-secondary" onClick={() => share(certificate)}><Share2 size={15} />Share</button>}
            <a className="btn-secondary" href={verifyUrl(certificate)} target="_blank" rel="noreferrer"><ExternalLink size={15} />Verify</a>
            {admin && <details className="relative ml-auto">
              <summary className="btn-secondary list-none cursor-pointer"><span>More actions</span><ChevronDown size={15} /></summary>
              <div className="absolute right-0 top-full z-50 mt-1 flex min-w-48 flex-col rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {certificate.courseId && <Link to={`/courses/${certificate.courseId}`} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"><Award size={15} className="mr-2 inline" />Training</Link>}
                {!certificate.revoked && <button className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => openPrintEditor(certificate)}><FilePenLine size={15} className="mr-2 inline" />Edit print details</button>}
                {!certificate.revoked && <button className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50" onClick={() => { setRevokeTarget(certificate); setRevokeReason(''); }}><ShieldX size={15} className="mr-2 inline" />Revoke</button>}
                {certificate.revoked && <button className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => reissue(certificate)} disabled={busyId === certificate.id}>{busyId === certificate.id ? <Spinner size={15} className="mr-2 inline" /> : <RefreshCcw size={15} className="mr-2 inline" />}Reissue</button>}
                <button className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => deleteCertificate(certificate)} disabled={busyId === certificate.id}>{busyId === certificate.id ? <Spinner size={15} className="mr-2 inline" /> : <Trash2 size={15} className="mr-2 inline" />}Delete certificate</button>
              </div>
            </details>}
          </div>
        </article>)}
      </div>
      {admin && pages > 1 && <nav className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Certificate pagination"><p className="text-xs text-slate-500">{total} certificate{total === 1 ? '' : 's'} · Page {page} of {pages}</p><div className="flex gap-2"><button className="btn-secondary min-h-9 px-3 text-xs" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} />Previous</button><button className="btn-secondary min-h-9 px-3 text-xs" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></div></nav>}
    </>}

    {admin && <Modal open={manualOpen} onClose={() => !creatingManual && setManualOpen(false)} title="Create manual certificate" footer={<><button className="btn-secondary" type="button" onClick={() => setManualOpen(false)} disabled={creatingManual}>Cancel</button><button className="btn-primary" type="submit" form="manual-certificate-form" disabled={creatingManual || manualForm.studentName.trim().length < 2 || manualForm.courseTitle.trim().length < 2}>{creatingManual ? <Spinner size={16} /> : <FilePlus2 size={16} />}Generate certificate</button></>}>
      <form id="manual-certificate-form" onSubmit={createManualCertificate} className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">Create a standalone certificate without selecting a student account or changing the normal course-completion issuance flow. The certificate will be verifiable by its generated code, but will not appear in a learner’s account.</p>
        <label className="block"><span className="label">Student name</span><input className="input" required minLength={2} maxLength={120} value={manualForm.studentName} onChange={(event) => setManualForm((current) => ({ ...current, studentName: event.target.value }))} autoFocus /></label>
        <label className="block"><span className="label">Course or programme title</span><input className="input" required minLength={2} maxLength={160} value={manualForm.courseTitle} onChange={(event) => setManualForm((current) => ({ ...current, courseTitle: event.target.value }))} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Level</span><select className="input" value={manualForm.level} onChange={(event) => setManualForm((current) => ({ ...current, level: event.target.value }))}>{['L3', 'L4', 'L5', 'Bootcamp', 'Training'].map((level) => <option key={level}>{level}</option>)}</select></label>
          <label className="block"><span className="label">Issue date</span><input className="input" type="date" required value={manualForm.issueDate} onChange={(event) => setManualForm((current) => ({ ...current, issueDate: event.target.value }))} /></label>
        </div>
        <label className="block"><span className="label">Completion statement</span><textarea className="input min-h-20" maxLength={240} value={manualForm.description} onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))} /><span className="mt-1 block text-xs text-slate-500">Optional; leave blank to use “has successfully completed”.</span></label>
      </form>
    </Modal>}

    {admin && <Modal open={Boolean(printTarget)} onClose={() => !saving && setPrintTarget(null)} title="Edit certificate before printing" footer={<><button className="btn-secondary" onClick={() => setPrintTarget(null)} disabled={saving}>Cancel</button><button className="btn-primary" onClick={savePrintDetails} disabled={saving || printDetails.studentName.trim().length < 2 || printDetails.courseTitle.trim().length < 2}>{saving ? <Spinner size={16} /> : <FilePenLine size={16} />}Save print details</button></>}>
      <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">These edits apply to this certificate only. Save them, then preview the PDF before downloading.</p>
        <label className="block"><span className="label">Student name on certificate</span><input className="input" minLength={2} maxLength={120} value={printDetails.studentName} onChange={(event) => setPrintDetails((current) => ({ ...current, studentName: event.target.value }))} autoFocus /></label>
        <label className="block"><span className="label">Course name on certificate</span><input className="input" minLength={2} maxLength={160} value={printDetails.courseTitle} onChange={(event) => setPrintDetails((current) => ({ ...current, courseTitle: event.target.value }))} /></label>
        <label className="block"><span className="label">Completion statement</span><textarea className="input min-h-20" maxLength={240} value={printDetails.description} onChange={(event) => setPrintDetails((current) => ({ ...current, description: event.target.value }))} placeholder="has successfully completed" /><span className="mt-1 block text-xs leading-5 text-slate-500">Printed above the course name. Leave blank to use “has successfully completed”. Maximum 240 characters.</span></label>
        <div className="rounded-xl border border-green-100 bg-green-50 p-3"><p className="eyebrow text-green-800">Certificate text preview</p><p className="mt-2 break-words text-sm font-semibold text-slate-900">{printDetails.studentName || 'Student name'}</p><p className="mt-1 break-words text-sm text-slate-600">{printDetails.description.trim() || 'has successfully completed'}</p><p className="mt-1 break-words text-base font-bold text-green-900">{printDetails.courseTitle || 'Course name'}</p></div>
      </div>
    </Modal>}

    <Modal open={Boolean(previewTarget && previewUrl)} onClose={closePreview} title={`Certificate preview · ${previewTarget?.studentName || ''}`} size="reader" footer={<><button className="btn-secondary" onClick={closePreview}>Close preview</button><button className="btn-primary" onClick={downloadPreview}><Download size={16} />Download PDF</button></>}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><iframe title={`Certificate preview for ${previewTarget?.studentName || 'student'}`} src={previewUrl} className="h-[70dvh] min-h-[420px] w-full bg-white" /></div>
    </Modal>

    {admin && <Modal open={Boolean(revokeTarget)} onClose={() => !saving && setRevokeTarget(null)} title="Revoke certificate" footer={<><button className="btn-secondary" onClick={() => setRevokeTarget(null)} disabled={saving}>Cancel</button><button className="btn-danger" onClick={revoke} disabled={saving || revokeReason.trim().length < 3}>{saving ? <Spinner size={16} /> : <ShieldX size={16} />}Revoke certificate</button></>}>
      <div className="space-y-3"><p className="text-sm leading-6 text-slate-600">Revoking immediately marks <strong>{revokeTarget?.courseTitle}</strong> invalid on the public verification page and prevents the student from downloading it. The record is retained for audit.</p><label className="block"><span className="label">Reason for revocation</span><textarea className="input min-h-24" minLength={3} maxLength={1000} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="Explain why this certificate is being revoked." autoFocus /></label></div>
    </Modal>}
  </div>;
}
