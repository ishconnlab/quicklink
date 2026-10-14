import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema(
  {
    // Holding names are unique per account, so two accounts can each have a
    // holding with the same name without clashing.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160, index: true },
    // Normalized lowercase name used for duplicate detection.
    nameKey: { type: String, required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

holdingSchema.index({ owner: 1, nameKey: 1 }, { unique: true });

export const Holding = mongoose.model('Holding', holdingSchema);
export default Holding;
