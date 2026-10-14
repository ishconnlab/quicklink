import { Router } from 'express';
import * as reports from '../controllers/reportController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/meta', reports.meta);

// Individual-school routes (require a school id).
router.get('/preview/school/:id', reports.previewReport);
router.get('/csv/school/:id', reports.exportCsv);
router.get('/pdf/school/:id', reports.generateReport);

// Collection routes (all / holding / district / range).
router.get('/preview/:type', reports.previewReport);
router.get('/csv/:type', reports.exportCsv);
router.get('/pdf/:type', reports.generateReport);

export default router;
