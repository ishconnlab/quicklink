import mongoose from 'mongoose';

const customFieldSchema = new mongoose.Schema({
  key: { type: String, required: true, match: /^custom_[a-z0-9_-]+$/, maxlength: 40 },
  label: { type: String, required: true, trim: true, maxlength: 80 },
  placeholder: { type: String, default: '', trim: true, maxlength: 120 },
  required: { type: Boolean, default: false },
}, { _id: false });

const trainingRegistrationFormSchema = new mongoose.Schema({
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, unique: true, index: true },
  slug: { type: String, required: true, unique: true, index: true, minlength: 32, maxlength: 48 },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', trim: true, maxlength: 4000 },
  placeholders: {
    name: { type: String, default: 'Your full name', trim: true, maxlength: 120 },
    email: { type: String, default: 'you@example.com', trim: true, maxlength: 120 },
    whatsapp: { type: String, default: '+27 00 000 0000', trim: true, maxlength: 120 },
  },
  fields: { type: [customFieldSchema], default: [], validate: (fields) => fields.length <= 10 },
  imageFile: { type: String, default: '', match: /^(|[0-9a-f-]{36}\.(png|jpg|webp))$/ },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export const TrainingRegistrationForm = mongoose.model('TrainingRegistrationForm', trainingRegistrationFormSchema);
export default TrainingRegistrationForm;
