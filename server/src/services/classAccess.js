import ApiError from '../utils/ApiError.js';
import { Enrollment } from '../models/Enrollment.js';

export async function getEnrollment(learningClassId, studentId) {
  return Enrollment.findOne({ learningClass: learningClassId, student: studentId, status: 'enrolled' });
}

export function paymentState(learningClass, enrollment, now = new Date()) {
  const payment = learningClass?.payment || {};
  const status = enrollment?.paymentStatus || (payment.enabled ? 'unpaid' : 'not_required');
  if (!payment.enabled || ['paid', 'waived'].includes(status)) {
    return { required: false, allowed: true, status, freeDays: payment.freeDays ?? 2 };
  }
  const anchor = learningClass.startsAt
    ? new Date(learningClass.startsAt)
    : enrollment?.enrolledAt
      ? new Date(enrollment.enrolledAt)
      : learningClass.createdAt
        ? new Date(learningClass.createdAt)
        : now;
  const freeDays = Number.isFinite(Number(payment.freeDays)) ? Number(payment.freeDays) : 2;
  const freeUntil = new Date(anchor.getTime() + freeDays * 24 * 60 * 60 * 1000);
  const required = now >= freeUntil;
  return {
    required,
    allowed: !required,
    status,
    freeDays,
    freeUntil,
    amount: payment.amount || 0,
    currency: payment.currency || 'RWF',
    paymentCode: payment.paymentCode || '',
    paymentName: payment.paymentName || '',
    instructions: payment.instructions || '',
  };
}

export async function assertCanAttend(learningClass, user) {
  if (!learningClass || !user) throw ApiError.forbidden('You do not have access to this class.');
  if (user.role === 'admin') return { required: false, allowed: true, status: 'not_required' };
  const enrollment = await getEnrollment(learningClass._id, user._id);
  const userId = String(user._id);
  const listedOnRoster = (learningClass.students || []).some((student) => String(student?._id ?? student) === userId);
  if (!enrollment && !listedOnRoster) throw ApiError.forbidden('You are not enrolled in this class.');
  const state = paymentState(learningClass, enrollment);
  if (!state.allowed) {
    throw ApiError.conflict(
      `Payment is required to attend this training from day ${state.freeDays + 1}. Submit your payment reference and wait for admin verification.`,
      { code: 'PAYMENT_REQUIRED', ...state },
    );
  }
  return state;
}

export default { getEnrollment, paymentState, assertCanAttend };
