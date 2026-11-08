import { Router } from 'express';
import { z } from 'zod';
import * as certificates from '../controllers/certificateController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const certificateIdentifier = z.string().regex(/^(?:[0-9a-fA-F]{24}|[A-Za-z0-9_-]{32})$/);
const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['valid', 'revoked']).optional(),
  courseId: objectId.optional(),
  studentId: objectId.optional(),
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
router.get('/verify/:code', validate(z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }), 'params'), certificates.verifyCertificate);
router.get('/share/:code', validate(z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }), 'params'), certificates.shareCertificate);
router.use(requireAuth);
router.get('/mine', certificates.listMyCertificates);
router.get('/all', requireAdmin, validate(listQuery, 'query'), certificates.listAllCertificates);
router.get('/:id.pdf', validate(z.object({ id: certificateIdentifier }), 'params'), certificates.downloadCertificate);
router.patch('/:id/name', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ studentName: z.string().trim().min(2).max(120) })), certificates.updateCertificateName);
router.patch('/:id/print-details', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ studentName: z.string().trim().min(2).max(120), courseTitle: z.string().trim().min(2).max(160), description: z.string().trim().max(240) })), certificates.updateCertificatePrintDetails);
router.patch('/:id/description', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ description: z.string().trim().max(500) })), certificates.updateCertificateDescription);
router.delete('/:id', requireAdmin, validate(z.object({ id: objectId }), 'params'), certificates.deleteCertificate);
router.patch('/:id/revoke', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ reason: z.string().trim().min(3).max(1000) })), certificates.revokeCertificate);
router.post('/:id/reissue', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ reason: z.string().trim().max(1000).optional().default('') })), certificates.reissueCertificate);
export default router;
