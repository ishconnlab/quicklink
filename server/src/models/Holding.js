import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160, index: true },
    // Normalized lowercase name used for duplicate detection.
    nameKey: { type: String, required: true, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const Holding = mongoose.model('Holding', holdingSchema);
export default Holding;
