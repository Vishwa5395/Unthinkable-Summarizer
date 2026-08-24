import { Router } from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { optionalAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', optionalAuth, getMe);

export default router;
