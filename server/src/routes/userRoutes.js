import { Router } from 'express';
import { z } from 'zod';
import * as users from '../controllers/userController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createUserSchema, updateUserSchema, idParamSchema } from '../utils/validators.js';

const router = Router();
const teacherIdQuery = z.object({ teacherId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional() });
const dashboardQuery = z.object({
  level: z.enum(['all', 'L3', 'L4', 'L5', 'Bootcamp', 'Training']).optional(),
  enrollment: z.enum(['all', 'open']).optional(),
});

router.use(requireAuth);
router.get('/teachers', users.listTeachersToFollow);
router.post('/teachers/:id/follow', validate(idParamSchema, 'params'), users.followTeacher);
router.delete('/teachers/:id/follow', validate(idParamSchema, 'params'), users.unfollowTeacher);
router.get('/followers', validate(teacherIdQuery, 'query'), users.listTeacherFollowers);
router.get('/dashboard-summary', requireAdmin, validate(dashboardQuery, 'query'), users.dashboardSummary);

// Account management is owner-only.
router.use(requireAdmin);
router.get('/', users.listUsers);
router.post('/', validate(createUserSchema), users.createUser);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), users.updateUser);
router.delete('/:id', validate(idParamSchema, 'params'), users.deleteUser);

export default router;

