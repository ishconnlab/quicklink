import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileStack, Pencil, Trash2, Send, Archive, Copy } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal } from '../components/layout.jsx';
import { PageLoader, EmptyState } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { formatDate } from '../lib/format.js';

const STATUS_COLORS = { draft: 'slate', published: 'green', archived: 'amber' };

export default function AdmissionPacksPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      const res = await api.get('/admission-packs', { params });
      setPacks(res.data.data.packs);
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, successMessage) => {
    setActing(true);
    try {
      await fn();
      toast.success(successMessage);
      load();
    } catch (err) {
      toast.error(apiError(err).message);
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('pack.title')}
        subtitle={t('pack.subtitle')}
        actions={
          <Link to="/admission-packs/new" className="btn-primary">
            <Plus size={16} /> {t('pack.new')}
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input sm:w-48">
          <option value="">All packs</option>
          <option value="draft">{t('pack.status.draft')}</option>
          <option value="published">{t('pack.status.published')}</option>
          <option value="archived">{t('pack.status.archived')}</option>
        </select>
      </div>

      {loading ? (
        <PageLoader label="Loading admission packs…" />
      ) : packs.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No admission packs yet"
          description="Create a pack with the requirements learners must bring, then publish it to start receiving applications."
          action={
            <Link to="/admission-packs/new" className="btn-primary">
              <Plus size={16} /> {t('pack.new')}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {packs.map((p) => (
            <li key={p.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">
                    {p.title || `${p.academicYear} intake`}
                  </p>
                  <p className="text-sm text-slate-500">{p.school.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.academicYear} · {p.requirements.length} requirement
                    {p.requirements.length === 1 ? '' : 's'}
                    {p.version > 0 ? ` · v${p.version}` : ''}
                  </p>
                  {p.publishedAt && (
                    <p className="mt-1 text-xs text-slate-400">
                      Published {formatDate(p.publishedAt)}
                    </p>
                  )}
                </div>
                <Badge color={STATUS_COLORS[p.status] || 'slate'}>{t(`pack.status.${p.status}`)}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.status === 'draft' && (
                  <>
                    <Link to={`/admission-packs/${p.id}/edit`} className="btn-secondary px-3 py-1.5 text-xs">
                      <Pencil size={14} /> Edit
                    </Link>
                    <button
                      onClick={() => act(() => api.post(`/admission-packs/${p.id}/publish`), 'Pack published.')}
                      disabled={acting}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      <Send size={14} /> {t('pack.publish')}
                    </button>
                    <button
                      onClick={() => setConfirm({ pack: p, action: 'delete' })}
                      className="btn-ghost px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} /> {t('common.delete')}
                    </button>
                  </>
                )}
                {p.status === 'published' && (
                  <>
                    <button
                      onClick={() => act(() => api.post(`/admission-packs/${p.id}/new-version`), 'New draft version created.')}
                      disabled={acting}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      <Copy size={14} /> {t('pack.newVersion')}
                    </button>
                    <button
                      onClick={() => act(() => api.post(`/admission-packs/${p.id}/archive`), 'Pack archived.')}
                      disabled={acting}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      <Archive size={14} /> {t('pack.archive')}
                    </button>
                  </>
                )}
                {p.status === 'archived' && (
                  <button
                    onClick={() => act(() => api.post(`/admission-packs/${p.id}/new-version`), 'New draft version created.')}
                    disabled={acting}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    <Copy size={14} /> {t('pack.newVersion')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete draft pack"
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              onClick={() =>
                act(() => api.delete(`/admission-packs/${confirm.pack.id}`), 'Pack removed.')
              }
              disabled={acting}
              className="btn-primary bg-red-600 hover:bg-red-700"
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">{confirm?.pack?.title || confirm?.pack?.academicYear}</span>?
          This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
