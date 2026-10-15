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
    // Owners manage approvals; regular users only manage their own data;
    // parents can only access the students linked to them via GuardianLink.
    role: { type: String, enum: ['owner', 'user', 'parent'], default: 'user', index: true },
    // Accounts created via public registration start as 'pending' until an
    // owner approves them. 'rejected' accounts are kept for the audit trail.
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
      index: true,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(plain, salt);
  this.passwordChangedAt = new Date();
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isOwner = function isOwner() {
  return this.role === 'owner';
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    approvalStatus: this.approvalStatus,
    isActive: this.isActive,
    isOwner: this.role === 'owner',
    isParent: this.role === 'parent',
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
