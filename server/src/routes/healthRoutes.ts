import { Router } from 'express';
import { getHealth, getCronStatus, triggerCronTask } from '../controllers/healthController.js';

const router = Router();

router.get('/', getHealth);
router.get('/cron', getCronStatus);
router.post('/cron/run', triggerCronTask);

export default router;
