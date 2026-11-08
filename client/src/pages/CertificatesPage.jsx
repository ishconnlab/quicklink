import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, BadgeCheck, ChevronLeft, ChevronRight, Download, ExternalLink, FilePenLine, RefreshCcw,
  Search, Share2, ShieldCheck, ShieldX, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, Modal, PageHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { formatDateTime } from '../lib/format.js';
import { isAdmin } from '../lib/roles.js';

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
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [descriptionTarget, setDescriptionTarget] = useState(null);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (admin) {
        const response = await api.get('/certificates/all', { params: { page, limit: 20, ...(status ? { status } : {}), ...(courseId ? { courseId } : {}), ...(query ? { search: query } : {}) } });
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
    api.get('/courses', { params: { manage: true, limit: 100 } })
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

  const download = async (certificate) => {
    setBusyId(certificate.id);
    try {
      const response = await api.get(`/certificates/${certificate.code}.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ishconnect-certificate-${certificate.code}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const share = async (certificate) => {
    const url = verifyUrl(certificate);
    try {
      if (navigator.share) await navigator.share({ title: `${certificate.courseTitle} certificate`, text: `Verified IshConnect certificate for ${certificate.studentName}`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Verification link copied.'); }
    } catch (error) { if (error.name !== 'AbortError') toast.error('Could not share the certificate link.'); }
  };

  const openRename = (certificate) => {
    setRenameTarget(certificate);
    setRenameValue(certificate.studentName || '');
  };

  const saveRename = async () => {
    if (!renameTarget || renameValue.trim().length < 2) return;
    setSaving(true);
    try {
      const response = await api.patch(`/certificates/${renameTarget.id}/name`, { studentName: renameValue.trim() });
      setCertificates((current) => current.map((item) => item.id === renameTarget.id ? response.data.data.certificate : item));
      toast.success('Certificate name updated.');
      setRenameTarget(null);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const saveDescription = async () => {
    if (!descriptionTarget) return;
    setSaving(true);
    try {
      const response = await api.patch(`/certificates/${descriptionTarget.id}/description`, { description: descriptionValue.trim() });
      setCertificates((current) => current.map((item) => item.id === descriptionTarget.id ? response.data.data.certificate : item));
      setDescriptionTarget(null);
      toast.success('Certificate description updated.');
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

  const validCount = certificates.filter((certificate) => !certificate.revoked).length;
  const revokedCount = certificates.filter((certificate) => certificate.revoked).length;

  return <div>
    <PageHeader
      eyebrow={admin ? 'Credential registry' : 'Your achievements'}
      title={admin ? 'Certificates' : 'My certificates'}
      subtitle={admin ? 'Search the registry, correct printed names, revoke credentials, and reissue with a fresh verification code. Issue new certificates from a training page.' : 'Download, share, and verify the certificates you earned through IshConnect trainings. Every certificate has a public verification page.'}
      actions={admin ? <Link to="/courses" className="btn-primary"><Award size={17} />Issue from trainings</Link> : <Link to="/courses" className="btn-secondary"><Sparkles size={17} />Find another training</Link>}
    />

    {admin && <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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
        {visible.map((certificate) => <article key={certificate.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm shadow-slate-900/[0.03] ${certificate.revoked ? 'border-red-200' : 'border-slate-200/80'}`}>
          <div className={`h-1 bg-gradient-to-r ${certificate.revoked ? 'from-red-400 to-rose-500' : 'from-brand-500 via-orange-500 to-amber-400'}`} />
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${certificate.revoked ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-brand-700'}`}>{certificate.revoked ? <ShieldX size={21} /> : <Award size={21} />}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><h2 className="break-words font-bold text-slate-900">{certificate.courseTitle}</h2><Badge color={certificate.revoked ? 'red' : 'green'}>{certificate.revoked ? 'Revoked' : 'Valid'}</Badge><Badge color="slate">{certificate.level}</Badge>{certificate.reissueCount > 0 && <Badge color="amber">Reissued {certificate.reissueCount}×</Badge>}</div>
                <p className="mt-1 text-sm text-slate-600">Awarded to <strong className="text-slate-800">{certificate.studentName}</strong></p>
                <p className="mt-1 break-all text-xs text-slate-400">Code {certificate.code} · Issued {formatDateTime(certificate.issuedAt)}</p>
                {certificate.revoked && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-700">Revoked {formatDateTime(certificate.revokedAt)}{certificate.revocationReason ? `: ${certificate.revocationReason}` : '.'}</p>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
              {!certificate.revoked && <button className="btn-primary" onClick={() => download(certificate)} disabled={busyId === certificate.id}>{busyId === certificate.id ? <Spinner size={15} /> : <Download size={15} />}PDF</button>}
              {!certificate.revoked && <button className="btn-secondary" onClick={() => share(certificate)}><Share2 size={15} />Share</button>}
              <a className="btn-secondary" href={verifyUrl(certificate)} target="_blank" rel="noreferrer"><ExternalLink size={15} />Verify</a>
              {admin && <>
                <Link to={`/courses/${certificate.courseId}`} className="btn-secondary"><Award size={15} />Training</Link>
                {!certificate.revoked && <button className="btn-secondary" onClick={() => openRename(certificate)}><FilePenLine size={15} />Name</button>}
                {!certificate.revoked && <button className="btn-secondary" onClick={() => { setDescriptionTarget(certificate); setDescriptionValue(certificate.description || ''); }}>Description</button>}
                {!certificate.revoked && <button className="btn-ghost text-red-600" onClick={() => { setRevokeTarget(certificate); setRevokeReason(''); }}>Revoke</button>}
                {certificate.revoked && <button className="btn-secondary" onClick={() => reissue(certificate)} disabled={busyId === certificate.id}>{busyId === certificate.id ? <Spinner size={15} /> : <RefreshCcw size={15} />}Reissue</button>}
              </>}
            </div>
          </div>
        </article>)}
      </div>
      {admin && pages > 1 && <nav className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Certificate pagination"><p className="text-xs text-slate-500">{total} certificate{total === 1 ? '' : 's'} · Page {page} of {pages}</p><div className="flex gap-2"><button className="btn-secondary min-h-9 px-3 text-xs" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} />Previous</button><button className="btn-secondary min-h-9 px-3 text-xs" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={15} /></button></div></nav>}
    </>}

    {admin && <Modal open={Boolean(renameTarget)} onClose={() => !saving && setRenameTarget(null)} title="Correct certificate name" footer={<><button className="btn-secondary" onClick={() => setRenameTarget(null)} disabled={saving}>Cancel</button><button className="btn-primary" onClick={saveRename} disabled={saving || renameValue.trim().length < 2}>{saving ? <Spinner size={16} /> : <FilePenLine size={16} />}Save name</button></>}>
      <div className="space-y-3"><p className="text-sm leading-6 text-slate-600">Use the student’s full legal name as it should appear on the printed certificate. The verification page and PDF update immediately.</p><label className="block"><span className="label">Printed student name</span><input className="input" minLength={2} maxLength={120} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus /></label></div>
    </Modal>}

    {admin && <Modal open={Boolean(descriptionTarget)} onClose={() => !saving && setDescriptionTarget(null)} title="Edit certificate description" footer={<><button className="btn-secondary" onClick={() => setDescriptionTarget(null)} disabled={saving}>Cancel</button><button className="btn-primary" onClick={saveDescription} disabled={saving}>{saving ? <Spinner size={16} /> : <FilePenLine size={16} />}Save description</button></>}>
      <label className="block"><span className="label">Printed description (up to 500 characters)</span><textarea className="input min-h-24" maxLength={500} value={descriptionValue} onChange={(event) => setDescriptionValue(event.target.value)} placeholder="Recognizing the learner's achievement and demonstrated skills." /></label>
    </Modal>}

    {admin && <Modal open={Boolean(revokeTarget)} onClose={() => !saving && setRevokeTarget(null)} title="Revoke certificate" footer={<><button className="btn-secondary" onClick={() => setRevokeTarget(null)} disabled={saving}>Cancel</button><button className="btn-danger" onClick={revoke} disabled={saving || revokeReason.trim().length < 3}>{saving ? <Spinner size={16} /> : <ShieldX size={16} />}Revoke certificate</button></>}>
      <div className="space-y-3"><p className="text-sm leading-6 text-slate-600">Revoking immediately marks <strong>{revokeTarget?.courseTitle}</strong> invalid on the public verification page and prevents the student from downloading it. The record is retained for audit.</p><label className="block"><span className="label">Reason for revocation</span><textarea className="input min-h-24" minLength={3} maxLength={1000} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="Explain why this certificate is being revoked." autoFocus /></label></div>
    </Modal>}
  </div>;
}
