import { Router } from 'express';
import { z } from 'zod';
import * as users from '../controllers/userController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createUserSchema, updateUserSchema, idParamSchema } from '../utils/validators.js';

const router = Router();
const listQuery = z.object({
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
  role: z.enum(['admin', 'student']).optional(),
  search: z.string().trim().max(120).optional(),
});

router.use(requireAuth, requireAdmin);
router.get('/', validate(listQuery, 'query'), users.listUsers);
router.post('/', validate(createUserSchema), users.createUser);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), users.updateUser);
router.delete('/:id', validate(idParamSchema, 'params'), users.deleteUser);

export default router;
