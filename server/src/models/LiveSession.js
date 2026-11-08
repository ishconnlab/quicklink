import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  firstJoinedAt: { type: Date, required: true },
  lastJoinedAt: { type: Date, required: true },
  lastLeftAt: { type: Date, default: null },
  totalSeconds: { type: Number, default: 0, min: 0 },
  joinCount: { type: Number, default: 1, min: 1 },
}, { _id: false });

const reportAttendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  attended: { type: Boolean, default: false },
  status: { type: String, enum: ['present', 'absent', 'late', 'early', 'excused'], default: 'absent' },
  late: { type: Boolean, default: false },
  early: { type: Boolean, default: false },
  correctionHistory: [{
    fromStatus: { type: String, enum: ['present', 'absent', 'late', 'early', 'excused'] },
    toStatus: { type: String, enum: ['present', 'absent', 'late', 'early', 'excused'], required: true },
    reason: { type: String, trim: true, maxlength: 1000, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: Date.now },
  }],
  firstJoinedAt: { type: Date, default: null },
  lastLeftAt: { type: Date, default: null },
  totalSeconds: { type: Number, default: 0 },
  joinCount: { type: Number, default: 0 },
}, { _id: false });

const liveSessionSchema = new mongoose.Schema({
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  sessionCode: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  status: { type: String, enum: ['live', 'ended'], default: 'live', index: true },
  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startedAt: { type: Date, required: true, default: Date.now },
  endedAt: { type: Date, default: null },
  screenShareAllowed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attendance: { type: [attendanceSchema], default: [] },
  report: {
    generatedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    enrolledCount: { type: Number, default: 0 },
    attendedCount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    earlyCount: { type: Number, default: 0 },
    excusedCount: { type: Number, default: 0 },
    attendance: { type: [reportAttendanceSchema], default: [] },
    teacherNotes: { type: String, default: '', trim: true, maxlength: 4000 },
  },
}, { timestamps: true });

liveSessionSchema.index({ learningClass: 1, status:  1 });
export const LiveSession = mongoose.model('LiveSession', liveSessionSchema);
export default LiveSession;
