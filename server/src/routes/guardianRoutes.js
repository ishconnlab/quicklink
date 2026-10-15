import { Router } from 'express';
import * as guardians from '../controllers/guardianController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import {
  inviteGuardianSchema,
  acceptInvitationSchema,
  idParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireAuth);

// Staff-only: issuing and managing invitations and links.
router.post('/invitations', requireStaff, validate(inviteGuardianSchema), guardians.inviteGuardian);
router.get('/invitations', requireStaff, guardians.listInvitations);
router.post(
  '/invitations/:id/revoke',
  requireStaff,
  validate(idParamSchema, 'params'),
  guardians.revokeInvitation
);
router.get('/links', requireStaff, guardians.listLinks);
router.post(
  '/links/:id/approve',
  requireStaff,
  validate(idParamSchema, 'params'),
  guardians.approveLink
);
router.post(
  '/links/:id/revoke',
  requireStaff,
  validate(idParamSchema, 'params'),
  guardians.revokeLink
);

// Any authenticated user: accept an invitation, and see own approved links.
router.post('/invitations/accept', validate(acceptInvitationSchema), guardians.acceptInvitation);
router.get('/links/me', guardians.myChildren);

export default router;
