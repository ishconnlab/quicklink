import { Router } from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();

router.get('/', requireStaff, getDashboard);

export default router;
