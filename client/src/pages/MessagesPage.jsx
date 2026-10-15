import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Send, ArrowLeft } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge } from '../components/layout.jsx';
import { EmptyState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDateTime } from '../lib/format.js';

export default function MessagesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const bottomRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get('/conversations');
      setConversations(res.data.data.conversations);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const loadThread = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/conversations/${id}/messages`);
      setConversation(res.data.data.conversation);
      setMessages(res.data.data.messages);
      loadConversations();
    } catch (err) {
      toast.error(apiError(err).message);
      navigate('/messages', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadConversations, navigate]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !id) return;
    setBusy(true);
    try {
      await api.post(`/conversations/${id}/messages`, { body: draft });
      setDraft('');
      await loadThread();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const active = conversations.find((c) => c.id === id);

  return (
    <div>
      {!id && <PageHeader title="Messages" subtitle="Parent communication centre" />}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className={`card overflow-hidden p-0 ${id ? 'hidden lg:block' : ''}`}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Conversations</h2>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              No conversations yet. Open a learner and use “Message school”.
            </p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate(`/messages/${c.id}`)}
                    className={`w-full px-4 py-3 text-left transition ${
                      c.id === id ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {c.studentName || c.schoolName || 'Conversation'}
                      </span>
                      {c.unread > 0 && <Badge color="brand">{c.unread}</Badge>}
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {c.lastMessagePreview || 'No messages yet'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`card flex min-h-[60vh] flex-col ${!id ? 'hidden lg:flex' : ''}`}>
          {!id ? (
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a learner to read and reply to guardian messages."
            />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <button
                  onClick={() => navigate('/messages')}
                  className="btn-ghost p-1.5 lg:hidden"
                  aria-label={t('common.back')}
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {active?.studentName || conversation?.subject || 'Conversation'}
                  </p>
                  {active?.indexNumber && (
                    <p className="text-xs text-slate-400">{active.indexNumber}</p>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400">No messages yet. Say hello.</p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      m.senderRole === 'staff'
                        ? 'ml-auto bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.senderRole === 'staff' ? 'text-brand-100' : 'text-slate-400'
                      }`}
                    >
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex gap-2 border-t border-slate-100 pt-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  className="input flex-1"
                />
                <button type="submit" disabled={busy || !draft.trim()} className="btn-primary">
                  <Send size={16} /> Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
