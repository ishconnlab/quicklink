import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Save, ArrowLeft, GraduationCap, User, Users, AlertCircle } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { TRADE_KEYS, TRADE_LABELS, toInputDate } from '../lib/format.js';

const LEVELS = [
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Level 5',
  'Senior 1',
  'Senior 2',
  'Senior 3',
  'Senior 4',
  'Senior 5',
  'Senior 6',
];

const GENDERS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
];

const SPONSORSHIPS = [
  { key: 'government', label: 'Government' },
  { key: 'private', label: 'Private' },
  { key: 'sponsored', label: 'Sponsored' },
  { key: 'self', label: 'Self-sponsored' },
  { key: 'other', label: 'Other' },
];

const STATUSES = [
  { key: 'enrolled', label: 'Enrolled' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'transferred', label: 'Transferred' },
  { key: 'dropped', label: 'Dropped' },
];

const emptyForm = () => ({
  school: '',
  fullName: '',
  indexNumber: '',
  gender: '',
  dateOfBirth: '',
  trade: '',
  level: '',
  sponsorship: '',
  guardianName: '',
  guardianPhone: '',
  status: 'enrolled',
  enrolledAt: toInputDate(new Date()),
  notes: '',
});

export default function StudentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(emptyForm);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const requests = [
          api.get('/schools', { params: { limit: 200, status: 'all' } }),
          isEdit ? api.get(`/students/${id}`) : Promise.resolve(null),
        ];
        const [schoolsRes, studentRes] = await Promise.all(requests);
        if (!active) return;
        setSchools(schoolsRes.data.data.schools);

        if (studentRes) {
          const s = studentRes.data.data.student;
          setForm({
            school: s.school?.id || '',
            fullName: s.fullName || '',
            indexNumber: s.indexNumber || '',
            gender: s.gender || '',
            dateOfBirth: toInputDate(s.dateOfBirth),
            trade: s.trade || '',
            level: s.level || '',
            sponsorship: s.sponsorship || '',
            guardianName: s.guardianName || '',
            guardianPhone: s.guardianPhone || '',
            status: s.status || 'enrolled',
            enrolledAt: toInputDate(s.enrolledAt) || '',
            notes: s.notes || '',
          });
        }
      } catch (err) {
        toast.error(apiError(err).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.school) e.school = 'Select a school';
    if (form.fullName.trim().length < 2) e.fullName = 'Full name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    const payload = {
      school: form.school,
      fullName: form.fullName.trim(),
      indexNumber: form.indexNumber.trim() || null,
      gender: form.gender || null,
      dateOfBirth: form.dateOfBirth || null,
      trade: form.trade || null,
      level: form.level || '',
      sponsorship: form.sponsorship || null,
      guardianName: form.guardianName.trim(),
      guardianPhone: form.guardianPhone.trim(),
      status: form.status,
      enrolledAt: form.enrolledAt || null,
      notes: form.notes.trim(),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/students/${id}`, payload);
        toast.success('Student updated.');
      } else {
        await api.post('/students', payload);
        toast.success('Student added.');
      }
      navigate('/students');
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading…" />;

  const noSchools = schools.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <PageHeader
        title={isEdit ? 'Edit student' : 'Add student'}
        subtitle="Enrolment, learner profile and certification details"
      />

      {noSchools && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>
            You need a school first.{' '}
            <Link to="/schools/new" className="font-semibold underline">
              Create a school record
            </Link>{' '}
            before enrolling students.
          </span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <GraduationCap size={16} /> Learner
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">School *</label>
              <select
                value={form.school}
                onChange={(e) => setField('school', e.target.value)}
                className={`input ${errors.school ? 'ring-2 ring-red-400' : ''}`}
              >
                <option value="">Select a school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schoolName} — {s.holding?.name}
                  </option>
                ))}
              </select>
              {errors.school && <p className="mt-1 text-xs text-red-600">{errors.school}</p>}
            </div>
            <div>
              <label className="label">Full name *</label>
              <input
                value={form.fullName}
                onChange={(e) => setField('fullName', e.target.value)}
                className={`input ${errors.fullName ? 'ring-2 ring-red-400' : ''}`}
                placeholder="e.g. Mugisha Aline"
              />
              {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
            </div>
            <div>
              <label className="label">Index / candidate number</label>
              <input
                value={form.indexNumber}
                onChange={(e) => setField('indexNumber', e.target.value)}
                className="input"
                placeholder="Auto-generated if left blank"
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setField('gender', e.target.value)}
                className="input"
              >
                <option value="">Not specified</option>
                {GENDERS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date of birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users size={16} /> Trade &amp; certification
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Trade</label>
              <select
                value={form.trade}
                onChange={(e) => setField('trade', e.target.value)}
                className="input"
              >
                <option value="">Not specified</option>
                {TRADE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {TRADE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Level</label>
              <select
                value={form.level}
                onChange={(e) => setField('level', e.target.value)}
                className="input"
              >
                <option value="">Not specified</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sponsorship</label>
              <select
                value={form.sponsorship}
                onChange={(e) => setField('sponsorship', e.target.value)}
                className="input"
              >
                <option value="">Not specified</option>
                {SPONSORSHIPS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className="input"
              >
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Enrolled on</label>
              <input
                type="date"
                value={form.enrolledAt}
                onChange={(e) => setField('enrolledAt', e.target.value)}
                className="input"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            A learner is <span className="font-semibold">certification ready</span> when enrolled
            with an index number, trade and level recorded — eligible for NESA / RTB exams.
          </p>
        </div>

        <div className="card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <User size={16} /> Guardian &amp; notes
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Guardian name</label>
              <input
                value={form.guardianName}
                onChange={(e) => setField('guardianName', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Guardian phone</label>
              <input
                value={form.guardianPhone}
                onChange={(e) => setField('guardianPhone', e.target.value)}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              maxLength={2000}
              className="input resize-y"
              placeholder="Sponsorship, special needs, follow-ups…"
            />
          </div>
        </div>

        <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4">
          <Link to="/students" className="btn-secondary flex-1">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || noSchools}
            className="btn-primary flex-1"
          >
            {saving ? <Spinner size={18} /> : <Save size={18} />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add student'}
          </button>
        </div>
      </form>
    </div>
  );
}
