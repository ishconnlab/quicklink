import { Router } from 'express';
import * as applications from '../controllers/admissionApplicationController.js';
import { validate } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  createApplicationSchema,
  updateApplicationSchema,
  reviewApplicationSchema,
  acceptApplicationSchema,
  enrollApplicationSchema,
  addApplicationNoteSchema,
  verifyDocumentSchema,
  idParamSchema,
  documentParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireStaff);
router.get('/', applications.listApplications);
router.get('/stats', applications.applicationStats);
router.get('/export', applications.exportApplications);
router.post('/', validate(createApplicationSchema), applications.createApplication);
router.get('/:id', validate(idParamSchema, 'params'), applications.getApplication);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateApplicationSchema),
  applications.updateApplication
);
router.post('/:id/submit', validate(idParamSchema, 'params'), applications.submitApplication);
router.post(
  '/:id/review',
  validate(idParamSchema, 'params'),
  validate(reviewApplicationSchema),
  applications.reviewApplication
);
router.post(
  '/:id/accept',
  validate(idParamSchema, 'params'),
  validate(acceptApplicationSchema),
  applications.acceptApplication
);
router.post(
  '/:id/enroll',
  validate(idParamSchema, 'params'),
  validate(enrollApplicationSchema),
  applications.enrollApplication
);
router.post(
  '/:id/notes',
  validate(idParamSchema, 'params'),
  validate(addApplicationNoteSchema),
  applications.addApplicationNote
);
router.post(
  '/:id/documents/:docId/verify',
  validate(documentParamSchema, 'params'),
  validate(verifyDocumentSchema),
  applications.verifyDocument
);

export default router;
