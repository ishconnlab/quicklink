import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader } from '../components/layout.jsx';
import { PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';

const TYPE_OPTIONS = [
  { value: 'must_bring', label: 'Learner must bring' },
  { value: 'school_provides', label: 'School provides' },
  { value: 'optional', label: 'Optional' },
  { value: 'required_document', label: 'Required document' },
  { value: 'payment', label: 'Payment' },
  { value: 'requires_verification', label: 'Requires verification' },
];

const CATEGORY_OPTIONS = [
  'student',
  'document',
  'uniform',
  'stationery',
  'tools',
  'hygiene',
  'boarding',
  'payment',
  'other',
];

const toArray = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const toDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const emptyRequirement = () => ({
  title: '',
  type: 'must_bring',
  category: 'other',
  description: '',
  quantity: '',
  unit: '',
  levels: '',
  trades: '',
});

export default function AdmissionPackFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);

  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    school: '',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    title: '',
    levels: '',
    trades: '',
    instructions: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    admissionOpens: '',
    admissionCloses: '',
    paymentRequired: false,
    paymentChannels: '',
    paymentReference: '',
    paymentInstructions: '',
    requirements: [emptyRequirement()],
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
    if (!editing) return;
    (async () => {
      try {
        const res = await api.get(`/admission-packs/${id}`);
        const p = res.data.data.pack;
        if (p.status !== 'draft') {
          toast.error('Only draft packs can be edited. Create a new version instead.');
          navigate('/admission-packs', { replace: true });
          return;
        }
        setForm({
          school: p.school?.id || '',
          academicYear: p.academicYear,
          title: p.title,
          levels: (p.levels || []).join(', '),
          trades: (p.trades || []).join(', '),
          instructions: p.instructions || '',
          contactName: p.contact?.name || '',
          contactPhone: p.contact?.phone || '',
          contactEmail: p.contact?.email || '',
          admissionOpens: toDateInput(p.admissionPeriod?.opensAt),
          admissionCloses: toDateInput(p.admissionPeriod?.closesAt),
          paymentRequired: Boolean(p.paymentInfo?.required),
          paymentChannels: (p.paymentInfo?.channels || []).join(', '),
          paymentReference: p.paymentInfo?.reference || '',
          paymentInstructions: p.paymentInfo?.instructions || '',
          requirements:
            (p.requirements || []).length > 0
              ? p.requirements.map((r) => ({
                  title: r.title,
                  type: r.type,
                  category: r.category,
                  description: r.description || '',
                  quantity: r.quantity,
                  unit: r.unit,
                  levels: (r.appliesTo?.levels || []).join(', '),
                  trades: (r.appliesTo?.trades || []).join(', '),
                }))
              : [emptyRequirement()],
        });
      } catch (err) {
        toast.error(apiError(err).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editing]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setReq = (index, key, value) =>
    setForm((f) => {
      const requirements = f.requirements.map((r, i) =>
        i === index ? { ...r, [key]: value } : r
      );
      return { ...f, requirements };
    });

  const addReq = () => setForm((f) => ({ ...f, requirements: [...f.requirements, emptyRequirement()] }));
  const removeReq = (index) =>
    setForm((f) => ({ ...f, requirements: f.requirements.filter((_, i) => i !== index) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.school) return toast.error('Select a school.');
    if (!form.academicYear.trim()) return toast.error('Academic year is required.');
    const requirements = form.requirements
      .filter((r) => r.title.trim())
      .map((r) => ({
        title: r.title.trim(),
        type: r.type,
        category: r.category,
        description: r.description.trim(),
        quantity: r.quantity,
        unit: r.unit,
        appliesTo: { levels: toArray(r.levels), trades: toArray(r.trades) },
      }));
    if (requirements.length === 0) return toast.error('Add at least one requirement.');

    const payload = {
      school: form.school,
      academicYear: form.academicYear.trim(),
      title: form.title,
      levels: toArray(form.levels),
      trades: toArray(form.trades),
      instructions: form.instructions,
      contact: { name: form.contactName, phone: form.contactPhone, email: form.contactEmail },
      admissionPeriod: {
        opensAt: form.admissionOpens || null,
        closesAt: form.admissionCloses || null,
      },
      paymentInfo: {
        required: form.paymentRequired,
        channels: toArray(form.paymentChannels),
        reference: form.paymentReference,
        instructions: form.paymentInstructions,
      },
      requirements,
    };

    setSaving(true);
    try {
      if (editing) await api.patch(`/admission-packs/${id}`, payload);
      else await api.post('/admission-packs', payload);
      toast.success(editing ? 'Pack updated.' : 'Draft pack created.');
      navigate('/admission-packs');
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading pack…" />;

  return (
    <div>
      <PageHeader
        title={editing ? 'Edit admission pack' : 'New admission pack'}
        subtitle="Define the requirements learners must meet before joining"
        actions={
          <button onClick={() => navigate('/admission-packs')} className="btn-secondary">
            <ArrowLeft size={16} /> Back
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-4">
        <div className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <span className="label">Academic year</span>
              <input
                value={form.academicYear}
                onChange={(e) => set('academicYear', e.target.value)}
                className="input"
                placeholder="2026-2027"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Title</span>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className="input"
                placeholder="e.g. Senior 1 & Senior 4 intake"
              />
            </label>
            <label className="block">
              <span className="label">Levels (comma separated)</span>
              <input
                value={form.levels}
                onChange={(e) => set('levels', e.target.value)}
                className="input"
                placeholder="S1, S4"
              />
            </label>
            <label className="block">
              <span className="label">Trades (comma separated, optional)</span>
              <input
                value={form.trades}
                onChange={(e) => set('trades', e.target.value)}
                className="input"
                placeholder="sod, nit"
              />
            </label>
            <label className="block">
              <span className="label">Applications open</span>
              <input
                type="date"
                value={form.admissionOpens}
                onChange={(e) => set('admissionOpens', e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="label">Applications close</span>
              <input
                type="date"
                value={form.admissionCloses}
                onChange={(e) => set('admissionCloses', e.target.value)}
                className="input"
              />
            </label>
          </div>
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Requirements</h2>
            <button type="button" onClick={addReq} className="btn-secondary px-3 py-1.5 text-xs">
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="space-y-3">
            {form.requirements.map((r, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="label">Title</span>
                    <input
                      value={r.title}
                      onChange={(e) => setReq(index, 'title', e.target.value)}
                      className="input"
                      placeholder="e.g. School uniform"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Type</span>
                    <select
                      value={r.type}
                      onChange={(e) => setReq(index, 'type', e.target.value)}
                      className="input"
                    >
                      {TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Category</span>
                    <select
                      value={r.category}
                      onChange={(e) => setReq(index, 'category', e.target.value)}
                      className="input capitalize"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Quantity</span>
                    <input
                      value={r.quantity}
                      onChange={(e) => setReq(index, 'quantity', e.target.value)}
                      className="input"
                      placeholder="e.g. 2"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Unit</span>
                    <input
                      value={r.unit}
                      onChange={(e) => setReq(index, 'unit', e.target.value)}
                      className="input"
                      placeholder="e.g. pairs, books, RWF"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Applies to levels (optional)</span>
                    <input
                      value={r.levels}
                      onChange={(e) => setReq(index, 'levels', e.target.value)}
                      className="input"
                      placeholder="S1, S4"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Applies to trades (optional)</span>
                    <input
                      value={r.trades}
                      onChange={(e) => setReq(index, 'trades', e.target.value)}
                      className="input"
                      placeholder="sod, nit"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="label">Description (optional)</span>
                    <textarea
                      value={r.description}
                      onChange={(e) => setReq(index, 'description', e.target.value)}
                      className="input min-h-[60px]"
                      placeholder="Any details the family needs to know"
                    />
                  </label>
                </div>
                {form.requirements.length > 1 && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeReq(index)}
                      className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Payments</h2>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.paymentRequired}
              onChange={(e) => set('paymentRequired', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            A payment is required for admission
          </label>
          {form.paymentRequired && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Channels (comma separated)</span>
                <input
                  value={form.paymentChannels}
                  onChange={(e) => set('paymentChannels', e.target.value)}
                  className="input"
                  placeholder="bank, mobile_money"
                />
              </label>
              <label className="block">
                <span className="label">Payment reference</span>
                <input
                  value={form.paymentReference}
                  onChange={(e) => set('paymentReference', e.target.value)}
                  className="input"
                  placeholder="e.g. learner name"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Payment instructions</span>
                <textarea
                  value={form.paymentInstructions}
                  onChange={(e) => set('paymentInstructions', e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Accounts, amounts and receipts policy"
                />
              </label>
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Notes &amp; contact</h2>
          <label className="block">
            <span className="label">Instructions for families</span>
            <textarea
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              className="input min-h-[90px]"
              placeholder="Reporting dates, rules, contacts…"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="label">Contact name</span>
              <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Contact phone</span>
              <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">Contact email</span>
              <input value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} className="input" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/admission-packs')} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Save size={16} /> {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
