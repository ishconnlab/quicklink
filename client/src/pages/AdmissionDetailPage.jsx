import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  GraduationCap,
  Send,
  UserPlus,
  Copy,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal } from '../components/layout.jsx';
import { PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDate, formatDateTime } from '../lib/format.js';

const STATUS_COLORS = {
  draft: 'slate',
  submitted: 'amber',
  under_review: 'amber',
  incomplete: 'red',
  accepted: 'brand',
  rejected: 'red',
  enrolled: 'green',
};

const PARENT_STATUS_COLORS = {
  pending: 'slate',
  preparing: 'amber',
  ready: 'green',
  unavailable: 'red',
  submitted: 'brand',
};

export default function AdmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

  const [application, setApplication] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [links, setLinks] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', relationship: '', phone: '' });
  const [inviteResult, setInviteResult] = useState(null);

  const loadRelated = useCallback(async (studentId) => {
    if (!studentId) {
      setChecklist(null);
      setLinks([]);
      setInvitations([]);
      return;
    }
    const [cl, lk, inv] = await Promise.all([
      api.get(`/admission-checklist/student/${studentId}`),
      api.get('/guardians/links', { params: { student: studentId } }),
      api.get('/guardians/invitations', { params: { student: studentId } }),
    ]);
    setChecklist(cl.data.data);
    setLinks(lk.data.data.links);
    setInvitations(inv.data.data.invitations);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admissions/${id}`);
      const app = res.data.data.application;
      setApplication(app);
      await loadRelated(app.student);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadRelated]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const addNote = () =>
    run(() => api.post(`/admissions/${id}/notes`, { note }), 'Note added.').then(() =>
      setNote('')
    );

  const openConversation = async () => {
    setBusy(true);
    try {
      const res = await api.post('/conversations/ensure', { student: application.student });
      navigate(`/messages/${res.data.data.conversation.id}`);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/guardians/invitations', {
        student: application.student,
        name: inviteForm.name,
        relationship: inviteForm.relationship,
        phone: inviteForm.phone,
      });
      const token = res.data.data.token;
      setInviteResult({
        token,
        url: `${window.location.origin}/connect?token=${token}`,
      });
      setInviteForm({ name: '', relationship: '', phone: '' });
      await loadRelated(application.student);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader label="Loading application…" />;
  if (!application) return null;

  const a = application;
  const canReview = !['accepted', 'rejected', 'enrolled'].includes(a.status);
  const canAccept = !['accepted', 'enrolled'].includes(a.status);

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success('Copied.');
  };

  return (
    <div>
      <PageHeader
        title={a.fullName}
        subtitle={`${a.reference} · ${a.schoolName}`}
        actions={
          <button onClick={() => navigate('/admissions')} className="btn-secondary">
            <ArrowLeft size={16} /> {t('common.back')}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge color={STATUS_COLORS[a.status] || 'slate'}>{t(`admissions.status.${a.status}`)}</Badge>
        {a.status === 'enrolled' && a.student && (
          <button onClick={openConversation} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
            <MessageSquare size={14} /> Message school
          </button>
        )}
      </div>

      {!['accepted', 'rejected', 'enrolled'].includes(a.status) && (
        <div className="card mb-4 flex flex-wrap gap-2">
          {a.status !== 'under_review' && (
            <button
              onClick={() => run(() => api.post(`/admissions/${id}/review`, { status: 'under_review', note }), 'Marked under review.')}
              disabled={busy}
              className="btn-secondary"
            >
              <Clock size={16} /> {t('admissions.review')}
            </button>
          )}
          {a.status !== 'incomplete' && (
            <button
              onClick={() => run(() => api.post(`/admissions/${id}/review`, { status: 'incomplete', note }), 'Marked incomplete.')}
              disabled={busy}
              className="btn-secondary"
            >
              <XCircle size={16} /> Mark incomplete
            </button>
          )}
          <button
            onClick={() => run(() => api.post(`/admissions/${id}/review`, { status: 'rejected', note }), 'Application rejected.')}
            disabled={busy}
            className="btn-ghost text-red-600 hover:bg-red-50"
          >
            <XCircle size={16} /> {t('admissions.reject')}
          </button>
          {canAccept && (
            <button
              onClick={() => run(() => api.post(`/admissions/${id}/accept`, { note }), 'Application accepted.')}
              disabled={busy}
              className="btn-primary"
            >
              <CheckCircle2 size={16} /> {t('admissions.accept')}
            </button>
          )}
        </div>
      )}

      {a.status === 'accepted' && (
        <div className="card mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            This learner has been accepted. Enrol them to create a student record and generate the
            parent checklist.
          </p>
          <button
            onClick={() => run(() => api.post(`/admissions/${id}/enroll`), 'Learner enrolled.')}
            disabled={busy}
            className="btn-primary shrink-0"
          >
            <GraduationCap size={16} /> {t('admissions.enroll')}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Application details</h2>
          <Row label="Level" value={a.level || '—'} />
          <Row label="Trade" value={a.trade || '—'} />
          <Row label="Gender" value={a.gender || '—'} />
          <Row label="Date of birth" value={formatDate(a.dateOfBirth)} />
          <Row label="Previous school" value={a.previousSchool || '—'} />
          <Row label="Academic year" value={a.academicYear} />
          <Row label="Submitted" value={formatDate(a.submittedAt)} />
        </div>

        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Guardian</h2>
          <Row label="Name" value={a.guardian?.name || '—'} />
          <Row label="Relationship" value={a.guardian?.relationship || '—'} />
          <Row label="Phone" value={a.guardian?.phone || '—'} />
          <Row label="Email" value={a.guardian?.email || '—'} />
        </div>
      </div>

      {a.student && checklist && (
        <div className="card mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">{t('checklist.title')}</h2>
            <span className="text-xs font-medium text-slate-500">
              {t('checklist.readiness')}: {checklist.summary.readiness}%
            </span>
          </div>
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${checklist.summary.readiness}%` }}
            />
          </div>
          <ul className="divide-y divide-slate-100">
            {checklist.requirements.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{r.title}</p>
                  <p className="text-xs capitalize text-slate-400">
                    {r.category}
                    {r.quantity ? ` · ${r.quantity}${r.unit ? ` ${r.unit}` : ''}` : ''}
                    {r.requiresVerification ? ' · requires verification' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={PARENT_STATUS_COLORS[r.parentStatus] || 'slate'}>
                    {t(`checklist.${r.parentStatus}`)}
                  </Badge>
                  {r.requiresVerification && !r.schoolVerified && (
                    <button
                      onClick={() =>
                        run(
                          () => api.patch(`/admission-checklist/${r.id}`, { schoolVerified: true }),
                          'Requirement verified.'
                        )
                      }
                      disabled={busy}
                      className="btn-secondary px-2.5 py-1 text-xs"
                    >
                      <ShieldCheck size={13} /> {t('checklist.verify')}
                    </button>
                  )}
                  {r.schoolVerified && <CheckCircle2 size={16} className="text-brand-600" />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.student && (
        <div className="card mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">{t('guardian.title')}</h2>
            <button onClick={() => setInviteOpen(true)} className="btn-secondary px-3 py-1.5 text-xs">
              <UserPlus size={14} /> {t('guardian.invite')}
            </button>
          </div>

          {links.length === 0 && invitations.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">
              No guardian has connected yet. Send an invitation to link the parent.
            </p>
          )}

          {invitations.filter((i) => i.status === 'pending').length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Pending invitations
              </p>
              <ul className="space-y-1.5">
                {invitations
                  .filter((i) => i.status === 'pending')
                  .map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        {i.contact?.name || i.contact?.phone || 'Invitation'} · expires{' '}
                        {formatDate(i.expiresAt)}
                      </span>
                      <button
                        onClick={() => run(() => api.post(`/guardians/invitations/${i.id}/revoke`), 'Invitation revoked.')}
                        disabled={busy}
                        className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    {l.parent?.name || 'Parent'} · {l.relationship || 'guardian'}
                  </p>
                  <p className="text-xs text-slate-400">{l.parent?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : 'red'}>
                    {l.status}
                  </Badge>
                  {l.status === 'pending' && (
                    <button
                      onClick={() => run(() => api.post(`/guardians/links/${l.id}/approve`), 'Guardian approved.')}
                      disabled={busy}
                      className="btn-primary px-2.5 py-1 text-xs"
                    >
                      Approve
                    </button>
                  )}
                  {l.status === 'approved' && (
                    <button
                      onClick={() => run(() => api.post(`/guardians/links/${l.id}/revoke`), 'Guardian access revoked.')}
                      disabled={busy}
                      className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Reviewer notes</h2>
        {a.reviewerNotes.length > 0 && (
          <ul className="mb-3 space-y-2">
            {a.reviewerNotes.map((n) => (
              <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {n.note}
                <span className="ml-2 text-xs text-slate-400">{formatDateTime(n.at)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            className="input flex-1"
          />
          <button onClick={addNote} disabled={busy || !note.trim()} className="btn-secondary">
            <Send size={16} /> Add
          </button>
        </div>
      </div>

      <div className="card mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">History</h2>
        <ul className="space-y-2.5">
          {a.history.map((h) => (
            <li key={h.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <div>
                <p className="text-slate-700">
                  <span className="font-medium capitalize">{h.action}</span>
                  {h.to ? ` → ${h.to.replace('_', ' ')}` : ''}
                  {h.note ? ` · ${h.note}` : ''}
                </p>
                <p className="text-xs text-slate-400">{formatDateTime(h.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteResult(null);
        }}
        title={t('guardian.invite')}
      >
        {inviteResult ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Share this one-time link with the guardian. It expires in 14 days and can be used only
              once.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <code className="flex-1 break-all text-xs text-slate-600">{inviteResult.url}</code>
              <button onClick={() => copy(inviteResult.url)} className="btn-ghost p-1.5" title="Copy">
                <Copy size={15} />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              The guardian must create an account (or sign in) and will still need your approval
              before they can see any learner data.
            </p>
          </div>
        ) : (
          <form onSubmit={sendInvite} className="space-y-3">
            <label className="block">
              <span className="label">Guardian name</span>
              <input
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
              />
            </label>
            <label className="block">
              <span className="label">Relationship</span>
              <input
                value={inviteForm.relationship}
                onChange={(e) => setInviteForm((f) => ({ ...f, relationship: e.target.value }))}
                className="input"
                placeholder="mother / father"
              />
            </label>
            <label className="block">
              <span className="label">Phone (optional)</span>
              <input
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                className="input"
              />
            </label>
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className="btn-primary">
                <UserPlus size={16} /> Create invitation
              </button>
            </div>
          </form>
        )}
      </Modal>

      {a.student && (
        <div className="mt-4 text-center">
          <Link to="/messages" className="text-sm font-medium text-brand-700 hover:underline">
            School messages
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
