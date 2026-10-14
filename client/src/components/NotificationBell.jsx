import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, UserPlus, GraduationCap, Info } from 'lucide-react';
import api from '../api/client.js';
import { classNames, formatDateTime } from '../lib/format.js';

const ICONS = {
  registration: UserPlus,
  student: GraduationCap,
  info: Info,
};

export default function NotificationBell({ openUp = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setItems(res.data.data.notifications);
      setUnread(res.data.data.unreadCount);
    } catch {
      /* notifications are non-critical */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setUnread(0);
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    api.post('/notifications/read-all').catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={classNames(
            'absolute right-0 z-40 w-80 max-w-[85vw] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg',
            openUp ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] || Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={classNames(
                      'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50',
                      !n.read && 'bg-brand-50'
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                      {n.message && (
                        <span className="mt-0.5 block text-xs text-slate-500">{n.message}</span>
                      )}
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
