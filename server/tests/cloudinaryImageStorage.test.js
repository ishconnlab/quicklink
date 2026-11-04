import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningClass } from '../src/models/LearningClass.js';
import { TrainingRegistrationForm } from '../src/models/TrainingRegistrationForm.js';

test('class thumbnails accept Cloudinary metadata and legacy local filenames', () => {
  const classFields = {
    title: 'Image storage test',
    subject: 'Training',
    level: 'L3',
    teacher: '0123456789abcdef01234567',
    createdBy: '0123456789abcdef01234567',
  };
  const cloudinaryClass = new LearningClass({
    ...classFields,
    thumbnailPublicId: 'quicklink/course-thumbnails/test-image',
    thumbnailUrl: 'https://res.cloudinary.com/example/image/upload/test-image.jpg',
  });
  assert.equal(cloudinaryClass.validateSync(), undefined);

  const legacyClass = new LearningClass({ ...classFields, thumbnailFile: '12345678-1234-1234-1234-123456789012.jpg' });
  assert.equal(legacyClass.validateSync(), undefined);
});

test('registration form images accept Cloudinary metadata and legacy local filenames', () => {
  const formFields = {
    learningClass: '0123456789abcdef01234567',
    slug: 'a'.repeat(32),
    title: 'Image storage test',
  };
  const cloudinaryForm = new TrainingRegistrationForm({
    ...formFields,
    imagePublicId: 'quicklink/registration-forms/test-image',
    imageUrl: 'https://res.cloudinary.com/example/image/upload/test-image.jpg',
  });
  assert.equal(cloudinaryForm.validateSync(), undefined);

  const legacyForm = new TrainingRegistrationForm({ ...formFields, imageFile: '12345678-1234-1234-1234-123456789012.jpg' });
  assert.equal(legacyForm.validateSync(), undefined);
});
