import { Router } from 'express';
import * as schools from '../controllers/schoolController.js';
import { validate } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  createSchoolSchema,
  updateSchoolSchema,
  idParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireStaff);

router.get('/', schools.listSchools);
router.get('/check-duplicate', schools.checkDuplicate);
router.post('/', validate(createSchoolSchema), schools.createSchool);
router.get('/:id', validate(idParamSchema, 'params'), schools.getSchool);
router.get('/:id/history', validate(idParamSchema, 'params'), schools.getSchoolHistory);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateSchoolSchema),
  schools.updateSchool
);
router.post('/:id/archive', validate(idParamSchema, 'params'), schools.archiveSchool);
router.post('/:id/restore', validate(idParamSchema, 'params'), schools.restoreSchool);

export default router;
