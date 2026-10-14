import { Router } from 'express';
import * as students from '../controllers/studentController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { createStudentSchema, updateStudentSchema, idParamSchema } from '../utils/validators.js';

const router = Router();

router.use(requireAuth);
router.get('/stats', students.studentStats);
router.get('/export', students.exportStudents);
router.get('/', students.listStudents);
router.post('/', validate(createStudentSchema), students.createStudent);
router.get('/:id', validate(idParamSchema, 'params'), students.getStudent);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateStudentSchema),
  students.updateStudent
);
router.delete('/:id', validate(idParamSchema, 'params'), students.deleteStudent);

export default router;
