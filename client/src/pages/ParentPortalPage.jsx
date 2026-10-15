import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, MessageSquare, LogOut, CheckCircle2, Circle, Clock } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge } from '../components/layout.jsx';
import { PageLoader, EmptyState } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDate } from '../lib/format.js';

const PARENT_STATUS_COLORS = {
  pending: 'slate',
  preparing: 'amber',
  ready: 'green',
  unavailable: 'red',
  submitted: 'brand',
};

export default function ParentPortalPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, lang, setLang, languages } = useI18n();

  const [tab, setTab] = useState('checklist');
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [checklist, setChecklist] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/parent/children');
      setChildren(res.data.data.children);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  const openChild = async (child) => {
    setSelected(child);
    try {
      const res = await api.get(`/parent/children/${child.student.id}/checklist`);
      setChecklist(res.data.data);
    } catch (err) {
      toast.error(apiError(err).message);
    }
  };

  const setStatus = async (requirement, parentStatus) => {
    try {
      await api.patch(`/parent/checklist/${requirement.id}`, { parentStatus });
      const res = await api.get(`/parent/children/${selected.student.id}/checklist`);
      setChecklist(res.data.data);
      loadChildren();
    } catch (err) {
      toast.error(apiError(err).message);
    }
  };

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get('/parent/conversations');
      setConversations(res.data.data.conversations);
    } catch (err) {
      toast.error(apiError(err).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'messages') loadConversations();
  }, [tab, loadConversations]);

  const openConversation = async (conversation) => {
    setActiveConversation(conversation);
    try {
      const res = await api.get(`/parent/conversations/${conversation.id}/messages`);
      setMessages(res.data.data.messages);
      loadConversations();
    } catch (err) {
      toast.error(apiError(err).message);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeConversation) return;
    try {
      await api.post(`/parent/conversations/${activeConversation.id}/messages`, { body: draft });
      setDraft('');
      const res = await api.get(`/parent/conversations/${activeConversation.id}/messages`);
      setMessages(res.data.data.messages);
    } catch (err) {
      toast.error(apiError(err).message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              QL
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">QuickLink</p>
              <p className="text-[11px] text-slate-400">Parent portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="hidden text-sm text-slate-500 sm:inline">{user?.name}</span>
            <button
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="btn-ghost p-2 text-slate-500"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-5">
        <div className="mb-4 flex rounded-lg bg-slate-200/60 p-1 text-sm">
          <button
            onClick={() => setTab('checklist')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-medium ${
              tab === 'checklist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <GraduationCap size={16} /> {t('checklist.title')}
          </button>
          <button
            onClick={() => setTab('messages')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-medium ${
              tab === 'messages' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <MessageSquare size={16} /> Messages
          </button>
        </div>

        {tab === 'checklist' ? (
          loading ? (
            <PageLoader label="Loading…" />
          ) : children.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Awaiting school approval"
              description="Once the school approves your connection, your child's requirements will appear here."
            />
          ) : (
            <div className="space-y-4">
              {!selected ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {children.map((c) => (
                    <li key={c.student.id}>
                      <button onClick={() => openChild(c)} className="card w-full text-left hover:border-brand-300">
                        <p className="font-semibold text-slate-800">{c.student.fullName}</p>
                        <p className="text-sm text-slate-500">{c.student.schoolName}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            {c.checklist.complete}/{c.checklist.total} ready
                          </span>
                          <Badge color="brand">{c.checklist.readiness}%</Badge>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>
                  <button onClick={() => setSelected(null)} className="btn-ghost mb-2 px-2 py-1 text-sm">
                    ← All children
                  </button>
                  <div className="card">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-slate-800">{selected.student.fullName}</h2>
                        <p className="text-xs text-slate-400">{selected.student.schoolName}</p>
                      </div>
                      <Badge color="brand">{checklist?.summary.readiness ?? 0}% ready</Badge>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {checklist?.requirements.map((r) => (
                        <li key={r.id} className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{r.title}</p>
                              <p className="text-xs capitalize text-slate-400">
                                {r.category}
                                {r.quantity ? ` · ${r.quantity}${r.unit ? ` ${r.unit}` : ''}` : ''}
                                {r.deadline ? ` · due ${formatDate(r.deadline)}` : ''}
                              </p>
                            </div>
                            <Badge color={PARENT_STATUS_COLORS[r.parentStatus] || 'slate'}>
                              {t(`checklist.${r.parentStatus}`)}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {['preparing', 'ready', 'unavailable'].map((s) => (
                              <button
                                key={s}
                                onClick={() => setStatus(r, s)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                  r.parentStatus === s
                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                {s === 'ready' ? <CheckCircle2 size={12} className="mr-1 inline" /> : <Circle size={12} className="mr-1 inline" />}
                                {t(`checklist.${s}`)}
                              </button>
                            ))}
                          </div>
                          {r.schoolVerified && (
                            <p className="mt-1 text-xs text-brand-600">✓ Verified by the school</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
            <div className="card">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Conversations</h2>
              {conversations.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No messages yet.</p>
              ) : (
                <ul className="space-y-1">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => openConversation(c)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                          activeConversation?.id === c.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{c.studentName || 'School'}</span>
                          {c.unread > 0 && <Badge color="brand">{c.unread}</Badge>}
                        </div>
                        <p className="truncate text-xs text-slate-400">{c.lastMessagePreview || 'No messages'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card flex min-h-[320px] flex-col">
              {!activeConversation ? (
                <p className="m-auto text-sm text-slate-400">Select a conversation.</p>
              ) : (
                <>
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          m.senderRole === 'parent'
                            ? 'ml-auto bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {m.body}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={send} className="mt-3 flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message…"
                      className="input flex-1"
                    />
                    <button type="submit" disabled={!draft.trim()} className="btn-primary">
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
