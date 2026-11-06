import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { Modal } from '../components/layout.jsx';

const DialogContext = createContext(null);

function DialogSurface({ request, finish }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    (request.fields || []).map((field) => [field.name, field.value ?? ''])
  ));
  const isDanger = request.tone === 'danger';
  const Icon = isDanger ? ShieldAlert : request.kind === 'confirm' ? AlertTriangle : Info;
  const canSubmit = !request.confirmationText || values.confirmation === request.confirmationText;

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (request.kind === 'confirm') finish(true);
    else if (request.kind === 'prompt') finish(values[request.fields[0].name] ?? '');
    else finish(values);
  };

  return (
    <Modal
      open
      onClose={() => finish(null)}
      title={request.title}
      size="sm"
    >
      <form onSubmit={submit}>
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isDanger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'}`}>
            <Icon size={20} />
          </span>
          <p className="whitespace-pre-wrap pt-1 text-sm leading-6 text-slate-600">{request.message}</p>
        </div>

        {request.fields?.length > 0 && <div className="mt-4 space-y-3">
          {request.fields.map((field, index) => <label key={field.name} className="block">
            <span className="label">{field.label}</span>
            {field.type === 'select' ? <select
              className="input"
              value={values[field.name] ?? ''}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              required={field.required}
              autoFocus={index === 0}
            >
              {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select> : field.type === 'textarea' ? <textarea
              className="input min-h-24"
              value={values[field.name] ?? ''}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              placeholder={field.placeholder}
              required={field.required}
              maxLength={field.maxLength}
              autoFocus={index === 0}
            /> : <input
              className="input"
              type={field.type || 'text'}
              value={values[field.name] ?? ''}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              placeholder={field.placeholder}
              required={field.required}
              maxLength={field.maxLength}
              autoFocus={index === 0}
            />}
          </label>)}
        </div>}

        {request.confirmationText && <label className="mt-4 block">
          <span className="label">Type <strong>{request.confirmationText}</strong> to confirm</span>
          <input
            className="input"
            value={values.confirmation ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, confirmation: event.target.value }))}
            autoComplete="off"
            autoFocus
          />
        </label>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => finish(null)}>{request.cancelLabel || 'Cancel'}</button>
          <button type="submit" className={isDanger ? 'btn-danger' : 'btn-primary'} disabled={!canSubmit}>
            {request.confirmLabel || (request.kind === 'confirm' ? 'Confirm' : 'Continue')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DialogProvider({ children }) {
  const [requests, setRequests] = useState([]);
  const requestsRef = useRef([]);
  const nextId = useRef(0);

  const enqueue = useCallback((request) => new Promise((resolve) => {
    const next = [...requestsRef.current, { ...request, id: ++nextId.current, resolve }];
    requestsRef.current = next;
    setRequests(next);
  }), []);

  const confirm = useCallback((options) => enqueue({ ...options, kind: 'confirm' }), [enqueue]);
  const prompt = useCallback((options) => enqueue({
    ...options,
    kind: 'prompt',
    fields: [{
      name: 'value',
      label: options.label || 'Your response',
      value: options.initialValue ?? '',
      type: options.multiline ? 'textarea' : 'text',
      placeholder: options.placeholder,
      required: options.required,
      maxLength: options.maxLength,
    }],
  }), [enqueue]);
  const form = useCallback((options) => enqueue({ ...options, kind: 'form' }), [enqueue]);

  const finish = (result) => {
    const [active, ...remaining] = requestsRef.current;
    requestsRef.current = remaining;
    active?.resolve(result);
    setRequests(remaining);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, form }}>
      {children}
      {requests[0] && <DialogSurface key={requests[0].id} request={requests[0]} finish={finish} />}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialog must be used within DialogProvider');
  return context;
}
