import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'teacher', 'student'], default: 'student', index: true },
    educationLevel: { type: String, enum: ['L3', 'L4', 'L5'], default: null },
    registrationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(plain, salt);
  this.passwordChangedAt = new Date();
};

userSchema.pre('validate', function migrateLegacyRole(next) {
  if (this.role === 'user') this.role = 'student';
  next();
});

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isOwner = function isOwner() {
  return this.role === 'owner';
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const role = ['owner', 'teacher'].includes(this.role) ? this.role : 'student';
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role,
    isActive: this.isActive,
    isOwner: this.role === 'owner',
    isTeacher: role === 'teacher',
    isStudent: role === 'student',
    educationLevel: this.educationLevel || null,
    registrationStatus: this.registrationStatus || 'approved',
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
