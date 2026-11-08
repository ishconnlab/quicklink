import mongoose from 'mongoose';

const reissueHistorySchema = new mongoose.Schema({
  code: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reason: { type: String, default: '', trim: true, maxlength: 1000 },
}, { _id: false });

const certificateSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['course', 'book'], default: 'course', index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', default: null, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningBook', default: null, index: true },
  studentName: { type: String, required: true, trim: true, maxlength: 120 },
  courseTitle: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  level: { type: String, default: 'Training', enum: ['L3', 'L4', 'L5', 'Bootcamp', 'Training'] },
  completionDate: { type: Date, default: null },
  issuedAt: { type: Date, required: true, default: Date.now, index: true },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null, index: true },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revocationReason: { type: String, default: '', trim: true, maxlength: 1000 },
  reissueHistory: { type: [reissueHistorySchema], default: [] },
}, { timestamps: true });

certificateSchema.pre('validate', function validateCertificateTarget(next) {
  if (!this.course && !this.book) return next(new Error('A certificate must reference a course or a learning book.'));
  if (this.book && !this.course) this.kind = 'book';
  if (!this.completionDate) this.completionDate = this.issuedAt || new Date();
  next();
});

certificateSchema.index(
  { student: 1, course: 1 },
  { unique: true, partialFilterExpression: { course: { $type: 'objectId' } }, name: 'certificate_course_unique' },
);
certificateSchema.index(
  { student: 1, book: 1 },
  { unique: true, partialFilterExpression: { book: { $type: 'objectId' } }, name: 'certificate_book_unique' },
);
export const CourseCertificate = mongoose.model('CourseCertificate', certificateSchema);
export default CourseCertificate;
