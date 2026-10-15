import { Router } from 'express';
import * as checklist from '../controllers/admissionChecklistController.js';
import { validate } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  updateRequirementSchema,
  idParamSchema,
  studentIdParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireStaff);
router.get('/pending', checklist.pendingVerifications);
router.get(
  '/student/:studentId',
  validate(studentIdParamSchema, 'params'),
  checklist.getStudentChecklist
);
router.post(
  '/student/:studentId/regenerate',
  validate(studentIdParamSchema, 'params'),
  checklist.regenerateChecklist
);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateRequirementSchema),
  checklist.updateRequirement
);

export default router;
