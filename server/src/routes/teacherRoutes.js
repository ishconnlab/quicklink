import { Router } from 'express';
import { z } from 'zod';
import * as teacher from '../controllers/teacherController.js';
import { requireAuth, requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const dashboardQuery = z.object({
  teacherId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

router.use(requireAuth, requireTeacher);
router.get('/dashboard', validate(dashboardQuery, 'query'), teacher.teacherDashboard);

export default router;
