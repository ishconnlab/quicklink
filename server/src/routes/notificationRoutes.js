import { Router } from 'express';
import * as notifications from '../controllers/notificationController.js';
import { validate } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import { idParamSchema } from '../utils/validators.js';

const router = Router();

router.use(requireStaff);
router.get('/', notifications.listNotifications);
router.post('/read-all', notifications.markAllRead);
router.post('/:id/read', validate(idParamSchema, 'params'), notifications.markRead);

export default router;
