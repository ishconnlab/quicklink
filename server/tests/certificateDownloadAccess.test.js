import assert from 'node:assert/strict';
import test from 'node:test';
import { certificateDownloadAccess } from '../src/utils/certificateDownloadAccess.js';

const admin = { _id: 'admin-id', role: 'admin' };
const owner = { _id: 'student-id', role: 'student' };
const otherStudent = { _id: 'other-id', role: 'student' };

test('admins can preview certificates regardless of payment status', () => {
  assert.equal(certificateDownloadAccess({ paymentStatus: 'unpaid' }, admin), 'allowed');
  assert.equal(certificateDownloadAccess({ paymentStatus: 'pending' }, admin), 'allowed');
});

test('students can access only paid certificates belonging to them', () => {
  assert.equal(certificateDownloadAccess({ student: owner._id, paymentStatus: 'not_required' }, owner), 'allowed');
  assert.equal(certificateDownloadAccess({ student: owner._id, paymentStatus: 'paid' }, owner), 'allowed');
  assert.equal(certificateDownloadAccess({ student: owner._id, paymentStatus: 'unpaid' }, owner), 'not-found');
  assert.equal(certificateDownloadAccess({ student: owner._id, paymentStatus: 'paid' }, otherStudent), 'forbidden');
});

test('revoked or missing certificates remain unavailable to admins', () => {
  assert.equal(certificateDownloadAccess(null, admin), 'not-found');
  assert.equal(certificateDownloadAccess({ revokedAt: new Date() }, admin), 'not-found');
});
