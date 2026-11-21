import { isAdmin } from '../security/roles.js';

export function certificateDownloadAccess(certificate, user) {
  if (!certificate || certificate.revokedAt) return 'not-found';
  if (isAdmin(user)) return 'allowed';
  if (!['paid', 'not_required'].includes(certificate.paymentStatus || 'not_required')) return 'not-found';
  if (certificate.student?.toString() !== user?._id?.toString()) return 'forbidden';
  return 'allowed';
}
