import { Router } from 'express';
import * as packs from '../controllers/admissionPackController.js';
import { validate } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  createAdmissionPackSchema,
  updateAdmissionPackSchema,
  admissionPackActionSchema,
  idParamSchema,
} from '../utils/validators.js';

const router = Router();

router.use(requireStaff);
router.get('/', packs.listPacks);
router.post('/', validate(createAdmissionPackSchema), packs.createPack);
router.get('/:id', validate(idParamSchema, 'params'), packs.getPack);
router.get('/:id/stats', validate(idParamSchema, 'params'), packs.packStats);
router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateAdmissionPackSchema),
  packs.updatePack
);
router.post(
  '/:id/publish',
  validate(idParamSchema, 'params'),
  validate(admissionPackActionSchema),
  packs.publishPack
);
router.post('/:id/archive', validate(idParamSchema, 'params'), packs.archivePack);
router.post(
  '/:id/new-version',
  validate(idParamSchema, 'params'),
  validate(admissionPackActionSchema),
  packs.newVersion
);
router.delete('/:id', validate(idParamSchema, 'params'), packs.deletePack);

export default router;
