import mongoose from 'mongoose';

const certificateSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['course', 'book'], default: 'course', index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', default: null, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningBook', default: null, index: true },
  studentName: { type: String, required: true, trim: true, maxlength: 120 },
  courseTitle: { type: String, required: true, trim: true, maxlength: 160 },
  level: { type: String, enum: ['L3', 'L4', 'L5', 'Bootcamp', 'Training'], required: true },
  issuedAt: { type: Date, required: true, default: Date.now },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revocationReason: { type: String, default: '', trim: true, maxlength: 1000 },
}, { timestamps: true });

certificateSchema.pre('validate', function validateCertificateTarget(next) {
  if (!this.course && !this.book) return next(new Error('A certificate must reference a course or a learning book.'));
  if (this.book && !this.course) this.kind = 'book';
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
