import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ClipboardList, Copy, ExternalLink, Mail, MessageCircle, Plus, Radio, UserPlus } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, Modal, PageHeader } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../lib/format.js';

const blankForm = () => ({
  classId: '',
  title: '',
  description: '',
  placeholders: { name: 'Your full name', email: 'you@example.com', whatsapp: '+27 00 000 0000' },
  fields: [],
});

function publicImageUrl(imageUrl) {
  if (!imageUrl) return '';
  const origin = new URL(api.defaults.baseURL || '/', window.location.origin).origin;
  return `${origin}${imageUrl}`;
}

function whatsappLink(number, message) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export default function TrainingRegistrationsPage() {
  const toast = useToast();
  const [forms, setForms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [entries, setEntries] = useState([]);
  const [currentClass, setCurrentClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entryLoading, setEntryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [emailing, setEmailing] = useState('');
  const [copied, setCopied] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState(blankForm);
  const [image, setImage] = useState(null);
  const [nextFieldId, setNextFieldId] = useState(1);

  const selectedForm = useMemo(() => forms.find((form) => form.id === selectedId) || null, [forms, selectedId]);
  const session = currentClass?.liveSession;
  const joinUrl = session ? `${window.location.origin}/classes/join/${session.sessionCode}` : '';
  const liveRoomUrl = session ? `/classes/sessions/${session.id}/live` : '';

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const [formResponse, classResponse] = await Promise.all([
        api.get('/registrations'),
        api.get('/classes', { params: { limit: 100 } }),
      ]);
      const nextForms = formResponse.data.data.forms;
      setForms(nextForms);
      setClasses(classResponse.data.data.classes.filter((item) => item.active));
      if (!selectedId && nextForms.length) setSelectedId(nextForms[0].id);
      else if (selectedId && !nextForms.some((form) => form.id === selectedId)) setSelectedId(nextForms[0]?.id || '');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setLoading(false); }
  }, [selectedId, toast]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const loadSelected = useCallback(async () => {
    if (!selectedForm) { setEntries([]); setCurrentClass(null); return; }
    setEntryLoading(true);
    try {
      const [entryResponse, classResponse] = await Promise.all([
        api.get(`/registrations/${selectedForm.id}/entries`),
        api.get(`/classes/${selectedForm.classId}`),
      ]);
      setEntries(entryResponse.data.data.registrations);
      setCurrentClass(classResponse.data.data.class);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setEntryLoading(false); }
  }, [selectedForm, toast]);

  useEffect(() => { loadSelected(); }, [loadSelected]);

  const createForm = async (event) => {
    event.preventDefault();
    if (!formData.classId) { toast.error('Choose a training class.'); return; }
    setSaving(true);
    try {
      const response = await api.post('/registrations', formData);
      const created = response.data.data.form;
      if (image) {
        const body = new FormData();
        body.append('image', image);
        await api.post(`/registrations/${created.id}/image`, body);
      }
      setCreateOpen(false);
      setFormData(blankForm());
      setImage(null);
      toast.success('Shareable training registration form created.');
      await loadForms();
      setSelectedId(created.id);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setSaving(false); }
  };

  const startClass = async () => {
    if (!selectedForm) return;
    setStarting(true);
    try {
      let updatedClass = (await api.get(`/classes/${selectedForm.classId}`)).data.data.class;
      if (!updatedClass.liveSession) {
        const response = await api.post(`/classes/${selectedForm.classId}/sessions`, { title: selectedForm.title });
        updatedClass = { ...updatedClass, liveSession: response.data.data.session };
      }
      setCurrentClass(updatedClass);
      toast.success(updatedClass.liveSession.status === 'live' ? 'Live class is ready. You can now send invitations.' : 'Live class started.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setStarting(false); }
  };

  const sendEmail = async (entry) => {
    if (!selectedForm) return;
    setEmailing(entry.id);
    try {
      await api.post(`/registrations/${selectedForm.id}/entries/${entry.id}/email`);
      toast.success(`Live-class invitation sent to ${entry.email}.`);
    } catch (error) { toast.error(apiError(error).message); }
    finally { setEmailing(''); }
  };

  const copyFormLink = async () => {
    if (!selectedForm) return;
    const url = `${window.location.origin}${selectedForm.publicUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Registration link copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy the link. You can select and copy it manually.'); }
  };

  const toggleActive = async () => {
    try {
      const response = await api.patch(`/registrations/${selectedForm.id}`, { active: !selectedForm.active });
      setForms((items) => items.map((item) => item.id === selectedForm.id ? { ...item, active: response.data.data.form.active } : item));
      toast.success(response.data.data.form.active ? 'Registration form is active.' : 'Registration form is paused.');
    } catch (error) { toast.error(apiError(error).message); }
  };

  const addField = () => {
    const key = `custom_${nextFieldId}`;
    setNextFieldId((id) => id + 1);
    setFormData((value) => ({ ...value, fields: [...value.fields, { key, label: '', placeholder: '', required: false }] }));
  };

  if (loading) return <PageLoader label="Loading training registrations…" />;

  return <div>
    <PageHeader title="Training registrations" subtitle="Create a shareable registration form for a training, review submissions, and invite registrants to a live class." actions={<button className="btn-primary" onClick={() => { setFormData(blankForm()); setImage(null); setCreateOpen(true); }}><Plus size={17} />Create form</button>} />
    {forms.length === 0 ? <EmptyState icon={ClipboardList} title="No registration forms yet" description="Create a public form for an active training class. Registrants are stored separately and will not get student accounts." action={<button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={17} />Create registration form</button>} /> :
      <div className="grid gap-5 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,2fr)]">
        <section className="space-y-2">
          {forms.map((form) => <button key={form.id} onClick={() => setSelectedId(form.id)} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedId === form.id ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <div className="flex items-start justify-between gap-2"><span className="font-semibold text-slate-900">{form.title}</span><Badge color={form.active ? 'green' : 'slate'}>{form.active ? 'Active' : 'Paused'}</Badge></div>
            <p className="mt-1 text-sm text-slate-500">{form.classTitle}</p>
            <p className="mt-3 text-xs text-slate-400">{form.registrationCount} registration{form.registrationCount === 1 ? '' : 's'}</p>
          </button>)}
        </section>
        {selectedForm && <section className="min-w-0 space-y-4">
          <div className="card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{selectedForm.title}</h2><Badge color={selectedForm.active ? 'green' : 'slate'}>{selectedForm.active ? 'Active' : 'Paused'}</Badge></div><p className="mt-1 text-sm text-slate-500">Training: {selectedForm.classTitle}</p><p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{window.location.origin}{selectedForm.publicUrl}</p></div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button className="btn-secondary" onClick={copyFormLink}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy link'}</button>
                <a className="btn-secondary" href={`${window.location.origin}${selectedForm.publicUrl}`} target="_blank" rel="noreferrer"><ExternalLink size={16} />Preview</a>
                <button className="btn-secondary" onClick={toggleActive}>{selectedForm.active ? 'Pause form' : 'Activate form'}</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <button className="btn-primary" disabled={starting || !currentClass?.active} onClick={startClass}>{starting ? <Spinner size={16} /> : <Radio size={16} />}{session ? 'Live class ready' : 'Start live class'}</button>
              {liveRoomUrl && <Link className="btn-secondary" to={liveRoomUrl}><ExternalLink size={16} />Open classroom</Link>}
              {session && <span className="text-xs text-slate-500">Registrants must sign in with an enrolled student account to join.</span>}
            </div>
          </div>
          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Registered people</h2><p className="text-sm text-slate-500">{entries.length} registration{entries.length === 1 ? '' : 's'}</p></div><button className="btn-secondary" disabled={entryLoading} onClick={loadSelected}>Refresh</button></div>
            {!session && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Start the class to enable live-class invitations. Email uses the configured SMTP service; WhatsApp opens a prefilled message for you to send.</p>}
            {entryLoading ? <div className="py-8 text-center"><Spinner size={22} /></div> : entries.length === 0 ? <EmptyState icon={UserPlus} title="No one has registered yet" description="Share the form link with prospective trainees." /> : <div className="space-y-3">
              {entries.map((entry) => {
                const message = session ? `Hello ${entry.name}, join the live ${selectedForm.title} class here: ${joinUrl}. Sign in with an enrolled QuickLink student account.` : '';
                const waUrl = whatsappLink(entry.whatsapp, message);
                return <article key={entry.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{entry.name}</h3>
                      <a className="mt-1 block break-all text-sm text-brand-700 hover:underline" href={`mailto:${entry.email}`}>{entry.email}</a>
                      <a className="mt-1 block text-sm text-slate-500 hover:underline" href={`tel:${entry.whatsapp}`}>{entry.whatsapp}</a>
                      <p className="mt-2 text-xs text-slate-400">Registered {formatDateTime(entry.createdAt)}</p>
                      {selectedForm.fields?.filter((field) => entry.answers[field.key]).map((field) => <p key={field.key} className="mt-2 text-sm text-slate-600"><span className="font-medium">{field.label}:</span> {entry.answers[field.key]}</p>)}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button className="btn-secondary" disabled={!session || emailing === entry.id} onClick={() => sendEmail(entry)}>{emailing === entry.id ? <Spinner size={15} /> : <Mail size={15} />}Email invite</button>
                      {waUrl ? <a className="btn-secondary" href={waUrl} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a> : <button className="btn-secondary" disabled title={session ? 'This registration has no usable WhatsApp number.' : 'Start the live class first.'}><MessageCircle size={15} />WhatsApp</button>}
                    </div>
                  </div>
                </article>;
              })}
            </div>}
          </div>
        </section>}
      </div>}

    <Modal open={createOpen} onClose={() => !saving && setCreateOpen(false)} title="Create training registration form" size="manage" footer={<><button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</button><button form="training-registration-form" type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner size={16} /> : <Plus size={16} />}Create and share</button></>}>
      <form id="training-registration-form" onSubmit={createForm} className="space-y-4">
        <div><label className="label" htmlFor="registration-class">Training class</label><select id="registration-class" className="input" required value={formData.classId} onChange={(event) => setFormData({ ...formData, classId: event.target.value })}><option value="">Select a class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.course || item.title} — {item.title}</option>)}</select>{classes.length === 0 && <p className="mt-1 text-xs text-amber-700">Create an active class before making a registration form.</p>}</div>
        <div><label className="label" htmlFor="registration-title">Form title</label><input id="registration-title" className="input" minLength={2} maxLength={160} placeholder="Defaults to the selected training title" value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} /></div>
        <div><label className="label" htmlFor="registration-description">Description</label><textarea id="registration-description" className="input min-h-24" maxLength={4000} placeholder="Describe the training and what registrants should expect." value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} /></div>
        <div><p className="label">Field placeholders</p><div className="grid gap-3 sm:grid-cols-3">{[['name', 'Name'], ['email', 'Email'], ['whatsapp', 'WhatsApp number']].map(([key, label]) => <div key={key}><label className="sr-only" htmlFor={`placeholder-${key}`}>{label} placeholder</label><input id={`placeholder-${key}`} className="input" maxLength={120} aria-label={`${label} placeholder`} placeholder={label} value={formData.placeholders[key]} onChange={(event) => setFormData({ ...formData, placeholders: { ...formData.placeholders, [key]: event.target.value } })} /></div>)}</div></div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="font-semibold text-slate-800">Custom fields</p><p className="text-xs text-slate-500">Add up to 10 text fields to collect training-specific details.</p></div><button type="button" className="btn-secondary" disabled={formData.fields.length >= 10} onClick={addField}><Plus size={15} />Add field</button></div>
          <div className="space-y-3">{formData.fields.map((field, index) => <div key={field.key} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"><input className="input" required maxLength={80} aria-label={`Custom field ${index + 1} label`} placeholder="Field label" value={field.label} onChange={(event) => setFormData((value) => ({ ...value, fields: value.fields.map((item) => item.key === field.key ? { ...item, label: event.target.value } : item) }))} /><input className="input" maxLength={120} aria-label={`Custom field ${index + 1} placeholder`} placeholder="Placeholder" value={field.placeholder} onChange={(event) => setFormData((value) => ({ ...value, fields: value.fields.map((item) => item.key === field.key ? { ...item, placeholder: event.target.value } : item) }))} /><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={field.required} onChange={(event) => setFormData((value) => ({ ...value, fields: value.fields.map((item) => item.key === field.key ? { ...item, required: event.target.checked } : item) }))} />Required</label><button type="button" className="btn-ghost text-red-600" onClick={() => setFormData((value) => ({ ...value, fields: value.fields.filter((item) => item.key !== field.key) }))}>Remove</button></div>)}</div>
        </div>
        <div><label className="label" htmlFor="registration-image">Header image (optional, PNG/JPEG/WebP, max 3 MB)</label><input id="registration-image" type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={(event) => setImage(event.target.files?.[0] || null)} />{image && <p className="mt-1 text-xs text-slate-500">Selected: {image.name}</p>}</div>
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Registrations are stored as contact records only and do not create student accounts or enroll anyone in the class.</p>
      </form>
    </Modal>
  </div>;
}
