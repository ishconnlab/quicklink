import { useEffect, useState, useCallback } from 'react';
import { UserPlus, ShieldCheck, Mail, Calendar, Power } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Modal, Badge } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../lib/format.js';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const toast = useToast();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createUser = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Name is required';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Valid email required';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await api.post('/users', form);
      toast.success('Account created. Share the credentials securely.');
      setModal(false);
      setForm({ name: '', email: '', password: '' });
      load();
    } catch (err) {
      const info = apiError(err);
      toast.error(info.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
      toast.success(`Account ${u.isActive ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      toast.error(apiError(err).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="User accounts"
        subtitle="Every account shares the same role and permissions"
        actions={
          <button onClick={() => setModal(true)} className="btn-primary">
            <UserPlus size={18} /> New account
          </button>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <span>
          QuickLink has a single role model. All authorised users can create, view and manage school
          records. There is no public registration — only signed-in users can add accounts.
        </span>
      </div>

      {loading ? (
        <PageLoader label="Loading accounts…" />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-slate-900">{u.name}</p>
                    {u.id === currentUser?.id && <Badge color="brand">You</Badge>}
                    {!u.isActive && <Badge color="red">Disabled</Badge>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                    <Mail size={11} /> {u.email}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <Calendar size={11} /> Joined {formatDateTime(u.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleActive(u)}
                disabled={u.id === currentUser?.id}
                className="btn-ghost p-2.5"
                title={u.isActive ? 'Deactivate' : 'Activate'}
              >
                <Power size={16} className={u.isActive ? 'text-emerald-600' : 'text-slate-400'} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Create user account"
        footer={
          <>
            <button onClick={() => setModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={createUser} disabled={saving} className="btn-primary">
              {saving ? <Spinner size={16} /> : <UserPlus size={16} />} Create
            </button>
          </>
        }
      >
        <form onSubmit={createUser} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`input ${errors.name ? 'ring-2 ring-red-400' : ''}`}
              placeholder="Jane Doe"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={`input ${errors.email ? 'ring-2 ring-red-400' : ''}`}
              placeholder="jane@example.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={`input font-mono ${errors.password ? 'ring-2 ring-red-400' : ''}`}
              placeholder="At least 8 characters"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            <p className="mt-1 text-xs text-slate-400">
              The password is hashed on the server and never returned by the API.
            </p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
