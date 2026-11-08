import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Mail, MapPin, Pencil, Phone, Plus, Power,
  Search, ShieldCheck, Trash2, UserPlus, UsersRound, XCircle,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, Modal, PageHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../lib/format.js';
import { isAdminRole, roleLabel } from '../lib/roles.js';

const PAGE_SIZE = 12;
const blankCreate = () => ({ name: '', email: '', password: '', whatsapp: '', country: '', province: '' });
const blankEdit = () => ({ name: '', email: '', role: 'student', whatsapp: '', country: '', province: '', password: '', registrationStatus: 'approved' });

export default function UsersPage() {
  const toast = useToast();
  const dialog = useDialog();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(blankCreate);
  const [createErrors, setCreateErrors] = useState({});
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(blankEdit);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/users', { params: { limit: 200 } });
      setUsers(response.data.data.users);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  const pendingCount = users.filter((person) => person.role === 'student' && person.registrationStatus === 'pending').length;
  const activeStudents = users.filter((person) => person.role === 'student' && person.isActive).length;
  const admins = users.filter((person) => isAdminRole(person.role)).length;
  const inactive = users.filter((person) => !person.isActive).length;

  const visibleUsers = useMemo(() => users.filter((person) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || `${person.name} ${person.email} ${person.whatsapp || ''} ${person.country || ''} ${person.province || ''}`.toLowerCase().includes(term);
    const matchesRole = roleFilter === 'all' || person.role === roleFilter;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'inactive' ? !person.isActive && person.registrationStatus !== 'pending' : person.registrationStatus === statusFilter);
    return matchesText && matchesRole && matchesStatus;
  }), [users, search, roleFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageUsers = visibleUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openCreate = () => { setCreateForm(blankCreate()); setCreateErrors({}); setCreateOpen(true); };

  const createAccount = async (event) => {
    event.preventDefault();
    const errors = {};
    if (createForm.name.trim().length < 2) errors.name = 'Enter the full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(createForm.email.trim())) errors.email = 'Enter a valid email.';
    if (createForm.password.length < 8) errors.password = 'Use at least 8 characters.';
    setCreateErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await api.post('/users', {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        whatsapp: createForm.whatsapp.trim(),
        country: createForm.country.trim(),
        province: createForm.province.trim(),
      });
      toast.success('Student account created and approved.');
      setCreateOpen(false);
      setCreateForm(blankCreate());
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const openEdit = (person) => {
    setEditTarget(person);
    setEditForm({ name: person.name || '', email: person.email || '', role: person.role || 'student', whatsapp: person.whatsapp || '', country: person.country || '', province: person.province || '', password: '', registrationStatus: person.registrationStatus || 'approved' });
    setEditErrors({});
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    if (!editTarget) return;
    const errors = {};
    if (editForm.name.trim().length < 2) errors.name = 'Enter the full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editForm.email.trim())) errors.email = 'Enter a valid email.';
    if (editForm.password && editForm.password.length < 8) errors.password = 'Use at least 8 characters.';
    setEditErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        whatsapp: editForm.whatsapp.trim(),
        country: editForm.country.trim(),
        province: editForm.province.trim(),
      };
      if (editForm.password) payload.password = editForm.password;
      if (editTarget.id !== currentUser?.id && editForm.role !== editTarget.role) payload.role = editForm.role;
      if (editForm.role === 'student' && editForm.registrationStatus !== editTarget.registrationStatus) payload.registrationStatus = editForm.registrationStatus;
      await api.patch(`/users/${editTarget.id}`, payload);
      toast.success('Account updated.');
      setEditTarget(null);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const setActive = async (person, active) => {
    setBusyId(person.id);
    try {
      await api.patch(`/users/${person.id}`, { isActive: active });
      toast.success(active ? 'Account enabled.' : 'Account disabled.');
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const reviewRegistration = async (person, registrationStatus) => {
    setBusyId(person.id);
    try {
      await api.patch(`/users/${person.id}`, { registrationStatus });
      toast.success(registrationStatus === 'approved' ? `${person.name} is approved.` : `${person.name}'s registration was rejected.`);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const removeAccount = async (person) => {
    const confirmed = await dialog.confirm({
      title: `Permanently delete ${person.name}?`,
      message: 'This removes the account, enrollments, assessment drafts, project submissions, certificates, registrations, and attendance personal records. Class sessions and training records remain. This cannot be undone.',
      confirmLabel: 'Delete account permanently',
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusyId(person.id);
    try {
      await api.delete(`/users/${person.id}`);
      toast.success(`${person.name}'s account was permanently deleted.`);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  return <div>
    <PageHeader
      eyebrow="People"
      title="Students & accounts"
      subtitle="Create approved student accounts, review self-registrations, manage administrator access, and keep contact details current."
      actions={<><Link to="/enrollments" className="btn-secondary"><UsersRound size={17} />Enrollment ledger</Link><button className="btn-primary" onClick={openCreate}><UserPlus size={17} />New student</button></>}
    />

    <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <StatCard label="Active students" value={activeStudents} icon={UsersRound} accent="brand" hint={`${users.length} total accounts`} />
      <StatCard label="Pending approval" value={pendingCount} icon={CalendarDays} accent={pendingCount ? 'amber' : 'green'} hint={pendingCount ? 'Review self-registrations' : 'Nothing waiting'} />
      <StatCard label="Administrators" value={admins} icon={ShieldCheck} accent="purple" hint="Full platform access" />
      <StatCard label="Disabled" value={inactive} icon={Power} accent={inactive ? 'slate' : 'green'} hint="Cannot sign in" />
    </div>

    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_12rem]">
      <label className="relative block"><span className="sr-only">Search accounts</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, WhatsApp, country" /></label>
      <label><span className="sr-only">Filter by role</span><select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All account types</option><option value="student">Students</option><option value="admin">Administrators</option></select></label>
      <label><span className="sr-only">Filter by status</span><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="inactive">Disabled</option></select></label>
    </div>

    {loading && !users.length ? <PageLoader label="Loading accounts…" /> : visibleUsers.length === 0 ? <EmptyState icon={UsersRound} title={users.length ? 'No matching accounts' : 'No accounts yet'} description={users.length ? 'Try changing your search or filters.' : 'Create the first student account to begin enrolling learners.'} action={!users.length && <button className="btn-primary" onClick={openCreate}><Plus size={16} />Create student</button>} /> : <div className="space-y-2">
      {pageUsers.map((person) => {
        const self = person.id === currentUser?.id;
        return <article key={person.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-amber-100 text-sm font-black text-brand-800">{person.name?.slice(0, 1)?.toUpperCase() || '?'}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><p className="break-words font-bold text-slate-900">{person.name}</p>{self && <Badge color="brand">You</Badge>}<Badge color={person.role === 'student' ? 'green' : 'purple'}>{roleLabel(person.role)}</Badge>{person.registrationStatus === 'pending' && <Badge color="amber">Pending approval</Badge>}{person.registrationStatus === 'rejected' && <Badge color="red">Rejected</Badge>}{!person.isActive && person.registrationStatus !== 'pending' && <Badge color="slate">Disabled</Badge>}</div>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:gap-x-3">
                  <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 break-all hover:text-brand-700"><Mail size={11} className="shrink-0" />{person.email}</a>
                  {person.whatsapp && <a href={`https://wa.me/${person.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-700"><Phone size={11} />{person.whatsapp}</a>}
                  {(person.country || person.province) && <span className="inline-flex items-center gap-1"><MapPin size={11} />{[person.province, person.country].filter(Boolean).join(', ')}</span>}
                  <span className="inline-flex items-center gap-1 text-slate-400"><CalendarDays size={11} />Joined {formatDateTime(person.createdAt)}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-slate-100 pt-3 lg:border-0 lg:pt-0">
              {person.role === 'student' && ['pending', 'rejected'].includes(person.registrationStatus) && <>
                <button type="button" className="btn-primary min-h-9 px-3 text-xs" disabled={busyId === person.id} onClick={() => reviewRegistration(person, 'approved')}><CheckCircle2 size={14} />Approve</button>
                {person.registrationStatus === 'pending' && <button type="button" className="btn-ghost min-h-9 px-3 text-xs text-red-600" disabled={busyId === person.id} onClick={() => reviewRegistration(person, 'rejected')}><XCircle size={14} />Reject</button>}
              </>}
              <button type="button" className="btn-ghost min-h-9 px-2.5 text-xs" onClick={() => openEdit(person)}><Pencil size={14} />Edit</button>
              {person.registrationStatus !== 'pending' && !self && <button type="button" className="btn-ghost min-h-9 px-2.5 text-xs" disabled={busyId === person.id} onClick={() => setActive(person, !person.isActive)}><Power size={14} className={person.isActive ? 'text-emerald-600' : 'text-slate-400'} />{person.isActive ? 'Disable' : 'Enable'}</button>}
              {!self && person.role !== 'admin' && <button type="button" className="btn-ghost min-h-9 px-2.5 text-xs text-red-600" disabled={busyId === person.id} onClick={() => removeAccount(person)}><Trash2 size={14} />Delete</button>}
              {busyId === person.id && <Spinner size={14} />}
            </div>
          </div>
        </article>;
      })}
    </div>}

    {visibleUsers.length > PAGE_SIZE && <nav className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3" aria-label="Account pagination"><p className="text-xs text-slate-500">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visibleUsers.length)} of {visibleUsers.length}</p><div className="flex items-center gap-2"><button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}><ChevronLeft size={15} />Previous</button><span className="min-w-14 text-center text-xs tabular-nums text-slate-600">{currentPage} / {pageCount}</span><button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount}>Next<ChevronRight size={15} /></button></div></nav>}

    <Modal open={createOpen} onClose={() => !saving && setCreateOpen(false)} title="Create student account" footer={<><button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</button><button form="create-student-form" type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner size={16} /> : <UserPlus size={16} />}Create student</button></>}>
      <form id="create-student-form" onSubmit={createAccount} className="space-y-3">
        <p className="rounded-xl bg-orange-50 px-3 py-2.5 text-xs leading-5 text-brand-900">The account is created as an approved, active student. Share the temporary password securely; the student can change it in Settings.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Full name</span><input className={`input ${createErrors.name ? 'ring-2 ring-red-400' : ''}`} autoComplete="name" required minLength={2} maxLength={120} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} />{createErrors.name && <span className="mt-1 block text-xs text-red-600">{createErrors.name}</span>}</label>
          <label><span className="label">Email</span><input className={`input ${createErrors.email ? 'ring-2 ring-red-400' : ''}`} type="email" autoComplete="email" required maxLength={254} value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} />{createErrors.email && <span className="mt-1 block text-xs text-red-600">{createErrors.email}</span>}</label>
          <label><span className="label">Temporary password</span><input className={`input font-mono ${createErrors.password ? 'ring-2 ring-red-400' : ''}`} type="text" autoComplete="new-password" required minLength={8} maxLength={200} value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} placeholder="At least 8 characters" />{createErrors.password && <span className="mt-1 block text-xs text-red-600">{createErrors.password}</span>}</label>
          <label><span className="label">WhatsApp</span><input className="input" type="tel" autoComplete="tel" maxLength={40} value={createForm.whatsapp} onChange={(event) => setCreateForm({ ...createForm, whatsapp: event.target.value })} placeholder="+250 700 000 000" /></label>
          <label><span className="label">Country</span><input className="input" autoComplete="country-name" maxLength={120} value={createForm.country} onChange={(event) => setCreateForm({ ...createForm, country: event.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">Province / state / region</span><input className="input" autoComplete="address-level1" maxLength={120} value={createForm.province} onChange={(event) => setCreateForm({ ...createForm, province: event.target.value })} /></label>
        </div>
      </form>
    </Modal>

    <Modal open={Boolean(editTarget)} onClose={() => !saving && setEditTarget(null)} title={`Edit ${editTarget?.name || 'account'}`} footer={<><button className="btn-secondary" onClick={() => setEditTarget(null)} disabled={saving}>Cancel</button><button form="edit-account-form" type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner size={16} /> : <Pencil size={16} />}Save changes</button></>}>
      {editTarget && <form id="edit-account-form" onSubmit={saveAccount} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Full name</span><input className={`input ${editErrors.name ? 'ring-2 ring-red-400' : ''}`} autoComplete="name" required minLength={2} maxLength={120} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />{editErrors.name && <span className="mt-1 block text-xs text-red-600">{editErrors.name}</span>}</label>
          <label><span className="label">Email</span><input className={`input ${editErrors.email ? 'ring-2 ring-red-400' : ''}`} type="email" autoComplete="email" required maxLength={254} value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />{editErrors.email && <span className="mt-1 block text-xs text-red-600">{editErrors.email}</span>}</label>
          <label><span className="label">Reset password (optional)</span><input className={`input font-mono ${editErrors.password ? 'ring-2 ring-red-400' : ''}`} type="text" autoComplete="new-password" minLength={editForm.password ? 8 : undefined} maxLength={200} value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} placeholder="Leave blank to keep current" />{editErrors.password && <span className="mt-1 block text-xs text-red-600">{editErrors.password}</span>}</label>
          <label><span className="label">WhatsApp</span><input className="input" type="tel" autoComplete="tel" maxLength={40} value={editForm.whatsapp} onChange={(event) => setEditForm({ ...editForm, whatsapp: event.target.value })} /></label>
          <label><span className="label">Country</span><input className="input" autoComplete="country-name" maxLength={120} value={editForm.country} onChange={(event) => setEditForm({ ...editForm, country: event.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">Province / state / region</span><input className="input" autoComplete="address-level1" maxLength={120} value={editForm.province} onChange={(event) => setEditForm({ ...editForm, province: event.target.value })} /></label>
          <label><span className="label">Account type</span><select className="input" value={editForm.role} disabled={editTarget.id === currentUser?.id} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}><option value="student">Student</option><option value="admin">Administrator</option></select>{editTarget.id === currentUser?.id && <span className="mt-1 block text-xs text-slate-400">You cannot change your own account type.</span>}</label>
          {editForm.role === 'student' && <label><span className="label">Registration approval</span><select className="input" value={editForm.registrationStatus === 'pending' ? 'pending' : editForm.registrationStatus} onChange={(event) => setEditForm({ ...editForm, registrationStatus: event.target.value })}><option value="pending" disabled>Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>}
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">Administrator access allows full control of trainings, enrollments, payments, and certificates. At least one active administrator must remain.</p>
      </form>}
    </Modal>
  </div>;
}
