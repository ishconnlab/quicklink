import { Router } from 'express';
import * as onboarding from '../controllers/onboardingController.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();

router.use(requireStaff);
router.get('/', onboarding.getOnboarding);

export default router;
