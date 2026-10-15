import { Router } from 'express';
import * as messages from '../controllers/messageController.js';
import { validate } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  ensureConversationSchema,
  sendMessageSchema,
  idParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireStaff);
router.get('/', messages.listConversations);
router.post('/ensure', validate(ensureConversationSchema), messages.ensureConversation);
router.get('/:id', validate(idParamSchema, 'params'), messages.getConversation);
router.get('/:id/messages', validate(idParamSchema, 'params'), messages.listMessages);
router.post(
  '/:id/messages',
  validate(idParamSchema, 'params'),
  validate(sendMessageSchema),
  messages.sendMessage
);
router.post('/:id/read', validate(idParamSchema, 'params'), messages.markRead);

export default router;
