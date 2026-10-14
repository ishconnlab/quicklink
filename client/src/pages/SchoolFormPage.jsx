import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  AlertTriangle,
  WifiOff,
  CloudUpload,
  Info,
  Building2,
} from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Modal, Badge } from '../components/layout.jsx';
import { PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import idb, { STORES, makeClientId } from '../lib/db.js';
import { TRADE_KEYS, TRADE_LABELS, toInputDate, classNames } from '../lib/format.js';

const DRAFT_ID = 'new-school-draft';

const NA_WORDS = /^(n\/?a|na|nil|none|unknown|not[\s-]?applicable|no[\s-]?record|-{1,2})$/i;

// Flexible count: blank -> null (unknown), NA words -> 'N/A' (explicit no
// record), otherwise a number (NaN when invalid).
function normaliseCount(value) {
  const s = String(value ?? '').trim();
  if (s === '') return null;
  if (NA_WORDS.test(s)) return 'N/A';
  const n = Number(s);
  return Number.isNaN(n) ? Number.NaN : n;
}
const isValidCount = (v) => v === null || v === 'N/A' || (Number.isInteger(v) && v >= 0);

const emptyForm = () => ({
  holding: '',
  schoolName: '',
  district: '',
  dateOfCollection: toInputDate(new Date()),
  sod: '',
  nit: '',
  csa: '',
  acc: '',
  other: '',
  laptops: '',
  teachers: '',
  feedback: '',
});

export default function SchoolFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { online, enqueue } = useSync();

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [duplicates, setDuplicates] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const draftRef = useRef(null);

  // Load existing record for edit.
  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    setLoading(true);
    api
      .get(`/schools/${id}`)
      .then((res) => {
        if (!active) return;
        const s = res.data.data.school;
        setForm({
          holding: s.holding.name,
          schoolName: s.schoolName,
          district: s.district,
          dateOfCollection: toInputDate(s.dateOfCollection),
          sod: s.trades.sod ?? '',
          nit: s.trades.nit ?? '',
          csa: s.trades.csa ?? '',
          acc: s.trades.acc ?? '',
          other: s.trades.other ?? '',
          laptops: s.laptops ?? '',
          teachers: s.teachers ?? '',
          feedback: s.feedback || '',
        });
      })
      .catch((err) => toast.error(apiError(err).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // Restore unsaved draft for a new record.
  useEffect(() => {
    if (isEdit) return;
    idb.get(STORES.DRAFTS, DRAFT_ID).then((draft) => {
      if (draft?.form) setForm((f) => ({ ...f, ...draft.form }));
    });
  }, [isEdit]);

  // Persist a local draft (new records only).
  useEffect(() => {
    if (isEdit || loading) return undefined;
    clearTimeout(draftRef.current);
    draftRef.current = setTimeout(() => {
      idb.put(STORES.DRAFTS, { id: DRAFT_ID, form, updatedAt: Date.now() });
    }, 600);
    return () => clearTimeout(draftRef.current);
  }, [form, isEdit, loading]);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // Live total: blank values are unknown (not counted); "N/A" counts as zero.
  const tradeValues = TRADE_KEYS.map((k) => normaliseCount(form[k]));
  const total = tradeValues.reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
  const unknownTrades = TRADE_KEYS.filter((k) => normaliseCount(form[k]) === null);
  const hasUnknowns =
    unknownTrades.length > 0 ||
    normaliseCount(form.laptops) === null ||
    normaliseCount(form.teachers) === null;

  const validate = () => {
    const e = {};
    if (!form.holding.trim()) e.holding = 'Holding / project is required';
    if (form.schoolName.trim().length < 2) e.schoolName = 'School name is required';
    if (!form.district.trim()) e.district = 'District is required';
    if (!form.dateOfCollection) e.dateOfCollection = 'Date is required';
    for (const k of TRADE_KEYS) {
      if (!isValidCount(normaliseCount(form[k]))) {
        e[k] = 'Enter a whole number or N/A';
      }
    }
    if (!isValidCount(normaliseCount(form.laptops))) {
      e.laptops = 'Enter a whole number or N/A';
    }
    if (!isValidCount(normaliseCount(form.teachers))) {
      e.teachers = 'Enter a whole number or N/A';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payloadCount = (v) => {
    const n = normaliseCount(v);
    return typeof n === 'number' || n === 'N/A' || n === null ? n : null;
  };

  const buildPayload = () => ({
    holding: form.holding.trim(),
    schoolName: form.schoolName.trim(),
    district: form.district.trim(),
    dateOfCollection: form.dateOfCollection,
    trades: {
      sod: payloadCount(form.sod),
      nit: payloadCount(form.nit),
      csa: payloadCount(form.csa),
      acc: payloadCount(form.acc),
      other: payloadCount(form.other),
    },
    laptops: payloadCount(form.laptops),
    teachers: payloadCount(form.teachers),
    feedback: form.feedback.trim(),
  });

  const saveOffline = useCallback(
    async (payload) => {
      const clientId = makeClientId();
      await enqueue({ ...payload, clientId });
      await idb.delete(STORES.DRAFTS, DRAFT_ID);
      toast.info('Saved locally. This record will sync to the server when you are online.');
      navigate('/sync');
    },
    [enqueue, navigate, toast]
  );

  const submit = async (confirmDuplicate = false) => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    const payload = buildPayload();
    setSaving(true);

    // Editing requires a live connection so the change is authoritative.
    if (isEdit) {
      if (!online) {
        setSaving(false);
        toast.error('You are offline. Reconnect to update an existing record.');
        return;
      }
      try {
        await api.patch(`/schools/${id}`, payload);
        toast.success('School record updated.');
        navigate(`/schools/${id}`);
      } catch (err) {
        const info = apiError(err);
        if (err.response?.status === 409 && !confirmDuplicate) {
          const dup = info.details?.duplicates || [];
          setDuplicates(dup);
          setPendingPayload({ mode: 'edit' });
        } else if (info.offline) {
          toast.error('Connection lost. Please try again when online.');
        } else {
          toast.error(info.message);
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    // Creating offline: queue locally. Server is never claimed to have saved.
    if (!online) {
      try {
        await saveOffline(payload);
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      // Duplicate pre-check.
      if (!confirmDuplicate) {
        const check = await api.get('/schools/check-duplicate', {
          params: { schoolName: payload.schoolName, holding: payload.holding },
        });
        const found = check.data.data.duplicates || [];
        if (found.length > 0) {
          setDuplicates(found);
          setPendingPayload({ mode: 'create', payload });
          setSaving(false);
          return;
        }
      }

      const res = await api.post('/schools', { ...payload, confirmDuplicate });
      await idb.delete(STORES.DRAFTS, DRAFT_ID);
      toast.success('School record saved to the server.');
      navigate(`/schools/${res.data.data.school.id}`);
    } catch (err) {
      const info = apiError(err);
      if (info.offline) {
        // Network dropped mid-submit: fall back to the offline queue.
        await saveOffline(payload);
      } else if (err.response?.status === 409) {
        setDuplicates(info.details?.duplicates || []);
        setPendingPayload({ mode: 'create', payload });
      } else {
        toast.error(info.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmCreateDuplicate = async () => {
    const mode = pendingPayload?.mode;
    setDuplicates(null);
    if (mode === 'edit') {
      setPendingPayload(null);
      await submit(true);
    } else {
      const payload = pendingPayload?.payload;
      setPendingPayload(null);
      if (!payload) return;
      setSaving(true);
      try {
        if (!online) {
          await saveOffline(payload);
        } else {
          const res = await api.post('/schools', { ...payload, confirmDuplicate: true });
          await idb.delete(STORES.DRAFTS, DRAFT_ID);
          toast.success('School record saved to the server.');
          navigate(`/schools/${res.data.data.school.id}`);
        }
      } catch (err) {
        const info = apiError(err);
        if (info.offline) await saveOffline(payload);
        else toast.error(info.message);
      } finally {
        setSaving(false);
      }
    }
  };

  if (loading) return <PageLoader label="Loading record…" />;

  const CountField = ({ name, label }) => (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="label mb-0">{label}</label>
        <button
          type="button"
          onClick={() => setField(name, form[name] === 'N/A' ? '' : 'N/A')}
          title="No record / not applicable"
          className={classNames(
            'rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors',
            form[name] === 'N/A'
              ? 'bg-brand-100 text-brand-700'
              : 'text-slate-400 hover:bg-slate-100'
          )}
        >
          N/A
        </button>
      </div>
      <input
        type="text"
        inputMode="text"
        value={form[name]}
        onChange={(e) => setField(name, e.target.value)}
        className={`input ${errors[name] ? 'ring-2 ring-red-400' : ''}`}
        placeholder="Enter number or N/A"
      />
      {errors[name] && <p className="mt-1 text-xs text-red-600">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <PageHeader
        title={isEdit ? 'Edit school record' : 'New school record'}
        subtitle={isEdit ? 'Update the details and save' : 'Capture a school data collection entry'}
      />

      {!online && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <WifiOff size={18} className="mt-0.5 shrink-0" />
          <span>
            You are offline. {isEdit ? 'Reconnect to edit this record.' : 'This record will be stored on your device and synced automatically once you are back online.'}
          </span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="space-y-4"
      >
        <div className="card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 size={16} /> School details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Holding / project *</label>
              <input
                value={form.holding}
                onChange={(e) => setField('holding', e.target.value)}
                className={`input ${errors.holding ? 'ring-2 ring-red-400' : ''}`}
                placeholder="e.g. Northern Education Initiative"
                list="holdings-list"
              />
              {errors.holding && <p className="mt-1 text-xs text-red-600">{errors.holding}</p>}
            </div>
            <div>
              <label className="label">School name *</label>
              <input
                value={form.schoolName}
                onChange={(e) => setField('schoolName', e.target.value)}
                className={`input ${errors.schoolName ? 'ring-2 ring-red-400' : ''}`}
                placeholder="e.g. Central Community School"
              />
              {errors.schoolName && <p className="mt-1 text-xs text-red-600">{errors.schoolName}</p>}
            </div>
            <div>
              <label className="label">District *</label>
              <input
                value={form.district}
                onChange={(e) => setField('district', e.target.value)}
                className={`input ${errors.district ? 'ring-2 ring-red-400' : ''}`}
                placeholder="e.g. Central"
              />
              {errors.district && <p className="mt-1 text-xs text-red-600">{errors.district}</p>}
            </div>
            <div>
              <label className="label">Date of data collection *</label>
              <input
                type="date"
                value={form.dateOfCollection}
                onChange={(e) => setField('dateOfCollection', e.target.value)}
                className={`input ${errors.dateOfCollection ? 'ring-2 ring-red-400' : ''}`}
              />
              {errors.dateOfCollection && (
                <p className="mt-1 text-xs text-red-600">{errors.dateOfCollection}</p>
              )}
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Students by trade</h2>
            <Badge color="brand">Total: {total}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            Leave a field blank if the value is unknown (recorded as incomplete, never counted as
            zero). Tap <span className="font-semibold">N/A</span> when a value explicitly does not
            apply.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {TRADE_KEYS.map((k) => (
              <CountField key={k} name={k} label={TRADE_LABELS[k]} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CountField name="laptops" label="Laptops" />
            <CountField name="teachers" label="Teachers" />
          </div>
          {hasUnknowns && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                This record is missing some values ({unknownTrades.map((k) => TRADE_LABELS[k]).join(', ')}
                {unknownTrades.length && (form.laptops === '' || form.teachers === '') ? ', ' : ''}
                {form.laptops === '' ? 'Laptops' : ''}
                {form.laptops === '' && form.teachers === '' ? ', ' : ''}
                {form.teachers === '' ? 'Teachers' : ''}
                ). It will be flagged as incomplete.
              </span>
            </div>
          )}
        </div>

        <div className="card">
          <label className="label">Additional feedback from the school</label>
          <textarea
            value={form.feedback}
            onChange={(e) => setField('feedback', e.target.value)}
            rows={4}
            maxLength={5000}
            className="input resize-y"
            placeholder="Notes, requests, challenges, follow-up actions…"
          />
        </div>

        <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4">
          <Link to={isEdit ? `/schools/${id}` : '/schools'} className="btn-secondary flex-1">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? (
              <Spinner size={18} />
            ) : online ? (
              <Save size={18} />
            ) : (
              <CloudUpload size={18} />
            )}
            {saving ? 'Saving…' : online ? 'Save record' : 'Save offline'}
          </button>
        </div>
      </form>

      <Modal
        open={!!duplicates}
        onClose={() => {
          setDuplicates(null);
          setPendingPayload(null);
        }}
        title="Possible duplicate school"
        footer={
          <>
            <button
              onClick={() => {
                setDuplicates(null);
                setPendingPayload(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button onClick={confirmCreateDuplicate} className="btn-primary" disabled={saving}>
              Save anyway
            </button>
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            A school with this name already exists under this holding/project. Confirm that this is a
            different school before continuing.
          </span>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {duplicates?.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-slate-800">{d.schoolName}</span>
              <span className="text-slate-500">{d.district}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
