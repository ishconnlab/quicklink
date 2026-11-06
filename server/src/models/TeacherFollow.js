import mongoose from 'mongoose';

const teacherFollowSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

teacherFollowSchema.index({ teacher: 1, follower: 1 }, { unique: true });

export const TeacherFollow = mongoose.model('TeacherFollow', teacherFollowSchema);
export default TeacherFollow;
