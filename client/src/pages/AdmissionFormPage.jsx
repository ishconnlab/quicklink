import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Modal } from '../components/layout.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { TRADE_KEYS, TRADE_LABELS } from '../lib/format.js';

const DRAFT_KEY = 'quicklink.admission.draft';

const initialForm = () => ({
  school: '',
  admissionPack: '',
  academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  firstName: '',
  lastName: '',
  fullName: '',
  gender: '',
  dateOfBirth: '',
  level: '',
  trade: '',
  sponsorship: '',
  previousSchool: '',
  guardianName: '',
  guardianRelationship: '',
  guardianPhone: '',
  guardianEmail: '',
});

export default function AdmissionFormPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [schools, setSchools] = useState([]);
  const [packs, setPacks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      return saved ? { ...initialForm(), ...JSON.parse(saved) } : initialForm();
    } catch {
      return initialForm();
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/schools', { params: { limit: 200, status: 'active' } });
        setSchools(res.data.data.schools);
      } catch (err) {
        toast.error(apiError(err).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    if (!form.school) {
      setPacks([]);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/admission-packs', {
          params: { school: form.school, status: 'published', limit: 50 },
        });
        setPacks(res.data.data.packs);
      } catch {
        setPacks([]);
      }
    })();
  }, [form.school]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const buildPayload = () => {
    const fullName = `${form.firstName} ${form.lastName}`.trim() || form.fullName;
    return {
      school: form.school,
      admissionPack: form.admissionPack || undefined,
      academicYear: form.academicYear.trim(),
      firstName: form.firstName,
      lastName: form.lastName,
      fullName,
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      level: form.level,
      trade: form.trade || undefined,
      sponsorship: form.sponsorship,
      previousSchool: form.previousSchool,
      guardian: {
        name: form.guardianName,
        relationship: form.guardianRelationship,
        phone: form.guardianPhone,
        email: form.guardianEmail,
      },
      submit: true,
    };
  };

  const submit = async (e, confirmDuplicate = false) => {
    e?.preventDefault();
    if (!form.school) return toast.error('Select a school.');
    if (!form.firstName.trim() && !form.fullName.trim()) return toast.error('Enter the learner name.');

    setSaving(true);
    try {
      const res = await api.post('/admissions', { ...buildPayload(), confirmDuplicate });
      localStorage.removeItem(DRAFT_KEY);
      toast.success(`Application ${res.data.data.application.reference} submitted.`);
      navigate(`/admissions/${res.data.data.application.id}`);
    } catch (err) {
      const info = apiError(err);
      if (info.status === 409 && info.details) {
        setDuplicate({ message: info.message, details: info.details });
      } else {
        toast.error(info.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New application"
        subtitle="Record a learner's admission application"
        actions={
          <button onClick={() => navigate('/admissions')} className="btn-secondary">
            <ArrowLeft size={16} /> Back
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">School &amp; intake</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="label">School</span>
              <select value={form.school} onChange={(e) => set('school', e.target.value)} className="input">
                <option value="">Select a school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schoolName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Admission pack</span>
              <select
                value={form.admissionPack}
                onChange={(e) => set('admissionPack', e.target.value)}
                className="input"
                disabled={!form.school}
              >
                <option value="">None</option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.academicYear} (v{p.version})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Academic year</span>
              <input value={form.academicYear} onChange={(e) => set('academicYear', e.target.value)} className="input" />
            </label>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Learner</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">First name</span>
              <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Last name</span>
              <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Gender</span>
              <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className="input">
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Date of birth</span>
              <input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Level</span>
              <input value={form.level} onChange={(e) => set('level', e.target.value)} className="input" placeholder="Level 3" />
            </label>
            <label className="block">
              <span className="label">Trade</span>
              <select value={form.trade} onChange={(e) => set('trade', e.target.value)} className="input">
                <option value="">Not specified</option>
                {TRADE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {TRADE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Previous school</span>
              <input value={form.previousSchool} onChange={(e) => set('previousSchool', e.target.value)} className="input" />
            </label>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Guardian</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Name</span>
              <input value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Relationship</span>
              <input
                value={form.guardianRelationship}
                onChange={(e) => set('guardianRelationship', e.target.value)}
                className="input"
                placeholder="mother / father"
              />
            </label>
            <label className="block">
              <span className="label">Phone</span>
              <input value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input value={form.guardianEmail} onChange={(e) => set('guardianEmail', e.target.value)} className="input" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/admissions')} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Save size={16} /> {saving ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>

      <Modal
        open={!!duplicate}
        onClose={() => setDuplicate(null)}
        title="Possible duplicate"
        footer={
          <>
            <button onClick={() => setDuplicate(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={(e) => {
                setDuplicate(null);
                submit(e, true);
              }}
              disabled={saving}
              className="btn-primary"
            >
              <UserPlus size={16} /> Save anyway
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {duplicate?.message}. A similar application already exists
          {duplicate?.details?.[0]?.message ? ` (${duplicate.details[0].message})` : ''}. Do you want to
          save this application anyway?
        </p>
      </Modal>
    </div>
  );
}
