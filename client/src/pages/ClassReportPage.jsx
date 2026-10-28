import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Users } from 'lucide-react';
import api, { apiError } from '../api/client.js';
import { Badge, PageHeader, StatCard } from '../components/layout.jsx';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../lib/format.js';

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const duration = (seconds) => `${Math.floor(seconds / 60)} min`;

export default function ClassReportPage() {
  const { sessionId } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.get(`/classes/sessions/${sessionId}/report`).then((response) => { if (active) setData(response.data.data); })
      .catch((error) => toast.error(apiError(error).message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId]);

  const downloadCsv = () => {
    const report = data.session.report;
    const rows = [
      ['Name', 'Email', 'Role', 'Attended', 'First joined', 'Last left', 'Minutes present', 'Join count'],
      ...report.attendance.map((person) => [person.name, person.email, person.role, person.status || (person.attended ? 'present' : 'absent'), person.firstJoinedAt || '', person.lastLeftAt || '', Math.round(person.totalSeconds / 60), person.joinCount]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `class-attendance-${data.session.sessionCode}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const correctAttendance = async (person) => {
    const status = window.prompt('Set status: present, absent, late, early, or excused', person.status || (person.attended ? 'present' : 'absent'));
    if (!['present','absent','late','early','excused'].includes(status)) return;
    const reason = window.prompt('Enter a reason for the attendance correction.', '');
    if (!reason?.trim()) return;
    try {
      await api.patch(`/classes/sessions/${sessionId}/attendance/${person.user}`, { status, reason });
      const response = await api.get(`/classes/sessions/${sessionId}/report`);
      setData(response.data.data);
      toast.success('Attendance correction saved with an audit record.');
    } catch (error) { toast.error(apiError(error).message); }
  };

  const downloadPdf = async () => {
    try {
      const response = await api.get(`/classes/${data.class.id}/report.pdf`, { params: { sessionId }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `quicklink-attendance-${data.session.sessionCode}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast.error(apiError(error).message); }
  };

  if (loading) return <PageLoader label="Loading attendance report…" />;
  if (!data) return <EmptyState title="Report unavailable" description="The session may still be live or you may not have access." />;
  const { session, class: classInfo } = data;
  const report = session.report;
  const canManage = user?.role === 'owner' || (user?.role === 'teacher' && (classInfo.teacher.id === user.id || classInfo.teachers?.some((teacher) => teacher.id === user.id)));
  return <div>
    <Link to={`/classes/${classInfo.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"><ArrowLeft size={16} />Back to class</Link>
    <PageHeader title="Class attendance report" subtitle={`${classInfo.title} · ${classInfo.subject} · ${classInfo.level}`} actions={<div className="flex gap-2"><button className="btn-secondary" onClick={downloadCsv}><Download size={17} />CSV</button><button className="btn-primary" onClick={downloadPdf}><FileText size={17} />Download PDF</button></div>} />
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Students present" value={`${report.attendedCount}/${report.enrolledCount}`} icon={Users} accent="green" />
      <StatCard label="Late" value={report.lateCount || 0} icon={Users} accent="amber" />
      <StatCard label="Early leave" value={report.earlyCount || 0} icon={Users} />
      <StatCard label="Excused" value={report.excusedCount || 0} icon={Users} />
      <StatCard label="Session duration" value={duration(report.durationSeconds)} icon={Users} />
      <StatCard label="Started" value={formatDateTime(session.startedAt)} />
      <StatCard label="Ended" value={formatDateTime(session.endedAt)} />
    </div>
    <section className="card mb-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-800">Attendance</h2><Badge color="brand">{report.attendance.length} people</Badge></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase text-slate-400"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">First joined</th><th className="py-2 pr-3">Time present</th><th className="py-2">Joins</th></tr></thead><tbody>{report.attendance.map((person) => <tr key={`${person.user}-${person.role}`} className="border-b border-slate-50"><td className="py-3 pr-3"><span className="block font-medium text-slate-800">{person.name}</span><span className="text-xs text-slate-400">{person.email}</span>{person.correctionHistory?.map((correction, index) => <span key={index} className="block text-[10px] text-slate-400">Correction: {correction.fromStatus} → {correction.toStatus} · {correction.reason}</span>)}</td><td className="py-3 pr-3 capitalize text-slate-600">{person.role}</td><td className="py-3 pr-3"><Badge color={person.status === 'present' ? 'green' : person.status === 'late' ? 'amber' : person.status === 'early' || person.status === 'excused' ? 'brand' : 'slate'}>{person.status || (person.attended ? 'present' : 'absent')}</Badge>{canManage && person.role === 'student' && <button onClick={() => correctAttendance(person)} className="ml-2 text-xs text-brand-700">Correct</button>}</td><td className="py-3 pr-3 text-slate-600">{person.firstJoinedAt ? formatDateTime(person.firstJoinedAt) : '—'}</td><td className="py-3 pr-3 text-slate-600">{person.attended ? duration(person.totalSeconds) : '—'}</td><td className="py-3 text-slate-600">{person.joinCount || '—'}</td></tr>)}</tbody></table></div>
    </section>
    {report.teacherNotes && <section className="card"><h2 className="mb-2 font-semibold text-slate-800">Teacher notes</h2><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{report.teacherNotes}</p></section>}
  </div>;
}
