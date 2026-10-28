import { Router } from 'express';
import * as users from '../controllers/userController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { createUserSchema, updateUserSchema, idParamSchema } from '../utils/validators.js';

const router = Router();

// Account management is owner-only.
router.use(requireAuth, requireOwner);
router.get('/', users.listUsers);
router.post('/', validate(createUserSchema), users.createUser);
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), users.updateUser);
router.delete('/:id', validate(idParamSchema, 'params'), users.deleteUser);

export default router;
