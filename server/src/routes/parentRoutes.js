import { Router } from 'express';
import * as parent from '../controllers/parentController.js';
import * as messages from '../controllers/messageController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import {
  sendMessageSchema,
  parentRequirementSchema,
  idParamSchema,
  studentIdParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireAuth);

// Child checklist & preparation tracking.
router.get('/children', parent.getChildren);
router.get(
  '/children/:studentId/checklist',
  validate(studentIdParamSchema, 'params'),
  parent.getChildChecklist
);
router.patch(
  '/checklist/:id',
  validate(idParamSchema, 'params'),
  validate(parentRequirementSchema),
  parent.updateChildRequirement
);

// School communication.
router.get('/conversations', messages.listConversations);
router.get('/conversations/:id/messages', validate(idParamSchema, 'params'), messages.listMessages);
router.post(
  '/conversations/:id/messages',
  validate(idParamSchema, 'params'),
  validate(sendMessageSchema),
  messages.sendMessage
);
router.post('/conversations/:id/read', validate(idParamSchema, 'params'), messages.markRead);

export default router;
