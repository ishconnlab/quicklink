import { Router } from 'express';
import { z } from 'zod';
import * as publicSeo from '../controllers/publicSeoController.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.get('/programmes', validate(z.object({ page: z.string().regex(/^\d{1,5}$/).optional(), limit: z.string().regex(/^\d{1,2}$/).optional(), search: z.string().trim().max(120).optional() }), 'query'), publicSeo.listPublicProgrammes);
router.get('/programmes/:slug', validate(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,240}$/i) }), 'params'), publicSeo.getPublicProgramme);
router.get('/sitemap.xml', publicSeo.sitemap);

export default router;
