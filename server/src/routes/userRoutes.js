import { Router } from 'express';
import * as users from '../controllers/userController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { createUserSchema } from '../utils/validators.js';

const router = Router();

// All user-management routes require authentication (no public registration).
router.use(requireAuth);
router.get('/', users.listUsers);
router.post('/', validate(createUserSchema), users.createUser);
router.patch('/:id', users.updateUser);

export default router;
