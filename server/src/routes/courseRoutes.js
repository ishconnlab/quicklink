import { Router } from 'express';
import { z } from 'zod';
import * as courses from '../controllers/classController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import multer from 'multer';
import * as certificates from '../controllers/certificateController.js';

const router = Router();
const uploadThumbnail = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 } });
const idParams = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) });
const listQuery = z.object({
  level: z.enum(['L3', 'L4', 'L5']).optional(),
  subject: z.string().trim().max(120).optional(),
  trade: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'title', 'level', 'popular']).optional(),
  enrolled: z.enum(['true', 'false']).optional(),
  manage: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});

router.get('/:id/thumbnail', validate(idParams, 'params'), courses.getCourseThumbnail);
router.use(requireAuth);
router.get('/', validate(listQuery, 'query'), courses.listCourses);
router.post('/:id/thumbnail', validate(idParams, 'params'), uploadThumbnail.single('thumbnail'), courses.updateCourseThumbnail);
router.get('/:id/completion', validate(idParams, 'params'), certificates.getCourseCompletion);
router.get('/:id/certificates', validate(idParams, 'params'), certificates.listCourseCertificates);
router.post('/:id/certificate', validate(idParams, 'params'), certificates.issueCertificate);
router.get('/:id', validate(idParams, 'params'), courses.getCourse);
router.post('/:id/enroll', validate(idParams, 'params'), courses.enrollInCourse);

export default router;
