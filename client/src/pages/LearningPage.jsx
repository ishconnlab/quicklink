import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Clock3, Download, FileSpreadsheet, FileText, Presentation, Search, Settings2, Upload, RotateCw, Trash2, ZoomIn, ZoomOut, Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { PageHeader, Badge, Modal, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin as isAdminUser } from '../lib/roles.js';

const LEVELS = ['All levels', 'L3', 'L4', 'L5'];
const FORMATS = ['pdf', 'doc', 'docx', 'txt', 'md', 'ppt', 'pptx', 'xls', 'xlsx'];
const FORMAT_NAMES = { pdf: 'PDF', doc: 'Word', docx: 'Word', txt: 'Text', md: 'Markdown', ppt: 'PowerPoint', pptx: 'PowerPoint', xls: 'Excel', xlsx: 'Excel' };
const progressKind = (format) => ({ pdf: 'page', ppt: 'slide', pptx: 'slide', xls: 'sheet', xlsx: 'sheet', doc: 'section', docx: 'section' })[format] || 'document';
const fmtSize = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const PdfPage = lazy(() => import('../components/PdfPage.jsx'));

function MarkdownPreview({ content }) {
  const lines = (content || '').split(/\r?\n/);
  return <div className="prose prose-slate max-w-none whitespace-pre-wrap text-sm">
    {lines.map((line, index) => {
      if (/^#{1,6}\s/.test(line)) { const depth = Math.min(line.match(/^#+/)[0].length, 4); const Tag = `h${depth}`; return <Tag key={index} className="my-2 font-semibold">{line.replace(/^#{1,6}\s+/, '')}</Tag>; }
      if (/^\s*[-*+]\s/.test(line)) return <p key={index} className="my-1 pl-4">• {line.replace(/^\s*[-*+]\s+/, '')}</p>;
      if (/^\s*\d+\.\s/.test(line)) return <p key={index} className="my-1 pl-4">{line.trim()}</p>;
      if (/^>\s?/.test(line)) return <blockquote key={index} className="my-1 border-l-2 border-slate-300 pl-3 text-slate-600">{line.replace(/^>\s?/, '')}</blockquote>;
      return line ? <p key={index} className="my-2">{line}</p> : <div key={index} className="h-2" />;
    })}
  </div>;
}

function FormatIcon({ format }) {
  const Icon = format?.startsWith('ppt') ? Presentation : format?.startsWith('xls') ? FileSpreadsheet : format === 'pdf' ? FileText : BookOpen;
  return <Icon size={20} />;
}

function BookCover({ src, alt, className = '' }) {
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    let objectUrl;
    let active = true;
    setImageUrl('');
    if (src) api.get(src, { responseType: 'blob' }).then((response) => {
      objectUrl = URL.createObjectURL(response.data);
      if (active) setImageUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  return imageUrl ? <img src={imageUrl} alt={alt} className={className} /> : <div aria-label="No book cover uploaded" className={`${className} flex items-center justify-center bg-green-50 text-brand-700`}><BookOpen size={24} /></div>;
}

export default function LearningPage({ learner = false }) {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { confirm } = useDialog();
  const { user } = useAuth();
  const isAdmin = !learner && isAdminUser(user);
  const canTrack = learner && user?.role === 'student';
  const [books, setBooks] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [supportedFormats, setSupportedFormats] = useState(FORMATS);
  const [maxFileBytes, setMaxFileBytes] = useState(25 * 1024 * 1024);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [level, setLevel] = useState(learner && user?.role === 'student' && ['L3', 'L4', 'L5'].includes(user.educationLevel) ? user.educationLevel : 'All levels');
  const [category, setCategory] = useState('All subjects');
  const [format, setFormat] = useState('All formats');
  const [availability, setAvailability] = useState('All availability');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bookUrl, setBookUrl] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [section, setSection] = useState(1);
  const [sectionLabel, setSectionLabel] = useState('');
  const [activeSheet, setActiveSheet] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editStep, setEditStep] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadForm, setUploadForm] = useState({ level: 'L3', category: '', file: null });
  const [downloading, setDownloading] = useState(false);
  const [assessmentEnabled, setAssessmentEnabled] = useState(false);
  const [assessmentQuestions, setAssessmentQuestions] = useState([]);
  const [assessmentAttempts, setAssessmentAttempts] = useState([]);
  const [assessmentDirty, setAssessmentDirty] = useState(false);
  const [loadingAssessmentSettings, setLoadingAssessmentSettings] = useState(false);
  const [finalAssessment, setFinalAssessment] = useState(null);
  const [assessmentAnswers, setAssessmentAnswers] = useState({});
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessmentPendingViolation, setAssessmentPendingViolation] = useState('');
  const [assessmentActive, setAssessmentActive] = useState(false);
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const openRequest = useRef(0);
  const openedFromLink = useRef('');
  const readerRef = useRef(null);
  const elapsedSinceSave = useRef(0);
  const assessmentSubmitLock = useRef(false);
  useEffect(() => { if (editing) setEditStep(0); }, [editing?.id]);
  const updatePdfPageCount = useCallback((count, validPage) => {
    setTotalPages((current) => current === count ? current : count);
    setPage((current) => current === validPage ? current : validPage);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        api.get('/learning/books', { params: { ...(isAdmin ? { manage: true } : {}), ...(level !== 'All levels' ? { level } : {}), ...(category !== 'All subjects' ? { category } : {}), ...(format !== 'All formats' ? { format } : {}), ...(search ? { search } : {}) } }),
        api.get('/learning/summary'),
      ]);
      setBooks(list.data.data.books);
      setCategoryOptions(list.data.data.categories || []);
      setSupportedFormats(list.data.data.supportedFormats || FORMATS);
      setMaxFileBytes(list.data.data.maxFileBytes || 25 * 1024 * 1024);
      setSummary(stats.data.data);
      setLoadError('');
    } catch (err) { setLoadError(apiError(err).message); toast.error(apiError(err).message); }
    finally { setLoading(false); }
  }, [isAdmin, level, category, format, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const updateFullscreen = () => { setFullscreen(Boolean(document.fullscreenElement)); setFullscreenFallback(false); };
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);
  useEffect(() => {
    const requestedId = searchParams.get('book');
    if (!requestedId || openedFromLink.current === requestedId) return;
    const book = books.find((item) => item.id === requestedId);
    if (book) { openedFromLink.current = requestedId; openBook(book); }
  }, [books, searchParams]);
  useEffect(() => () => { if (bookUrl) URL.revokeObjectURL(bookUrl); }, [bookUrl]);

  const categories = useMemo(() => ['All subjects', ...categoryOptions], [categoryOptions]);
  const shownBooks = books.filter((book) => availability === 'All availability' || (availability === 'Available' ? book.active : !book.active));

  const openBookEditor = async (book) => {
    setLoadingAssessmentSettings(true);
    try {
      const [assessment, attempts] = await Promise.all([
        api.get(`/learning/books/${book.id}/assessment`),
        api.get(`/learning/books/${book.id}/assessment-attempts`),
      ]);
      const savedQuestions = assessment.data.data.questions || [];
      setAssessmentEnabled(savedQuestions.length === 20);
      setAssessmentQuestions(Array.from({ length: 20 }, (_, index) => savedQuestions[index] || { prompt: '', options: ['', '', '', ''], correctOption: 0 }));
      setAssessmentAttempts(attempts.data.data.attempts || []);
      setAssessmentDirty(false);
      setEditing({ ...book });
    } catch (error) {
      toast.error(apiError(error).message);
    } finally {
      setLoadingAssessmentSettings(false);
    }
  };

  const updateAssessmentQuestion = (questionIndex, update) => {
    setAssessmentQuestions((questions) => questions.map((question, index) => index === questionIndex ? { ...question, ...update } : question));
    setAssessmentDirty(true);
  };

  const startFinalAssessment = async () => {
    if (!finalAssessment?.required || !finalAssessment.readingCompleted || !finalAssessment.configured
      || finalAssessment.passed || assessmentResult?.passed || finalAssessment.attemptsRemaining < 1) return;
    if (!readerRef.current?.requestFullscreen) {
      toast.error('This browser does not support fullscreen assessments.');
      return;
    }
    try {
      await readerRef.current.requestFullscreen();
      if (!document.fullscreenElement) throw new Error('Fullscreen was not granted');
      setAssessmentAnswers({});
      setAssessmentResult(null);
      setAssessmentPendingViolation('');
      assessmentSubmitLock.current = false;
      setAssessmentActive(true);
    } catch {
      toast.error('Allow fullscreen to begin the final assessment.');
    }
  };

  const submitFinalAssessment = async (violation = '') => {
    if (!selected?.id || assessmentSubmitLock.current) return;
    const answers = Object.entries(assessmentAnswers).map(([questionIndex, optionIndex]) => ({
      questionIndex: Number(questionIndex),
      optionIndex: Number(optionIndex),
    }));
    if (!violation && answers.length !== 20) {
      toast.error('Answer all 20 questions before submitting.');
      return;
    }
    assessmentSubmitLock.current = true;
    setAssessmentSubmitting(true);
    if (violation) {
      setAssessmentActive(false);
      setAssessmentPendingViolation(violation);
      await saveProgressRef.current(false, true);
    }
    try {
      const response = await api.post(`/learning/books/${selected.id}/final-assessment`, {
        answers,
        ...(violation ? { violation } : {}),
      });
      setAssessmentResult(response.data.data);
      setAssessmentPendingViolation('');
      setAssessmentActive(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      try {
        const status = await api.get(`/learning/books/${selected.id}/final-assessment`);
        setFinalAssessment(status.data.data);
      } catch (error) {
        toast.error(`Assessment submitted, but its latest status could not be refreshed: ${apiError(error).message}`);
      }
    } catch (error) {
      if (violation) {
        setAssessmentResult({ submissionError: apiError(error).message });
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      } else {
        toast.error(apiError(error).message);
      }
    } finally {
      assessmentSubmitLock.current = false;
      setAssessmentSubmitting(false);
    }
  };

  useEffect(() => {
    if (!assessmentActive) return undefined;
    const reportViolation = (reason) => { void submitFinalAssessment(reason); };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') reportViolation('tab_hidden'); };
    const onFullscreenChange = () => { if (!document.fullscreenElement) reportViolation('fullscreen_exit'); };
    const onCopy = (event) => { event.preventDefault(); reportViolation('copy'); };
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (event.key === 'PrintScreen') reportViolation('screenshot_shortcut');
      else if ((event.ctrlKey || event.metaKey) && ['c', 'p', 's'].includes(key)) {
        event.preventDefault();
        reportViolation(key === 'c' ? 'copy' : 'screenshot_shortcut');
      }
    };
    const onContextMenu = (event) => event.preventDefault();
    const onBlur = () => reportViolation('window_blur');
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
    };
  }, [assessmentActive, assessmentAnswers, selected?.id]);

  const openBook = async (book) => {
    if (!/^[0-9a-f]{24}$/i.test(book?.id || '')) {
      toast.error('This learning resource has an invalid ID. Refresh the library and try again.');
      return;
    }
    const requestId = ++openRequest.current;
    setSelected(book);
    setPreview(null);
    setFinalAssessment(null);
    setAssessmentResult(null);
    setAssessmentPendingViolation('');
    setPage(book.progress?.positionType === 'page' ? book.progress.positionIndex : book.progress?.currentPage || 1);
    setTotalPages(book.progress?.totalPages || 0);
    setTotalUnits(book.progress?.totalUnits || book.progress?.totalPages || 0);
    setZoom(100);
    elapsedSinceSave.current = 0;
    setSection(book.progress?.positionIndex || 1);
    setSectionLabel(book.progress?.positionLabel || '');
    setActiveSheet(Math.max(0, (book.progress?.positionIndex || 1) - 1));
    setActiveSlide(Math.max(0, (book.progress?.positionIndex || 1) - 1));
    setBookUrl('');
    try {
      const response = await api.get(`/learning/books/${book.id}/preview`);
      if (requestId !== openRequest.current) return;
      const result = response.data.data.preview;
      setPreview(result);
      if (result.totalUnits) setTotalUnits((current) => current || result.totalUnits);
      if (result.kind === 'pdf') {
        const file = await api.get(`/learning/books/${book.id}/file`, { responseType: 'blob' });
        if (requestId === openRequest.current) setBookUrl(URL.createObjectURL(new Blob([file.data], { type: 'application/pdf' })));
      }
      if (canTrack) {
        const kind = progressKind(book.format);
        const body = { positionType: kind, positionIndex: book.progress?.positionIndex || book.progress?.currentPage || 1, positionLabel: book.progress?.positionLabel || '', totalUnits: book.progress?.totalUnits || result.totalUnits || book.progress?.totalPages || 0, timeSpentSeconds: 0, ...(kind === 'page' ? { currentPage: book.progress?.currentPage || 1, totalPages: book.progress?.totalPages || 0 } : {}) };
        const saved = await api.put(`/learning/books/${book.id}/progress`, body);
        setBooks((current) => current.map((item) => item.id === book.id ? { ...item, progress: saved.data.data.progress } : item));
        setSelected((current) => current?.id === book.id ? { ...current, progress: saved.data.data.progress } : current);
        const assessment = await api.get(`/learning/books/${book.id}/final-assessment`);
        if (requestId === openRequest.current) setFinalAssessment(assessment.data.data);
      }
    } catch (err) {
      if (requestId === openRequest.current) { setSelected(null); toast.error(apiError(err).message); }
    }
  };

  const closeBook = () => {
    if (assessmentSubmitting) return;
    if (assessmentPendingViolation) {
      void submitFinalAssessment(assessmentPendingViolation);
      return;
    }
    if (assessmentActive) {
      void submitFinalAssessment('fullscreen_exit');
      return;
    }
    saveProgressRef.current(false, true);
    openRequest.current += 1;
    setSelected(null);
    setPreview(null);
    setBookUrl('');
    setFinalAssessment(null);
    setAssessmentActive(false);
  };

  const saveProgress = async (completed = false, silent = false) => {
    if (!selected?.id || !canTrack) return;
    setSavingProgress(true);
    const kind = progressKind(selected.format);
    const index = kind === 'page' ? page : kind === 'slide' ? activeSlide + 1 : kind === 'sheet' ? activeSheet + 1 : section;
    const label = kind === 'sheet' ? preview?.sheets?.[activeSheet]?.name || '' : kind === 'section' || kind === 'document' ? sectionLabel : '';
    const max = kind === 'page' ? totalPages : preview?.totalUnits || 0;
    const timeSpentSeconds = elapsedSinceSave.current;
    try {
      const response = await api.put(`/learning/books/${selected.id}/progress`, { ...(kind === 'page' ? { currentPage: page, totalPages } : {}), positionType: kind, positionIndex: index, positionLabel: label, totalUnits: max, timeSpentSeconds, completed });
      const next = response.data.data.progress;
      elapsedSinceSave.current = Math.max(0, elapsedSinceSave.current - timeSpentSeconds);
      setBooks((current) => current.map((book) => book.id === selected.id ? { ...book, progress: next } : book));
      setSelected((current) => ({ ...current, progress: next }));
      if (!silent && completed) toast.success(next.completed ? 'Reading completion recorded.' : 'Keep reading to reach the final portion before completion.');
      else if (!silent) toast.success('Learning progress saved.');
      if (next.completed && !selected.progress?.completed) {
        const status = await api.get(`/learning/books/${selected.id}/final-assessment`);
        setFinalAssessment(status.data.data);
      }
      if (completed && next.completed) {
        const stats = await api.get('/learning/summary');
        setSummary(stats.data.data);
      }
    } catch (err) { toast.error(apiError(err).message); }
    finally { setSavingProgress(false); }
  };

  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  useEffect(() => {
    if (!canTrack || !selected || !preview) return undefined;
    const timer = window.setInterval(() => {
      elapsedSinceSave.current += 30;
      saveProgressRef.current(false, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [canTrack, selected?.id, Boolean(preview)]);
  useEffect(() => {
    if (!canTrack || !selected || !preview) return undefined;
    const timer = window.setTimeout(() => saveProgressRef.current(false, true), 900);
    return () => window.clearTimeout(timer);
  }, [canTrack, selected?.id, page, totalPages, activeSlide, activeSheet, section, sectionLabel, preview?.totalUnits]);

  const movePosition = (delta) => {
    if (currentPositionType === 'page') setPage((value) => Math.max(1, Math.min(totalPages || 100000, value + delta)));
    else if (currentPositionType === 'slide') setActiveSlide((value) => Math.max(0, Math.min((preview?.slides?.length || 1) - 1, value + delta)));
    else if (currentPositionType === 'sheet') setActiveSheet((value) => Math.max(0, Math.min((preview?.sheets?.length || 1) - 1, value + delta)));
    else setSection((value) => Math.max(1, Math.min(totalUnits || 100000, value + delta)));
  };

  const toggleFullscreen = async () => {
    if (fullscreen || fullscreenFallback) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFullscreenFallback(false);
      setFullscreen(false);
      return;
    }
    if (!readerRef.current?.requestFullscreen) { setFullscreenFallback(true); return; }
    try { await readerRef.current.requestFullscreen(); setFullscreen(true); }
    catch { setFullscreenFallback(true); }
  };

  const saveBook = async (event) => {
    event.preventDefault();
    setSavingEdit(true);
    try {
      await api.patch(`/learning/books/${editing.id}`, { title: editing.title, description: editing.description, category: editing.category, level: editing.level, active: editing.active });
      if (assessmentDirty) {
        await api.put(`/learning/books/${editing.id}/assessment`, {
          questions: assessmentEnabled ? assessmentQuestions : [],
        });
      }
      toast.success('Document details updated.');
      setEditing(null);
      await load();
    } catch (err) { toast.error(apiError(err).message); }
    finally { setSavingEdit(false); }
  };

  const uploadBookCover = async (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      toast.error('Choose a PNG, JPEG, or WebP cover image up to 3 MB.');
      return;
    }
    setUploadingCover(true);
    try {
      const body = new FormData();
      body.append('cover', file);
      const response = await api.post(`/learning/books/${editing.id}/cover`, body);
      const book = response.data.data.book;
      setEditing((current) => current?.id === book.id ? { ...current, coverUrl: book.coverUrl } : current);
      setBooks((current) => current.map((item) => item.id === book.id ? { ...item, coverUrl: book.coverUrl } : item));
      toast.success('Book cover uploaded.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setUploadingCover(false); }
  };

  const replaceFile = async (book, file) => {
    if (!file) return;
    const expectedExtension = `.${book.format}`;
    if (!file.name.toLowerCase().endsWith(expectedExtension)) {
      toast.error(`Choose a replacement file with the same .${book.format} format.`);
      return;
    }
    const body = new FormData();
    body.append('file', file);
    try {
      const response = await api.post(`/learning/books/${book.id}/file`, body);
      setEditing((current) => current?.id === book.id ? { ...current, ...response.data.data.book } : current);
      toast.success('Document file replaced. Its catalog metadata and availability were preserved.');
      await load();
    } catch (err) { toast.error(apiError(err).message); }
  };

  const uploadBook = async (event) => {
    event.preventDefault();
    if (!uploadForm.file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', uploadForm.file);
      body.append('level', uploadForm.level);
      body.append('category', uploadForm.category);
      const response = await api.post('/learning/books/upload', body);
      const book = response.data.data.book;
      toast.success('Document uploaded as a draft. Preview it, then make it available to students.');
      setUploadOpen(false);
      setUploadForm({ level: 'L3', category: '', file: null });
      await load();
      openBook(book);
    } catch (err) { toast.error(apiError(err).message); }
    finally { setUploading(false); }
  };

  const downloadBook = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const file = await api.get(`/learning/books/${selected.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(file.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = selected.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { toast.error(apiError(err).message); }
    finally { setDownloading(false); }
  };

  const retryImport = async (book) => {
    try { await api.post(`/learning/books/${book.id}/retry`); toast.success('Document processed successfully.'); await load(); }
    catch (err) { toast.error(apiError(err).message); await load(); }
  };

  const deleteBook = async (book) => {
    if (!await confirm({ title: 'Delete learning resource?', message: `Permanently delete “${book.title}” and its saved progress? This cannot be undone.`, confirmLabel: 'Delete resource', tone: 'danger' })) return;
    try { await api.delete(`/learning/books/${book.id}`); toast.success('Document deleted.'); await load(); }
    catch (err) { toast.error(apiError(err).message); }
  };

  const currentPositionType = selected ? progressKind(selected.format) : 'document';
  const positionIndex = currentPositionType === 'page' ? page : currentPositionType === 'slide' ? activeSlide + 1 : currentPositionType === 'sheet' ? activeSheet + 1 : section;
  const positionTotal = currentPositionType === 'page' ? totalPages : preview?.totalUnits || totalUnits;
  const positionControls = selected && currentPositionType === 'page' ? <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end"><div><label className="label">Last page read</label><input type="number" min="1" max="100000" className="input" value={page} onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))} /></div><div><label className="label">Total pages</label><input type="number" min="0" max="100000" className="input" value={totalPages || ''} onChange={(event) => setTotalPages(Math.max(0, Number(event.target.value) || 0))} placeholder="Unknown" /></div><button className="btn-primary" onClick={() => saveProgress(false)} disabled={savingProgress}>{savingProgress ? <Spinner size={16} /> : <Clock3 size={16} />}Save progress</button></div>
    : selected && currentPositionType === 'slide' ? <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div><label className="label">Last slide viewed</label><select className="input" value={activeSlide} onChange={(event) => setActiveSlide(Number(event.target.value))}>{(preview?.slides || []).map((slide, index) => <option key={slide.number} value={index}>Slide {slide.number}</option>)}</select></div><button className="btn-primary" onClick={() => saveProgress(false)} disabled={savingProgress}><Clock3 size={16} />Save progress</button></div>
      : selected && currentPositionType === 'sheet' ? <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div><label className="label">Last sheet viewed</label><select className="input" value={activeSheet} onChange={(event) => setActiveSheet(Number(event.target.value))}>{(preview?.sheets || []).map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}</select></div><button className="btn-primary" onClick={() => saveProgress(false)} disabled={savingProgress}><Clock3 size={16} />Save progress</button></div>
        : canTrack && selected ? <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end"><div><label className="label">Section number</label><input type="number" min="1" className="input" value={section} onChange={(event) => setSection(Math.max(1, Number(event.target.value) || 1))} /></div><div><label className="label">Section or location</label><input className="input" maxLength={240} value={sectionLabel} onChange={(event) => setSectionLabel(event.target.value)} placeholder="Chapter or section name" /></div><button className="btn-primary" onClick={() => saveProgress(false)} disabled={savingProgress}><Clock3 size={16} />Save progress</button></div> : null;

  return <div className="min-w-0">
    <PageHeader title={learner ? 'Learning library' : 'Learning & resources'} subtitle={learner ? 'Read books and documents in your classes and keep track of your progress.' : 'Manage trusted learning files organized by level and subject.'} actions={isAdmin && <button className="btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} />Upload document</button>} />

    {learner && summary && <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><StatCard label="Available resources" value={summary.totalBooks} icon={BookOpen} /><StatCard label="Started" value={summary.booksStarted} icon={Clock3} accent="amber" /><StatCard label="Completed" value={summary.completedBooks} icon={CheckCircle2} accent="green" /></div>}

    {learner && summary?.recentlyRead?.length > 0 && <section className="mb-5"><h2 className="mb-2 text-sm font-semibold text-slate-700">Recently opened</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{summary.recentlyRead.slice(0, 3).map((item) => { const book = books.find((entry) => entry.id === item.id); return book && <button key={item.id} onClick={() => openBook(book)} className="card flex min-w-0 items-center gap-3 text-left hover:border-brand-300 hover:shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><FormatIcon format={item.format} /></span><span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-800">{item.title}</span><span className="mt-1 block break-words text-xs text-slate-500">{item.level} · {item.positionType || 'page'} {item.positionIndex || item.currentPage}</span></span></button>; })}</div></section>}

    <div className={`mb-4 grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto${isAdmin ? '_auto' : ''}]`}>
      <label className="relative"><Search size={16} className="absolute left-3 top-3.5 text-slate-400" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search resources" /></label>
      <select className="input sm:w-36" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Filter by level" disabled={canTrack && ['L3', 'L4', 'L5'].includes(user?.educationLevel)}>{(canTrack && ['L3', 'L4', 'L5'].includes(user?.educationLevel) ? [user.educationLevel] : LEVELS).map((item) => <option key={item}>{item}</option>)}</select>
      <select className="input sm:w-56" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by subject">{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="input sm:w-40" value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Filter by file format"><option>All formats</option>{FORMATS.map((item) => <option key={item} value={item}>{FORMAT_NAMES[item]} (.{item})</option>)}</select>
      {isAdmin && <select className="input sm:w-44" value={availability} onChange={(event) => setAvailability(event.target.value)} aria-label="Filter by availability"><option>All availability</option><option>Available</option><option>Drafts and archived</option></select>}
    </div>

    {loading ? <PageLoader label="Loading the learning library…" /> : loadError ? <EmptyState icon={BookOpen} title="Library could not load" description={loadError} action={<button className="btn-primary" onClick={load}>Try again</button>} /> : shownBooks.length === 0 ? <EmptyState icon={BookOpen} title="No documents found" description="Try another search, level, subject, or format." /> : LEVELS.slice(1).filter((item) => level === 'All levels' || level === item).map((item) => {
      const group = shownBooks.filter((book) => book.level === item);
      if (!group.length) return null;
      return <section key={item} className="mb-6"><div className="mb-3 flex items-center gap-2"><h2 className="text-base font-bold text-slate-800">{item}</h2><Badge color="brand">{group.length} resources</Badge></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.map((book) => <article key={book.id} className={`card flex flex-col ${!book.active ? 'opacity-75' : ''}`}>
          <div className="flex min-w-0 items-start gap-3"><BookCover src={book.coverUrl} alt={`Cover for ${book.title}`} className="h-16 w-14 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><h3 className="line-clamp-2 break-words font-semibold leading-5 text-slate-900">{book.title}</h3><p className="mt-1 break-words text-xs leading-5 text-slate-500">{book.category} · {FORMAT_NAMES[book.format] || book.format?.toUpperCase()} · {fmtSize(book.size)}</p>{book.description && <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-500">{book.description}</p>}</div>{isAdmin && <button onClick={() => openBookEditor(book)} disabled={loadingAssessmentSettings} className="btn-ghost min-h-9 shrink-0 p-2" title="Edit document and assessment"><Settings2 size={16} /></button>}</div>
          {book.progress && <div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-500">{book.progress.completed ? 'Completed' : `Last opened · ${book.progress.positionType} ${book.progress.positionIndex}${book.progress.positionLabel ? ` · ${book.progress.positionLabel}` : ''}`}</span>{book.progress.completed && <CheckCircle2 size={14} className="text-emerald-600" />}</div>}
          {isAdmin && book.processingStatus === 'error' && <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700"><p>{book.processingError || 'This file could not be processed.'}</p><button onClick={() => retryImport(book)} className="mt-1 inline-flex items-center gap-1 font-semibold"><RotateCw size={13} />Retry import</button></div>}
          {isAdmin && <p className="mt-2 text-xs text-slate-500">{book.active ? 'Available to students' : 'Draft or archived'}</p>}
          <div className="mt-auto grid gap-2 pt-4"><button disabled={book.processingStatus === 'error' || book.processingStatus === 'missing'} onClick={() => openBook(book)} className="btn-secondary w-full">Preview <BookOpen size={16} /></button>{isAdmin && <div className="flex gap-2"><button className="btn-secondary flex-1" onClick={() => openBookEditor({ ...book, active: !book.active })} disabled={loadingAssessmentSettings}> {book.active ? 'Archive' : 'Restore'} </button><button className="btn-ghost text-red-600" onClick={() => deleteBook(book)} aria-label={`Delete ${book.title}`}><Trash2 size={16} /></button></div>}</div>
        </article>)}
      </div></section>;
    })}

    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Manage learning document" size="manage" footer={editing && <><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>{editStep > 0 && <button className="btn-secondary" onClick={() => setEditStep((step) => step - 1)}>Back</button>}{editStep < 3 ? <button className="btn-primary" onClick={() => { if (editStep === 0 && !document.getElementById('edit-learning-book')?.reportValidity()) return; setEditStep((step) => step + 1); }}>{['Next: file settings', 'Next: book cover', 'Next: assessment'][editStep]}<ChevronRight size={16} /></button> : <button form="edit-learning-book" className="btn-primary" disabled={savingEdit || loadingAssessmentSettings}>{savingEdit && <Spinner size={16} />}Save changes</button>}</>}>
      {editing && <div className="space-y-4">
        <nav aria-label="Document settings steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Details', 'Title, subject and level'], ['File settings', 'Availability and replacement'], ['Book cover', 'Card image'], ['Assessment', 'Questions and student attempts']].map(([label, hint], index) => <div key={label} aria-current={editStep === index ? 'step' : undefined} className={`min-w-0 rounded-lg border px-2 py-2 ${editStep === index ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white'}`}><p className={`text-xs font-semibold ${editStep === index ? 'text-brand-800' : 'text-slate-500'}`}>{index + 1}. {label}</p><p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">{hint}</p></div>)}
        </nav>
        <form id="edit-learning-book" onSubmit={(event) => { if (editStep < 3) { event.preventDefault(); if (editStep === 0 && !event.currentTarget.reportValidity()) return; setEditStep((step) => step + 1); return; } saveBook(event); }} className="min-h-[15rem]">
          {editStep === 0 && <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div><label className="label" htmlFor="learning-title">Title</label><input id="learning-title" className="input" maxLength={240} required value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></div>
            <div><label className="label" htmlFor="learning-description">Description</label><textarea id="learning-description" className="input min-h-20" maxLength={2000} value={editing.description || ''} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></div>
            <div><label className="label" htmlFor="learning-subject">Subject</label><input id="learning-subject" className="input" maxLength={120} required value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></div><div><label className="label" htmlFor="learning-level">Level</label><select id="learning-level" className="input" value={editing.level} onChange={(event) => setEditing({ ...editing, level: event.target.value })}>{LEVELS.slice(1).map((value) => <option key={value}>{value}</option>)}</select></div>
          </div>}
          {editStep === 1 && <div className="space-y-4">
            <label className="flex min-h-12 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm text-slate-700"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> Available to students</label>
            <div className="rounded-lg border border-slate-200 p-3 sm:p-4"><p className="break-all text-xs text-slate-500">Current file: {editing.fileName} · {FORMAT_NAMES[editing.format]} · {fmtSize(editing.size)}</p><div className="mt-4"><label className="label" htmlFor="learning-replacement">Replace file (same format)</label><input id="learning-replacement" className="input" type="file" accept={`.${editing.format}`} onChange={(event) => replaceFile(editing, event.target.files?.[0])} /><p className="mt-2 text-xs leading-5 text-slate-500">Replacement keeps this resource’s metadata and availability.</p></div></div>
          </div>}
          {editStep === 2 && <section className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-4" aria-labelledby="book-cover-heading"><BookCover src={editing.coverUrl} alt={`Cover for ${editing.title}`} className="mx-auto h-36 w-28 rounded-lg border border-slate-200 object-cover shadow-sm sm:mx-0" /><div className="min-w-0"><h4 id="book-cover-heading" className="text-sm font-semibold text-slate-800">Book cover image</h4><p className="mt-1 text-xs text-slate-500">Shown on the student book card.</p><input className="mt-3 block w-full min-w-0 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-brand-50 file:px-2 file:py-2 file:font-medium file:text-brand-700" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingCover} onChange={(event) => uploadBookCover(event.target.files?.[0])} /><p className="mt-2 text-xs leading-5 text-slate-500">PNG, JPEG, or WebP · up to 3 MB.</p>{uploadingCover && <p role="status" className="mt-2 text-sm text-brand-700">Uploading cover…</p>}</div></section>}
          {editStep === 3 && <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={assessmentEnabled} disabled={assessmentAttempts.length > 0} onChange={(event) => { setAssessmentEnabled(event.target.checked); setAssessmentDirty(true); }} />
              <span><span className="font-semibold">Require a final assessment for required course reading</span><span className="mt-1 block text-xs text-slate-500">Students must complete the reading, then pass 20 multiple-choice questions with at least 80%. They get up to three attempts.</span></span>
            </label>
            {assessmentAttempts.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Questions are locked because students have already submitted attempts. You may still update document details.</div>}
            {assessmentEnabled && <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {assessmentQuestions.map((question, questionIndex) => <fieldset key={questionIndex} disabled={assessmentAttempts.length > 0} className="rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">Question {questionIndex + 1}</legend>
                <label className="label" htmlFor={`assessment-prompt-${questionIndex}`}>Question</label>
                <textarea id={`assessment-prompt-${questionIndex}`} className="input min-h-16" maxLength={1200} required value={question.prompt} onChange={(event) => updateAssessmentQuestion(questionIndex, { prompt: event.target.value })} />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-2">
                    <input type="radio" name={`correct-option-${questionIndex}`} aria-label={`Mark option ${optionIndex + 1} correct for question ${questionIndex + 1}`} checked={question.correctOption === optionIndex} onChange={() => updateAssessmentQuestion(questionIndex, { correctOption: optionIndex })} />
                    <input className="input" aria-label={`Option ${optionIndex + 1} for question ${questionIndex + 1}`} maxLength={500} required value={option} onChange={(event) => updateAssessmentQuestion(questionIndex, { options: question.options.map((value, index) => index === optionIndex ? event.target.value : value) })} />
                  </div>)}
                </div>
              </fieldset>)}
            </div>}
            <section aria-labelledby="assessment-attempts-heading" className="space-y-2">
              <h4 id="assessment-attempts-heading" className="text-sm font-semibold text-slate-800">Student attempts and integrity reports</h4>
              {assessmentAttempts.length === 0 ? <p className="text-xs text-slate-500">No student attempts have been recorded.</p> : <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 px-3">
                {assessmentAttempts.map((attempt) => <li key={attempt.id} className="py-2 text-xs">
                  <p className="font-medium text-slate-800">{attempt.studentName} · {attempt.studentEmail || 'No email'} · Attempt {attempt.attemptNumber} · {attempt.score}% · {attempt.passed ? 'Passed' : 'Not passed'}</p>
                  {attempt.violation && <p className="mt-1 text-amber-800">Integrity report: {attempt.violation.replaceAll('_', ' ')}</p>}
                  <p className="mt-1 text-slate-500">{new Date(attempt.submittedAt).toLocaleString()}</p>
                </li>)}
              </ul>}
            </section>
          </div>}
        </form>
      </div>}
    </Modal>

    <Modal open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} title="Upload learning document" footer={<><button className="btn-secondary" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</button><button form="upload-learning-book" className="btn-primary" disabled={uploading || !uploadForm.file}>{uploading ? <Spinner size={16} /> : <Upload size={16} />}Upload draft</button></>}>
      <form id="upload-learning-book" onSubmit={uploadBook} className="space-y-3"><p className="text-sm text-slate-500">Supported: PDF, Word, text, Markdown, PowerPoint, and Excel. Files are checked by content before storage.</p>
        <div><label className="label">Level</label><select className="input" value={uploadForm.level} onChange={(event) => setUploadForm({ ...uploadForm, level: event.target.value })}>{LEVELS.slice(1).map((value) => <option key={value}>{value}</option>)}</select></div>
        <div><label className="label">Subject</label><input className="input" required maxLength={120} value={uploadForm.category} onChange={(event) => setUploadForm({ ...uploadForm, category: event.target.value })} placeholder="Software Development" /></div>
        <div><label className="label">Document</label><input className="input" type="file" required accept={supportedFormats.map((item) => `.${item}`).join(',')} onChange={(event) => setUploadForm({ ...uploadForm, file: event.target.files?.[0] || null })} /><p className="mt-1 text-xs text-slate-400">Maximum {Math.round(maxFileBytes / 1024 / 1024)} MB. Uploads are saved as drafts until you preview and publish them.</p></div>
      </form>
    </Modal>

    <Modal open={Boolean(selected)} onClose={closeBook} title={selected?.title || 'Document preview'} size="reader" footer={selected && !assessmentActive && <><button className="btn-secondary mr-auto" onClick={downloadBook} disabled={downloading}>{downloading ? <Spinner size={16} /> : <Download size={16} />}Download</button><button className="btn-secondary" onClick={closeBook}>Close</button></>}>
      {selected && <div ref={readerRef} className={`min-w-0 space-y-3 ${assessmentActive ? 'min-h-screen bg-white p-4 sm:p-8' : fullscreenFallback ? 'fixed inset-0 z-[100] overflow-y-auto bg-white p-3 sm:p-6' : ''}`}><div className="flex flex-wrap items-center gap-2"><Badge color="brand">{selected.level}</Badge><Badge>{selected.category}</Badge><Badge>{FORMAT_NAMES[selected.format] || selected.format?.toUpperCase()}</Badge>{selected.progress?.completed && <Badge color="green">Reading complete</Badge>}</div>
        {!assessmentActive && <>
        <div role="toolbar" aria-label="Document reader controls" className="sticky top-0 z-10 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center justify-between gap-1 sm:justify-start">
            <button className="btn-ghost min-h-10 px-2" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(25, value - 10))}><ZoomOut size={17} /></button>
            <label className="sr-only" htmlFor="reader-zoom">Document zoom</label><select id="reader-zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="h-9 w-[4.5rem] rounded-md border border-slate-200 bg-white px-1 text-center text-xs tabular-nums" aria-label={`Document zoom, ${zoom} percent`}>{[50, 75, 90, 100, 110, 120, 130, 140, 150, 175, 200, 250, 300].map((value) => <option key={value} value={value}>{value}%</option>)}</select>
            <button className="btn-ghost min-h-10 px-2" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(300, value + 10))}><ZoomIn size={17} /></button>
            <button className="btn-ghost min-h-10 px-2 text-xs" title="Reset zoom to 100 percent" onClick={() => setZoom(100)}>Reset</button>
            <span className="mx-1 h-6 w-px bg-slate-200 sm:hidden" aria-hidden="true" />
            <button className="btn-ghost min-h-10 px-2" title="Previous position" aria-label="Previous page, slide, section, or sheet" onClick={() => movePosition(-1)} disabled={positionIndex <= 1}><ChevronLeft size={17} /></button>
            <span aria-live="polite" className="min-w-20 text-center text-xs font-medium text-slate-600">{currentPositionType === 'page' ? 'Page' : currentPositionType === 'slide' ? 'Slide' : currentPositionType === 'sheet' ? 'Sheet' : 'Section'} {positionIndex}{positionTotal ? ` of ${positionTotal}` : ''}</span>
            <button className="btn-ghost min-h-10 px-2" title="Next position" aria-label="Next page, slide, section, or sheet" onClick={() => movePosition(1)} disabled={Boolean(positionTotal && positionIndex >= positionTotal)}><ChevronRight size={17} /></button>
          </div>
          <div className="flex items-center gap-1 sm:ml-auto sm:flex-1">
            <div className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selected.progress?.progressPercent || 0}><div className="h-full bg-brand-600 transition-all" style={{ width: `${selected.progress?.progressPercent || 0}%` }} /></div>
            <button className="btn-secondary min-h-10 px-2 text-xs" onClick={downloadBook} disabled={downloading} aria-label="Download document">{downloading ? <Spinner size={15} /> : <Download size={15} />}<span className="hidden sm:inline">Download</span></button>
            {searchParams.get('course') && <Link className="btn-secondary min-h-10 px-2 text-xs" to={`/courses/${searchParams.get('course')}`}>Course</Link>}
            <button className="btn-ghost min-h-10 px-2" title={fullscreen || fullscreenFallback ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={fullscreen || fullscreenFallback ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}>{fullscreen || fullscreenFallback ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
          </div>
        </div>
        {!preview ? <div className="flex h-48 items-center justify-center text-slate-500"><Spinner /><span className="ml-2 text-sm">Preparing safe preview…</span></div> : preview.kind === 'pdf' ? <>{bookUrl ? <Suspense fallback={<div className="flex h-[72dvh] items-center justify-center text-sm text-slate-500"><Spinner /><span className="ml-2">Loading PDF reader…</span></div>}><PdfPage url={bookUrl} pageNumber={page} zoom={zoom} onPageCount={updatePdfPageCount} /></Suspense> : <div className="h-48"><PageLoader label="Opening PDF…" /></div>}</>
          : preview.kind === 'html' ? <div className="reader-content-scroll max-h-[72dvh] max-w-none overflow-auto rounded-lg border border-slate-200 p-3 sm:p-4"><div className="prose prose-sm prose-slate max-w-none break-words sm:prose-base" style={{ zoom: `${zoom}%` }} dangerouslySetInnerHTML={{ __html: preview.content }} /></div>
            : preview.kind === 'text' ? <div className="reader-content-scroll max-h-[72dvh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4"><pre className="whitespace-pre-wrap break-words text-sm leading-7 sm:text-base" style={{ zoom: `${zoom}%` }}>{preview.content}{preview.truncated ? '\n\nPreview truncated. Download to read the remaining content.' : ''}</pre></div>
              : preview.kind === 'markdown' ? <div className="reader-content-scroll max-h-[72dvh] overflow-auto rounded-lg border border-slate-200 p-3 sm:p-4"><div className="break-words text-sm sm:text-base" style={{ zoom: `${zoom}%` }}><MarkdownPreview content={preview.content} /></div>{preview.truncated && <p className="mt-3 text-xs text-slate-500">Preview truncated; download to read the rest.</p>}</div>
                : preview.kind === 'slides' ? <div className="reader-content-scroll max-h-[72dvh] overflow-auto rounded-lg border border-slate-200 p-2 sm:p-3"><div style={{ zoom: `${zoom}%` }}>{preview.slides.length ? <article className="min-h-64 rounded-lg border border-brand-300 bg-white p-4 shadow-sm sm:p-6"><h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">Slide {preview.slides[activeSlide]?.number}</h3><p className="whitespace-pre-wrap break-words text-base leading-7 sm:text-lg">{preview.slides[activeSlide]?.text || '(No text on this slide)'}</p></article> : <EmptyState title="No slide text found" description="Download the presentation to view its visual slides." />}</div></div>
                  : preview.kind === 'sheets' ? <div className="reader-content-scroll max-h-[72dvh] overflow-auto rounded-lg border border-slate-200 p-3">{preview.sheets.length > 1 && <label className="mb-3 block"><span className="label">Worksheet</span><select className="input" value={activeSheet} onChange={(event) => setActiveSheet(Number(event.target.value))}>{preview.sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}</select></label>}<div className="overflow-x-auto"><div style={{ zoom: `${zoom}%` }}>{preview.sheets[activeSheet]?.rows?.length ? <table className="w-full border-collapse text-xs"><tbody>{preview.sheets[activeSheet].rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-64 break-words border border-slate-200 px-2 py-1">{cell}</td>)}</tr>)}</tbody></table> : <EmptyState title="This sheet is empty" />}</div></div></div>
                    : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{preview.message}<p className="mt-2 text-xs">Document content is downloaded as a file and is not executed in the browser.</p></div>}
        {canTrack && positionControls}
        {canTrack && <button onClick={() => saveProgress(true)} disabled={savingProgress || selected.progress?.completed} className="btn-secondary w-full"><CheckCircle2 size={16} />{selected.progress?.completed ? 'Already completed' : 'Mark document as complete'}</button>}
        </>}
        {canTrack && finalAssessment?.required && <section aria-labelledby="final-assessment-heading" className={`space-y-4 rounded-xl border border-brand-200 bg-brand-50 p-4 ${assessmentActive ? 'mx-auto max-w-3xl border-0 bg-white p-0' : ''}`} onCopy={(event) => assessmentActive && event.preventDefault()} onContextMenu={(event) => assessmentActive && event.preventDefault()}>
          <div>
            <h2 id="final-assessment-heading" className="text-lg font-bold text-slate-900">Final reading assessment</h2>
            <p className="mt-1 text-sm text-slate-600">Pass mark: 80% · Maximum attempts: 3</p>
          </div>
          {assessmentActive && finalAssessment.questions?.length === 20 && <div className="select-none space-y-4">
            <p className="text-sm font-medium text-slate-700">Answer all 20 questions. Leaving this tab, exiting fullscreen, or using a detected copy/screenshot shortcut will submit your current answers and report the event to the administrator.</p>
            {finalAssessment.questions.map((question, questionIndex) => <fieldset key={question.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-slate-900">{questionIndex + 1}. {question.prompt}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50"><input className="mt-1" type="radio" name={`final-assessment-${questionIndex}`} checked={assessmentAnswers[question.id] === optionIndex} onChange={() => setAssessmentAnswers((current) => ({ ...current, [question.id]: optionIndex }))} /><span>{option}</span></label>)}</div>
            </fieldset>)}
            <p className="text-xs text-slate-500">The browser cannot block or reliably detect operating-system screenshots. Fullscreen and shortcut monitoring are best-effort.</p>
            <button type="button" className="btn-primary w-full" disabled={assessmentSubmitting} onClick={() => submitFinalAssessment()}>{assessmentSubmitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />}Submit assessment</button>
          </div>}
          {!assessmentActive && assessmentResult?.submissionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>Your assessment could not be submitted: {assessmentResult.submissionError}</p><p className="mt-1">Your answers are still on this device. Retry the submission or contact the administrator.</p><button className="btn-secondary mt-3" disabled={assessmentSubmitting} onClick={() => submitFinalAssessment(assessmentPendingViolation)}>{assessmentSubmitting ? <Spinner size={16} /> : null}Retry submission</button></div>}
          {!assessmentActive && assessmentResult && !assessmentResult.submissionError && <div role="status" className={`rounded-lg p-3 text-sm ${assessmentResult.passed ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{assessmentResult.passed ? `Passed with ${assessmentResult.score}%.` : `Scored ${assessmentResult.score}%. ${assessmentResult.attemptsRemaining} attempt${assessmentResult.attemptsRemaining === 1 ? '' : 's'} remaining.`}{assessmentResult.reportToAdministrator && <p className="mt-1">The administrator has been notified of the integrity event.</p>}</div>}
          {!assessmentActive && !assessmentResult?.submissionError && finalAssessment.passed && <p className="text-sm font-semibold text-emerald-800">Assessment passed. Your course completion status will update automatically.</p>}
          {!assessmentActive && !assessmentResult?.submissionError && !finalAssessment.configured && <p className="text-sm text-amber-800">The administrator has not configured this assessment yet.</p>}
          {!assessmentActive && !assessmentResult?.submissionError && finalAssessment.configured && !finalAssessment.readingCompleted && <p className="text-sm text-slate-700">Complete the required reading before starting this assessment.</p>}
          {!assessmentActive && !assessmentResult?.submissionError && !assessmentResult?.passed && finalAssessment.configured && finalAssessment.readingCompleted && !finalAssessment.passed && finalAssessment.attemptsRemaining > 0 && <button className="btn-primary w-full" onClick={startFinalAssessment}>Start final assessment ({finalAssessment.attemptsRemaining} attempt{finalAssessment.attemptsRemaining === 1 ? '' : 's'} remaining)</button>}
          {!assessmentActive && !assessmentResult?.submissionError && !finalAssessment.passed && finalAssessment.attemptsRemaining === 0 && <p className="text-sm text-amber-800">No attempts remain. Contact your administrator for help.</p>}
        </section>}
        {isAdmin && !selected.active && <p className="text-xs text-slate-500">This draft or archived resource is visible only to administrators. Publish it from Manage document after previewing.</p>}
      </div>}
    </Modal>
  </div>;
}
