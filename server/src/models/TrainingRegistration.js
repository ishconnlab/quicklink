import mongoose from 'mongoose';

const trainingRegistrationSchema = new mongoose.Schema({
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingRegistrationForm', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  whatsapp: { type: String, required: true, trim: true, maxlength: 40 },
  answers: { type: Map, of: String, default: {} },
}, { timestamps: true });

trainingRegistrationSchema.index({ form: 1, email: 1 }, { unique: true });
export const TrainingRegistration = mongoose.model('TrainingRegistration', trainingRegistrationSchema);
export default TrainingRegistration;
