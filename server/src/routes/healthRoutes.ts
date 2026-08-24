import { Router } from 'express';
import { getHealth, getCronStatus, triggerCronTask } from '../controllers/healthController.js';

const router = Router();

router.get('/', getHealth);
router.get('/cron', getCronStatus);
router.get('/cron/run', triggerCronTask);
router.post('/cron/run', triggerCronTask);

export default router;
