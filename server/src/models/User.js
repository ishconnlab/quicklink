import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, normalizeRole } from '../security/roles.js';

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
    role: { type: String, enum: ['admin', 'student'], default: ROLES.STUDENT, index: true },
    whatsapp: { type: String, default: '', trim: true, maxlength: 40 },
    country: { type: String, default: '', trim: true, maxlength: 120 },
    province: { type: String, default: '', trim: true, maxlength: 120 },
    educationLevel: { type: String, enum: ['L3', 'L4', 'L5', 'Bootcamp', 'Training'], default: null },
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
  const normalized = normalizeRole(this.role);
  if (this.role !== normalized) {
    this.role = normalized;
    if (normalized !== 'admin') this.educationLevel = this.educationLevel || null;
  }
  if (!this.registrationStatus) this.registrationStatus = 'approved';
  next();
});

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isOwner = function isOwner() {
  return this.role === ROLES.ADMIN || this.role === 'owner';
};

userSchema.methods.isAdmin = function isAdmin() {
  return this.isOwner();
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const role = normalizeRole(this.role);
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role,
    whatsapp: this.whatsapp || '',
    country: this.country || '',
    province: this.province || '',
    isActive: this.isActive,
    isAdmin: role === ROLES.ADMIN,
    isOwner: role === ROLES.ADMIN,
    isTeacher: false,
    isStudent: role === ROLES.STUDENT,
    educationLevel: this.educationLevel || null,
    registrationStatus: this.registrationStatus || 'approved',
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
