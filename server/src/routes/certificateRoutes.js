import { Router } from 'express';
import { z } from 'zod';
import * as certificates from '../controllers/certificateController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
router.get('/verify/:code', validate(z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }), 'params'), certificates.verifyCertificate);
router.get('/share/:code', validate(z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }), 'params'), certificates.shareCertificate);
router.use(requireAuth);
router.get('/mine', certificates.listMyCertificates);
router.get('/:id.pdf', validate(z.object({ id: objectId }), 'params'), certificates.downloadCertificate);
router.patch('/:id/name', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ studentName: z.string().trim().min(2).max(120) })), certificates.updateCertificateName);
router.patch('/:id/revoke', requireAdmin, validate(z.object({ id: objectId }), 'params'), validate(z.object({ reason: z.string().trim().min(3).max(1000) })), certificates.revokeCertificate);
export default router;

