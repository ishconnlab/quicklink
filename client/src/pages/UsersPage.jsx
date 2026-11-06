import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { GraduationCap, Mail, Calendar, Power, UserPlus, Pencil, Trash2, Search, ShieldCheck, UsersRound, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Modal, Badge } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../lib/format.js';
import { isAdminRole, roleLabel } from '../lib/roles.js';

const blankForm = () => ({ name: '', email: '', password: '', role: 'student', educationLevel: '' });
const PAGE_SIZE = 10;

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const toast = useToast();
  const { confirm } = useDialog();
  const { user: currentUser } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data.data.users);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // useToast returns a fresh context object; the loader intentionally has no changing dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleUsers = useMemo(() => users.filter((person) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || `${person.name} ${person.email}`.toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'inactive' ? !person.isActive && person.registrationStatus !== 'pending' : person.registrationStatus === statusFilter);
    return matchesText && (roleFilter === 'all' || person.role === roleFilter) && matchesStatus;
  }), [users, search, roleFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageUsers = visibleUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pendingCount = users.filter((person) => person.role === 'student' && person.registrationStatus === 'pending').length;

  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  if (currentUser && !currentUser.isOwner) return <Navigate to="/settings" replace />;

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setErrors({});
    setModal(true);
  };

  const openEdit = (person) => {
    setEditing(person);
    setForm({ name: person.name, email: person.email, password: '', role: person.role, educationLevel: person.educationLevel || '' });
    setErrors({});
    setModal(true);
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Enter a name with at least 2 characters.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (form.role === 'student' && !form.educationLevel) nextErrors.educationLevel = 'Choose the student’s education level.';
    if (!editing && form.password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    if (editing && form.password && form.password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name.trim(), email: form.email.trim(), role: form.role, educationLevel: form.role === 'student' ? form.educationLevel : null };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editing.id}`, payload);
        toast.success('Account details updated.');
      } else {
        await api.post('/users', { ...form, educationLevel: form.role === 'student' ? form.educationLevel : undefined, name: form.name.trim(), email: form.email.trim() });
        toast.success(`${form.role === 'teacher' ? 'Teacher' : 'Student'} account created.`);
      }
      setModal(false);
      setEditing(null);
      setForm(blankForm());
      await load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (person, active) => {
    setBusyId(person.id);
    try {
      await api.patch(`/users/${person.id}`, { isActive: active });
      toast.success(active ? 'Account restored.' : 'Account deactivated.');
      await load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusyId('');
    }
  };

  const reviewRegistration = async (person, registrationStatus) => {
    setBusyId(person.id);
    try {
      await api.patch(`/users/${person.id}`, { registrationStatus });
      toast.success(registrationStatus === 'approved' ? `${person.name} is approved and can now sign in.` : `${person.name}'s registration was rejected.`);
      await load();
    } catch (error) { toast.error(apiError(error).message); }
    finally { setBusyId(''); }
  };

  const removeAccount = async (person) => {
    const confirmed = await confirm({
      title: `Permanently delete ${person.name}'s account?`,
      message: `This permanently deletes the account, learning progress, certificates, submissions, registrations, follows, and notifications. The user will be removed from class rosters and attendance/chat records. Classes and their teaching content will remain; assigned classes will have no teacher if nobody else is assigned. End any live session the teacher started or teaches, and have the user leave other live sessions. This cannot be undone.`,
      confirmLabel: 'Delete account permanently',
      confirmationText: 'DELETE',
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusyId(person.id);
    try {
      await api.delete(`/users/${person.id}`);
      toast.success(`${person.name}'s account and personal records were permanently deleted.`);
      await load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusyId('');
    }
  };

  return <div>
    <PageHeader title="People and accounts" subtitle="Create and manage teacher and student access" actions={<><Link to="/classes" className="btn-secondary"><UsersRound size={17} />Manage class rosters</Link><button onClick={openCreate} className="btn-primary"><UserPlus size={18} />New account</button></>} />

    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><div className="card p-3"><p className="text-xs text-slate-500">Active teachers</p><p className="mt-1 text-xl font-semibold text-slate-900">{users.filter((person) => person.role === 'teacher' && person.isActive).length}</p></div><div className="card p-3"><p className="text-xs text-slate-500">Active students</p><p className="mt-1 text-xl font-semibold text-slate-900">{users.filter((person) => person.role === 'student' && person.isActive).length}</p></div><div className={`card p-3 ${pendingCount ? 'border-amber-300 bg-amber-50' : ''}`}><p className="text-xs text-slate-500">Waiting approval</p><p className="mt-1 text-xl font-semibold text-amber-800">{pendingCount}</p></div><div className="card flex items-center gap-2 p-3"><ShieldCheck size={18} className="shrink-0 text-brand-700" /><p className="text-xs leading-5 text-brand-900">Assign teachers and enroll students in <Link to="/classes" className="font-semibold underline">Courses and classes</Link>.</p></div></div>

    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
      <label className="relative block"><span className="sr-only">Search accounts</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></label>
      <select className="input" aria-label="Filter accounts by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All account types</option><option value="teacher">Teachers</option><option value="student">Students</option></select>
      <select className="input" aria-label="Filter accounts by approval status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="inactive">Disabled</option></select>
    </div>

    {loading ? <PageLoader label="Loading accounts…" /> : visibleUsers.length === 0 ? <EmptyState icon={GraduationCap} title={users.length ? 'No matching accounts' : 'No accounts yet'} description={users.length ? 'Try changing your search or role filter.' : 'Create a teacher or student account to get started.'} action={!users.length && <button onClick={openCreate} className="btn-primary"><UserPlus size={16} />Create account</button>} /> : <div className="space-y-2">
      {pageUsers.map((person) => <article key={person.id} className="card flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{person.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{person.name}</p>{person.id === currentUser?.id && <Badge color="brand">You</Badge>}<Badge color={person.role === 'student' ? 'green' : 'slate'}>{roleLabel(person.role)}</Badge>{person.role === 'student' && person.educationLevel && <Badge color="brand">{person.educationLevel}</Badge>}{person.registrationStatus === 'pending' ? <Badge color="amber">Pending approval</Badge> : person.registrationStatus === 'rejected' ? <Badge color="red">Rejected</Badge> : !person.isActive && <Badge color="red">Disabled</Badge>}</div>
            <p className="mt-0.5 flex items-center gap-1 break-all text-xs text-slate-500"><Mail size={11} className="shrink-0" />{person.email}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Calendar size={11} />Joined {formatDateTime(person.createdAt)}</p>
          </div>
        </div>
        {!isAdminRole(person.role) && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
          {person.role === 'student' && ['pending', 'rejected'].includes(person.registrationStatus) && <><button onClick={() => reviewRegistration(person, 'approved')} disabled={busyId === person.id} className="btn-primary min-h-10 px-3"><CheckCircle2 size={16} /><span className="text-xs">Approve</span></button>{person.registrationStatus === 'pending' && <button onClick={() => reviewRegistration(person, 'rejected')} disabled={busyId === person.id} className="btn-ghost min-h-10 px-3 text-red-600"><XCircle size={16} /><span className="text-xs">Reject</span></button>}</>}
          <button onClick={() => openEdit(person)} className="btn-ghost min-h-10 px-3" aria-label={`Edit ${person.name}`}><Pencil size={16} /><span className="text-xs">Edit</span></button>
          {person.registrationStatus !== 'pending' && <button onClick={() => setActive(person, !person.isActive)} disabled={busyId === person.id} className="btn-ghost min-h-10 px-3" title={person.isActive ? 'Deactivate account' : 'Restore account'} aria-label={person.isActive ? `Deactivate ${person.name}` : `Restore ${person.name}`}><Power size={16} className={person.isActive ? 'text-emerald-600' : 'text-slate-400'} /><span className="text-xs">{person.isActive ? 'Disable' : 'Restore'}</span></button>}
          <button onClick={() => removeAccount(person)} disabled={busyId === person.id} className="btn-ghost min-h-10 px-3 text-red-600" aria-label={`Permanently delete ${person.name}`} title="Permanently delete account and personal records"><Trash2 size={16} /><span className="text-xs">Delete</span></button>
          {busyId === person.id && <Spinner size={15} />}
        </div>}
      </article>)}
    </div>}

    {!loading && visibleUsers.length > PAGE_SIZE && <nav className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3" aria-label="Account list pagination"><p className="text-xs text-slate-500">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visibleUsers.length)} of {visibleUsers.length} accounts</p><div className="flex items-center gap-2"><button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}><ChevronLeft size={15} />Previous</button><span className="min-w-16 text-center text-xs tabular-nums text-slate-600">{currentPage} / {pageCount}</span><button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount}>Next<ChevronRight size={15} /></button></div></nav>}

    <Modal open={modal} onClose={() => !saving && setModal(false)} title={editing ? 'Edit account' : 'Create account'} footer={<><button onClick={() => setModal(false)} disabled={saving} className="btn-secondary">Cancel</button><button form="account-form" type="submit" disabled={saving} className="btn-primary">{saving ? <Spinner size={16} /> : editing ? <Pencil size={16} /> : <UserPlus size={16} />}{editing ? 'Save changes' : 'Create account'}</button></>}>
      <form id="account-form" onSubmit={saveAccount} className="space-y-4">
        <div><label className="label" htmlFor="account-name">Full name</label><input id="account-name" autoComplete="name" required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`input ${errors.name ? 'ring-2 ring-red-400' : ''}`} placeholder="Jane Doe" />{errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}</div>
        <div><label className="label" htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={`input ${errors.email ? 'ring-2 ring-red-400' : ''}`} placeholder="jane@example.com" />{errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}</div>
        <div><label className="label" htmlFor="account-password">{editing ? 'Reset password (optional)' : 'Temporary password'}</label><input id="account-password" type="password" autoComplete={editing ? 'new-password' : 'new-password'} minLength={editing && !form.password ? undefined : 8} required={!editing} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={`input font-mono ${errors.password ? 'ring-2 ring-red-400' : ''}`} placeholder={editing ? 'Leave blank to keep current password' : 'At least 8 characters'} />{errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}<p className="mt-1 text-xs text-slate-400">Passwords are hashed on the server and never returned by the API.</p></div>
        <div><label className="label" htmlFor="account-role">Account type</label><select id="account-role" className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, educationLevel: event.target.value === 'student' ? form.educationLevel : '' })}><option value="student">Student</option><option value="teacher">Teacher</option></select>{editing && form.role !== editing.role && <p className="mt-1 text-xs text-amber-700">{form.role === 'teacher' ? 'Changing this student to a teacher removes them from their current student rosters.' : 'The teacher must be removed from assigned classes before becoming a student.'}</p>}</div>
        {form.role === 'student' && <div><label className="label" htmlFor="account-level">Education level</label><select id="account-level" required className={`input ${errors.educationLevel ? 'ring-2 ring-red-400' : ''}`} value={form.educationLevel} onChange={(event) => setForm({ ...form, educationLevel: event.target.value })}><option value="">Choose a level</option><option value="L3">L3</option><option value="L4">L4</option><option value="L5">L5</option><option value="Bootcamp">Bootcamp</option><option value="Training">Training / non-student</option></select>{errors.educationLevel && <p className="mt-1 text-xs text-red-600">{errors.educationLevel}</p>}</div>}
      </form>
    </Modal>
  </div>;
}
