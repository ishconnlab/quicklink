import { Router } from 'express';
import * as notifications from '../controllers/notificationController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { idParamSchema } from '../utils/validators.js';

const router = Router();

router.use(requireAuth);
router.get('/', notifications.listNotifications);
router.post('/read-all', notifications.markAllRead);
router.post('/:id/read', validate(idParamSchema, 'params'), notifications.markRead);

export default router;
