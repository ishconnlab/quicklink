import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConnectionQuality, createLocalTracks, Room, RoomEvent, Track } from 'livekit-client';
import { ArrowLeft, Camera, CameraOff, Check, Copy, LayoutGrid, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Send, Users, Video } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { apiError, getToken } from '../api/client.js';
import { Badge, PageHeader } from '../components/layout.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../lib/format.js';

const layouts = [
  ['auto', 'Auto layout'], ['grid', 'Grid view'], ['speaker', 'Speaker view'],
  ['presentation', 'Presentation focus'], ['side', 'Side-by-side'], ['spotlight', 'Spotlight view'],
  ['pip', 'Picture-in-picture'], ['compact', 'Compact filmstrip'],
];
const roomUrl = (code) => `${window.location.origin}/classes/join/${code}`;

function publicationFor(participant, source) {
  return participant?.getTrackPublication?.(source) || [...(participant?.trackPublications?.values?.() || [])].find((publication) => publication.source === source);
}

function MediaTile({ participant, preferredSource, local = false, speaking = false, selected = false }) {
  const videoRef = useRef(null);
  const publication = publicationFor(participant, preferredSource)
    || publicationFor(participant, Track.Source.Camera)
    || publicationFor(participant, Track.Source.ScreenShare);
  const track = publication?.track;
  useEffect(() => {
    if (!videoRef.current || !track || track.kind === Track.Kind.Audio) return undefined;
    track.attach(videoRef.current);
    return () => { track.detach(videoRef.current); };
  }, [track]);
  const name = participant?.name || participant?.identity || 'Participant';
  const isScreen = publication?.source === Track.Source.ScreenShare;
  const isCameraMuted = !isScreen && !publication?.isSubscribed && !publication?.track;
  return <div className={`relative flex aspect-video min-h-32 items-center justify-center overflow-hidden rounded-xl bg-slate-900 ${speaking ? 'ring-2 ring-emerald-400' : ''} ${selected ? 'ring-2 ring-brand-500' : ''}`}>
    {track && track.kind !== Track.Kind.Audio ? <video ref={videoRef} autoPlay playsInline muted={local} className="absolute inset-0 h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-slate-300"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-xl font-semibold">{name.slice(0, 1).toUpperCase()}</span><span className="text-xs">{isCameraMuted ? 'Camera off' : 'Connecting media'}</span></div>}
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8"><span className="truncate text-xs font-medium text-white">{name}{local ? ' (you)' : ''}{isScreen ? ' · sharing screen' : ''}</span>{speaking && <span className="rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">Speaking</span>}</div>
  </div>;
}

function ParticipantAudio({ participant }) {
  const ref = useRef(null);
  const publication = publicationFor(participant, Track.Source.Microphone);
  useEffect(() => {
    if (!ref.current || !publication?.track) return undefined;
    publication.track.attach(ref.current);
    return () => publication.track.detach(ref.current);
  }, [publication?.track]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

export default function LiveSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(false);
  const [chatOnly, setChatOnly] = useState(false);
  const [chatConnected, setChatConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [socketPeople, setSocketPeople] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notes, setNotes] = useState('');
  const [noteRevision, setNoteRevision] = useState(0);
  const [notesSaving, setNotesSaving] = useState(false);
  const [unread, setUnread] = useState(0);
  const [chat, setChat] = useState('');
  const [panel, setPanel] = useState('chat');
  const [layout, setLayout] = useState(() => sessionStorage.getItem(`quicklink.layout.${sessionId}`) || 'auto');
  const [spotlightId, setSpotlightId] = useState('');
  const [mediaWarning, setMediaWarning] = useState('');
  const [roomError, setRoomError] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState(ConnectionQuality.Unknown);
  const [previewTracks, setPreviewTracks] = useState([]);
  const [previewStream, setPreviewStream] = useState(null);
  const [deviceList, setDeviceList] = useState({ audioinput: [], videoinput: [] });
  const [selectedDevices, setSelectedDevices] = useState({ audioinput: '', videoinput: '' });
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const roomRef = useRef(null);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const localPreviewRef = useRef(null);
  const joinedRef = useRef(false);
  const previewTracksRef = useRef([]);
  const panelRef = useRef(panel);
  const shouldAutoScroll = useRef(true);
  panelRef.current = panel;

  const isTeacher = user?.role === 'owner' || (user?.role === 'teacher' && (data?.class?.teacher?.id === user.id || data?.class?.teachers?.some((teacher) => teacher.id === user.id)));
  const socketBase = useMemo(() => (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://quicklink-3eng.onrender.com' : window.location.origin)).replace(/\/$/, ''), []);

  const refreshParticipants = useCallback((room) => {
    if (!room) return;
    setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
  }, []);

  useEffect(() => {
    let active = true;
    api.get(`/classes/sessions/${sessionId}`).then((response) => { if (active) setData(response.data.data); })
      .catch((error) => toast.error(apiError(error).message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!data?.session?.startedAt) return undefined;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(data.session.startedAt).getTime()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [data?.session?.startedAt]);

  useEffect(() => {
    if (!localPreviewRef.current || !previewStream) return;
    localPreviewRef.current.srcObject = previewStream;
  }, [previewStream]);

  const checkDevices = async () => {
    setMediaWarning('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera and microphone access. Try an up-to-date Chrome, Edge, Firefox, or Safari browser.');
      previewTracksRef.current.forEach((track) => track.stop());
      const tracks = await createLocalTracks({ audio: true, video: true });
      previewTracksRef.current = tracks;
      setPreviewTracks(tracks);
      setPreviewStream(new MediaStream(tracks.map((track) => track.mediaStreamTrack)));
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioinput = devices.filter((device) => device.kind === 'audioinput');
      const videoinput = devices.filter((device) => device.kind === 'videoinput');
      setDeviceList({ audioinput, videoinput });
      setSelectedDevices({ audioinput: audioinput[0]?.deviceId || '', videoinput: videoinput[0]?.deviceId || '' });
      setMicOn(tracks.some((track) => track.kind === Track.Kind.Audio));
      setCameraOn(tracks.some((track) => track.kind === Track.Kind.Video));
    } catch (error) {
      previewTracksRef.current.forEach((track) => track.stop());
      previewTracksRef.current = [];
      setPreviewTracks([]);
      setPreviewStream(null);
      setMediaWarning(error?.name === 'NotAllowedError' ? 'Camera or microphone permission was denied. You can continue with both off, or allow access in your browser settings and try again.' : error.message || 'No camera or microphone is available. You can continue with both off.');
      setMicOn(false);
      setCameraOn(false);
    }
  };

  const togglePreviewTrack = async (kind) => {
    const audio = kind === Track.Kind.Audio;
    const enabled = audio ? micOn : cameraOn;
    const track = previewTracks.find((candidate) => candidate.kind === kind);
    try {
      if (track) { if (enabled) await track.mute(); else await track.unmute(); }
      if (audio) setMicOn(!enabled); else setCameraOn(!enabled);
      if (!audio && previewTracks.length) setPreviewStream(new MediaStream(previewTracks.map((candidate) => candidate.mediaStreamTrack)));
    } catch (error) { setMediaWarning(error.message || 'Could not change this device.'); }
  };

  const changePreviewDevice = async (kind, deviceId) => {
    const track = previewTracks.find((candidate) => candidate.kind === kind);
    if (!track) return;
    try {
      await track.restartTrack({ deviceId });
      setSelectedDevices((current) => ({ ...current, [kind === Track.Kind.Audio ? 'audioinput' : 'videoinput']: deviceId }));
      if (kind === Track.Kind.Video) setPreviewStream(new MediaStream(previewTracks.map((candidate) => candidate.mediaStreamTrack)));
      setMediaWarning('');
    } catch (error) { setMediaWarning(error.message || 'Could not switch to that device.'); }
  };

  const joinClass = async () => {
    if (joining) return;
    setJoining(true);
    setRoomError('');
    try {
      if (data.mediaConfigured === false) {
        setChatOnly(true);
        setConnected(false);
        connectClassSocket();
        setRoomError('LiveKit media is not configured. You can use class chat and notes while an admin configures the media service.');
        return;
      }
      const tokenResponse = await api.post(`/classes/sessions/${sessionId}/livekit-token`);
      const room = new Room({ adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: true } });
      roomRef.current = room;
      const update = () => refreshParticipants(room);
      for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished]) room.on(event, update);
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => { if (participant?.identity === user?.id) setConnectionQuality(quality); update(); });
      room.on(RoomEvent.Reconnecting, () => { setReconnecting(true); setRoomError('Connection interrupted. QuickLink is trying to reconnect…'); });
      room.on(RoomEvent.ActiveSpeakersChanged, (activeSpeakers) => setSpeakers(activeSpeakers.map((person) => person.identity)));
      room.on(RoomEvent.Disconnected, () => { setConnected(false); setReconnecting(false); joinedRef.current = false; socketRef.current?.emit('room:leave'); });
      room.on(RoomEvent.Reconnected, () => { setConnected(true); setReconnecting(false); setRoomError(''); joinAttendanceRoom(); });
      room.on(RoomEvent.LocalTrackPublished, (publication) => { if (publication.source === Track.Source.ScreenShare) setSharing(true); update(); });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => { if (publication.source === Track.Source.ScreenShare) setSharing(false); update(); });
      await room.connect(tokenResponse.data.data.serverUrl, tokenResponse.data.data.token);
      for (const track of previewTracks) {
        if (track.kind === Track.Kind.Audio && !micOn) { track.mute(); continue; }
        if (track.kind === Track.Kind.Video && !cameraOn) { track.mute(); continue; }
        await room.localParticipant.publishTrack(track);
      }
      setConnected(true);
      setChatOnly(false);
      refreshParticipants(room);
      connectClassSocket();
      previewTracksRef.current = [];
      setPreviewTracks([]);
      setPreviewStream(null);
    } catch (error) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setRoomError(apiError(error).message || 'Could not connect to the live class.');
    } finally { setJoining(false); }
  };

  const joinAttendanceRoom = () => {
    if (joinedRef.current || !socketRef.current?.connected) return;
    joinedRef.current = true;
    socketRef.current.emit('room:join', { sessionId }, (result) => {
      if (!result?.ok) { joinedRef.current = false; setRoomError(result?.message || 'Could not verify your class enrollment.'); return; }
      setMessages(result.messages || []);
      setSocketPeople([...(result.peers || []).map((person) => ({ ...person, identity: person.userId })), { socketId: 'local', userId: user?.id, identity: user?.id, name: user?.name, role: user?.role }]);
      api.get(`/classes/sessions/${sessionId}/notes`).then((response) => {
        setNotes(response.data.data.notes || '');
        setNoteRevision(response.data.data.revision || 0);
      }).catch((error) => toast.error(apiError(error).message));
      setRoomError('');
    });
  };

  const connectClassSocket = () => {
    if (socketRef.current?.connected) return;
    const socket = io(socketBase, { auth: { token: getToken() }, reconnection: true, reconnectionAttempts: 8 });
    socketRef.current = socket;
    socket.on('connect', () => { setChatConnected(true); joinAttendanceRoom(); });
    socket.on('disconnect', () => { setChatConnected(false); joinedRef.current = false; setRoomError('Class chat disconnected. Reconnecting…'); });
    socket.on('connect_error', (error) => { setChatConnected(false); setRoomError(error.message || 'Attendance and class chat disconnected. Reconnecting…'); });
    socket.on('room:peer-joined', (person) => setSocketPeople((current) => current.some((item) => item.socketId === person.socketId) ? current : [...current, { ...person, identity: person.userId }]));
    socket.on('room:peer-left', (person) => setSocketPeople((current) => current.filter((item) => item.socketId !== person.socketId)));
    socket.on('chat:message', (message) => {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].slice(-250));
      if (panelRef.current !== 'chat') setUnread((count) => count + 1);
    });
    socket.on('chat:updated', (message) => setMessages((current) => current.map((item) => item.id === message.id ? message : item)));
    socket.on('session:ended', () => navigate(`/classes/sessions/${sessionId}/report`, { replace: true }));
  };

  const disconnectRoom = useCallback(() => {
    socketRef.current?.emit('room:leave');
    socketRef.current?.disconnect();
    socketRef.current = null;
    roomRef.current?.disconnect();
    roomRef.current = null;
    previewTracksRef.current.forEach((track) => track.stop());
    previewTracksRef.current = [];
    setConnected(false);
    joinedRef.current = false;
  }, []);

  useEffect(() => () => { disconnectRoom(); }, [disconnectRoom]);

  useEffect(() => {
    if (shouldAutoScroll.current) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      const response = await api.put(`/classes/sessions/${sessionId}/notes`, { content: notes, revision: noteRevision });
      setNotes(response.data.data.notes);
      setNoteRevision(response.data.data.revision);
      toast.success('Shared notes saved.');
    } catch (error) { toast.error(apiError(error).message); }
    finally { setNotesSaving(false); }
  };

  const updateChat = (type, message) => socketRef.current?.emit(type, { messageId: message.id, pinned: !message.pinned }, (result) => {
    if (!result?.ok) toast.error(result?.message || 'Could not update this message.');
  });

  const reportMessage = (message) => {
    const reason = window.prompt('Why are you reporting this message?', '');
    if (!reason?.trim()) return;
    socketRef.current?.emit('chat:report', { messageId: message.id, reason }, (result) => {
      if (result?.ok) toast.success('Message reported to the class teacher.');
      else toast.error(result?.message || 'Could not report this message.');
    });
  };

  const sendChat = (event) => {
    event.preventDefault();
    const body = chat.trim();
    if (!body || !socketRef.current?.connected) return;
    socketRef.current.emit('chat:send', { body }, (result) => { if (!result?.ok) toast.error(result?.message || 'Could not send message.'); });
    setChat('');
  };

  const toggleMic = async () => {
    const next = !micOn;
    try { await roomRef.current?.localParticipant.setMicrophoneEnabled(next); setMicOn(next); }
    catch (error) { toast.error(error.message || 'Could not change microphone state.'); }
  };
  const toggleCamera = async () => {
    const next = !cameraOn;
    try { await roomRef.current?.localParticipant.setCameraEnabled(next); setCameraOn(next); }
    catch (error) { toast.error(error.message || 'Could not change camera state.'); }
  };
  const toggleScreenShare = async () => {
    try { await roomRef.current?.localParticipant.setScreenShareEnabled(!sharing, { audio: false }); setSharing((value) => !value); }
    catch (error) { toast.info(error?.name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : 'This browser or device does not support screen sharing.'); }
  };
  const setActiveLayout = (next) => { setLayout(next); sessionStorage.setItem(`quicklink.layout.${sessionId}`, next); };

  const endSession = async () => {
    const teacherNotes = window.prompt('Optional: add notes for the attendance report.', '') || '';
    setEnding(true);
    try {
      await api.post(`/classes/sessions/${sessionId}/end`, { teacherNotes });
      disconnectRoom();
      navigate(`/classes/sessions/${sessionId}/report`, { replace: true });
    } catch (error) { toast.error(apiError(error).message); }
    finally { setEnding(false); }
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(roomUrl(data.session.sessionCode)); toast.success('Join link copied.'); }
    catch { toast.error('Could not copy the class link.'); }
  };

  const liveParticipants = participants.length ? participants : [];
  const screenOwner = liveParticipants.find((person) => publicationFor(person, Track.Source.ScreenShare)?.track);
  const activeSpeaker = liveParticipants.find((person) => speakers.includes(person.identity)) || liveParticipants[0];
  const spotlight = liveParticipants.find((person) => person.identity === spotlightId) || activeSpeaker;
  let mainPerson = activeSpeaker;
  if (layout === 'presentation' && screenOwner) mainPerson = screenOwner;
  if (layout === 'spotlight') mainPerson = spotlight;
  if (layout === 'pip') mainPerson = activeSpeaker;
  if (layout === 'compact') mainPerson = screenOwner || activeSpeaker;
  const secondary = liveParticipants.filter((person) => person.identity !== mainPerson?.identity);
  const isLocal = (person) => person.identity === user?.id;
  const mainSource = person => person === screenOwner ? Track.Source.ScreenShare : Track.Source.Camera;

  if (loading) return <PageLoader label="Loading live class…" />;
  if (!data) return <EmptyState title="Class session unavailable" description="This session may have ended or you may not have access." action={<Link to="/classes" className="btn-secondary">Back to classes</Link>} />;
  if (data.session.status !== 'live') return <EmptyState title="This class has ended" description="The attendance report is ready." action={<Link to={`/classes/sessions/${sessionId}/report`} className="btn-primary">View attendance report</Link>} />;

  if (!connected && !chatOnly) return <div className="mx-auto max-w-3xl space-y-4">
    <Link to={`/classes/${data.class.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500"><ArrowLeft size={16} />Back to class</Link>
    <PageHeader title="Check your devices" subtitle={`${data.session.title} · ${data.class.subject} · ${data.class.level}`} />
    <section className="card grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
      <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-slate-900">
        {previewStream && cameraOn ? <video ref={localPreviewRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" /> : <div className="text-center text-slate-300"><Video size={32} className="mx-auto mb-2" /><p className="text-sm">Camera preview is off</p></div>}
        <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">{user?.name} (you)</div>
        {data.mediaConfigured !== false && <div className="absolute bottom-3 right-3 flex gap-2"><button className={`rounded-full p-2 ${micOn ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`} onClick={() => togglePreviewTrack(Track.Kind.Audio)} aria-label={micOn ? 'Mute microphone' : 'Turn microphone on'}>{micOn ? <Mic size={16} /> : <MicOff size={16} />}</button><button className={`rounded-full p-2 ${cameraOn ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`} onClick={() => togglePreviewTrack(Track.Kind.Video)} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Camera size={16} /> : <CameraOff size={16} />}</button></div>}
      </div>
      <div className="space-y-4"><div><h2 className="font-semibold text-slate-800">Before you join</h2><p className="mt-1 text-sm leading-6 text-slate-500">QuickLink asks for camera and microphone access only when you choose Check devices. You can join with either device off. Your browser controls these permissions.</p></div>
        {data.mediaConfigured === false ? <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900"><p className="font-semibold">Live classroom media is not configured.</p><p className="mt-1">An admin must set LiveKit credentials on the server. You can still join class chat and shared notes; camera, microphone, and screen sharing will be unavailable.</p></div> : <><button onClick={checkDevices} className="btn-secondary w-full"><Camera size={16} />Check camera and microphone</button>
        {deviceList.videoinput.length > 0 && <label className="block text-sm"><span className="label">Camera</span><select className="input" value={selectedDevices.videoinput} onChange={(event) => changePreviewDevice(Track.Kind.Video, event.target.value)}>{deviceList.videoinput.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
        {deviceList.audioinput.length > 0 && <label className="block text-sm"><span className="label">Microphone</span><select className="input" value={selectedDevices.audioinput} onChange={(event) => changePreviewDevice(Track.Kind.Audio, event.target.value)}>{deviceList.audioinput.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>}</>}
        {mediaWarning && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{mediaWarning}</p>}{roomError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{roomError}</p>}
        <button onClick={joinClass} disabled={joining} className="btn-primary w-full">{joining ? <Spinner size={17} /> : data.mediaConfigured === false ? <MessageSquare size={17} /> : <Video size={17} />}{data.mediaConfigured === false ? 'Join class chat and notes' : 'Join class'}</button>
      </div>
    </section>
  </div>;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Link to={`/classes/${data.class.id}`} className="rounded-full p-2 text-slate-500 hover:bg-white"><ArrowLeft size={18} /></Link><div><h1 className="font-semibold text-slate-900">{data.session.title}</h1><p className="text-xs text-slate-500">{data.class.subject} · {formatDateTime(data.session.startedAt)}</p></div></div><div className="flex flex-wrap items-center justify-end gap-2"><Badge color={connected ? 'green' : 'amber'}><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />{connected ? (reconnecting ? 'Reconnecting media' : 'Media connected') : chatOnly ? (chatConnected ? 'Chat connected · media off' : 'Reconnecting chat') : 'Reconnecting'}</Badge>{connected && <Badge color={connectionQuality === ConnectionQuality.Poor || connectionQuality === ConnectionQuality.Lost ? 'red' : 'slate'}>Network: {ConnectionQuality[connectionQuality] || 'Checking'}</Badge>}<span className="font-mono text-sm text-slate-600">{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}</span><button onClick={copyInvite} className="btn-secondary min-h-9 px-3"><Copy size={15} /><span className="hidden sm:inline">Invite</span></button></div></div>
    {roomError && <div role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{roomError}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="relative"><label htmlFor="class-layout" className="sr-only">Classroom layout</label><div className="flex items-center gap-2"><LayoutGrid size={16} className="text-slate-500" /><select id="class-layout" className="input min-h-9 w-auto py-1 text-sm" value={layout} onChange={(event) => setActiveLayout(event.target.value)}>{layouts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>{layout === 'spotlight' && <label className="flex items-center gap-2 text-sm">Spotlight participant<select className="input min-h-9 w-auto py-1" value={spotlightId} onChange={(event) => setSpotlightId(event.target.value)}>{liveParticipants.map((person) => <option key={person.identity} value={person.identity}>{person.name || person.identity}</option>)}</select></label>}</div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        {participants.map((person) => <ParticipantAudio key={`audio-${person.identity}`} participant={person} />)}
        {chatOnly ? <section className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"><Video size={34} className="text-amber-700" /><h2 className="mt-3 font-semibold text-amber-950">Class chat is available; live media is offline</h2><p className="mt-2 max-w-lg text-sm leading-6 text-amber-900">Your class membership is verified. Chat, shared notes, and attendance work through QuickLink. Ask an admin to configure LiveKit to enable camera, microphone, and screen sharing.</p></section> : <>
        {layout === 'auto' && <div className={`grid gap-3 ${liveParticipants.length <= 2 ? 'sm:grid-cols-2' : liveParticipants.length <= 6 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>{liveParticipants.map((person) => <div key={person.identity}><MediaTile participant={person} local={isLocal(person)} speaking={speakers.includes(person.identity)} /></div>)}</div>}
        {layout === 'grid' && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{liveParticipants.map((person) => <div key={person.identity}><MediaTile participant={person} local={isLocal(person)} speaking={speakers.includes(person.identity)} /></div>)}</div>}
        {layout === 'speaker' && <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]"><MediaTile participant={activeSpeaker} local={isLocal(activeSpeaker)} speaking />{secondary.map((person) => <MediaTile key={person.identity} participant={person} local={isLocal(person)} />)}</div>}
        {layout === 'presentation' && screenOwner && <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px]"><MediaTile participant={screenOwner} preferredSource={Track.Source.ScreenShare} local={isLocal(screenOwner)} />{secondary.map((person) => <MediaTile key={person.identity} participant={person} local={isLocal(person)} />)}</div>}
        {layout === 'presentation' && !screenOwner && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{liveParticipants.map((person) => <MediaTile key={person.identity} participant={person} local={isLocal(person)} speaking={speakers.includes(person.identity)} />)}</div>}
        {layout === 'side' && <div className="grid gap-3 md:grid-cols-2"><div className="min-h-64"><MediaTile participant={screenOwner || activeSpeaker} preferredSource={screenOwner ? Track.Source.ScreenShare : Track.Source.Camera} local={isLocal(screenOwner || activeSpeaker)} /></div><div className="grid grid-cols-2 gap-2 content-start">{liveParticipants.filter((person) => person.identity !== (screenOwner || activeSpeaker)?.identity).map((person) => <MediaTile key={person.identity} participant={person} local={isLocal(person)} />)}</div></div>}
        {layout === 'spotlight' && <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]"><MediaTile participant={spotlight} local={isLocal(spotlight)} selected />{liveParticipants.filter((person) => person.identity !== spotlight?.identity).map((person) => <MediaTile key={person.identity} participant={person} local={isLocal(person)} />)}</div>}
        {layout === 'pip' && <div className="relative min-h-[320px] overflow-hidden rounded-xl bg-slate-900"><div className="absolute inset-0"><MediaTile participant={activeSpeaker} local={isLocal(activeSpeaker)} speaking /></div><div className="absolute bottom-3 right-3 z-10 flex max-w-[70%] gap-2 overflow-x-auto">{secondary.map((person) => <div key={person.identity} className="w-32 shrink-0"><MediaTile participant={person} local={isLocal(person)} /></div>)}</div></div>}
        {layout === 'compact' && <div className="space-y-2"><div className="min-h-[300px]"><MediaTile participant={screenOwner || activeSpeaker} preferredSource={screenOwner ? Track.Source.ScreenShare : Track.Source.Camera} local={isLocal(screenOwner || activeSpeaker)} /></div><div className="flex gap-2 overflow-x-auto pb-2">{liveParticipants.filter((person) => person.identity !== (screenOwner || activeSpeaker)?.identity).map((person) => <div key={person.identity} className="w-36 shrink-0"><MediaTile participant={person} local={isLocal(person)} /></div>)}</div></div>}
        </>}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-white p-3 shadow-sm">{connected && <><button onClick={toggleMic} className={micOn ? 'btn-secondary' : 'btn-danger'} title={micOn ? 'Mute microphone' : 'Turn microphone on'}>{micOn ? <Mic size={17} /> : <MicOff size={17} />}<span className="hidden sm:inline">{micOn ? 'Mute' : 'Unmute'}</span></button><button onClick={toggleCamera} className={cameraOn ? 'btn-secondary' : 'btn-danger'} title={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Camera size={17} /> : <CameraOff size={17} />}<span className="hidden sm:inline">{cameraOn ? 'Camera off' : 'Camera on'}</span></button>{isTeacher && <button onClick={toggleScreenShare} className={sharing ? 'btn-primary' : 'btn-secondary'}><MonitorUp size={17} />{sharing ? 'Stop sharing' : 'Share screen'}</button>}</>}<span className="flex items-center gap-1 px-2 text-xs text-slate-500"><Users size={15} />{chatOnly ? socketPeople.length : participants.length}</span>{isTeacher && <button onClick={() => { disconnectRoom(); navigate(`/classes/${data.class.id}`); }} className="btn-secondary"><PhoneOff size={17} />Leave room</button>}{isTeacher ? <button onClick={endSession} disabled={ending} className="btn-danger">{ending ? <Spinner size={16} /> : <PhoneOff size={17} />}End class</button> : <button onClick={() => { disconnectRoom(); navigate(`/classes/${data.class.id}`); }} className="btn-danger"><PhoneOff size={17} />Leave</button>}</div>
        {isTeacher && <p className="text-center text-xs text-slate-400">Screen sharing is available to teachers. Students can share only when enabled by their teacher.</p>}
      </div>
      <aside className="flex min-h-[380px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:h-[calc(100vh-200px)]"><div className="flex border-b border-slate-100"><button className={`flex-1 px-2 py-3 text-sm ${panel === 'chat' ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-500'}`} onClick={() => { setPanel('chat'); setUnread(0); }}><MessageSquare size={15} className="mr-1 inline" />Chat{unread ? ` (${unread})` : ''}</button><button className={`flex-1 px-2 py-3 text-sm ${panel === 'notes' ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-500'}`} onClick={() => setPanel('notes')}>Notes</button><button className={`flex-1 px-2 py-3 text-sm ${panel === 'people' ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-500'}`} onClick={() => setPanel('people')}><Users size={15} className="mr-1 inline" />People ({participants.length})</button></div>
        {panel === 'chat' ? <><div className="flex-1 space-y-3 overflow-y-auto p-3" onScroll={(event) => { const el = event.currentTarget; shouldAutoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>{messages.map((message) => <div key={message.id} className={`rounded-lg p-2 text-sm ${message.pinned ? 'bg-amber-50' : ''}`}><div className="flex items-baseline justify-between gap-2"><span className="truncate font-medium text-slate-700">{message.userId === user?.id ? 'You' : message.name}{message.pinned ? ' · Pinned' : ''}</span><span className="shrink-0 text-[10px] text-slate-400">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><p className="mt-0.5 whitespace-pre-wrap break-words text-slate-600">{message.body}</p><div className="mt-1 flex gap-2">{isTeacher && !message.removed && <><button onClick={() => updateChat('chat:pin', message)} className="text-[11px] text-brand-700">{message.pinned ? 'Unpin' : 'Pin'}</button><button onClick={() => updateChat('chat:remove', message)} className="text-[11px] text-red-600">Remove</button></>}{user?.role === 'student' && message.userId !== user?.id && !message.removed && <button onClick={() => reportMessage(message)} className="text-[11px] text-slate-400">Report</button>}</div></div>)}<div ref={chatEndRef} /></div><form onSubmit={sendChat} className="flex gap-2 border-t border-slate-100 p-3"><input className="input min-h-10" value={chat} onChange={(event) => setChat(event.target.value)} maxLength={2000} placeholder="Share a message…" disabled={!connected} /><button className="btn-primary min-h-10 px-3" disabled={!chat.trim() || !connected} aria-label="Send message"><Send size={16} /></button></form></> : panel === 'notes' ? <div className="flex flex-1 flex-col gap-3 p-3"><p className="text-xs leading-5 text-slate-500">Notes are saved with this class session. Teacher changes use revision checks to prevent overwriting a newer version.</p><textarea value={notes} onChange={(event) => setNotes(event.target.value)} readOnly={!isTeacher} maxLength={20000} className="input min-h-48 flex-1 resize-y" placeholder={isTeacher ? 'Add lesson points, links, and summary…' : 'No shared notes yet.'} />{isTeacher && <button onClick={saveNotes} disabled={notesSaving} className="btn-primary self-end">{notesSaving ? <Spinner size={16} /> : <Check size={16} />}Save notes</button>}</div> : <div className="flex-1 space-y-2 overflow-y-auto p-3">{participants.map((person) => <div key={person.identity} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="min-w-0 truncate text-sm text-slate-700">{person.name || person.identity}{person.identity === user?.id ? ' (you)' : ''}</span><span className="text-xs text-slate-400">{person.connectionQuality === ConnectionQuality.Poor ? 'Poor connection' : person.isSpeaking ? 'Speaking' : 'Joined'}</span></div>)}</div>}
      </aside>
    </div>
  </div>;
}
