import { Router } from 'express';
import documentRoutes from './documentRoutes.js';
import authRoutes from './authRoutes.js';
import healthRoutes from './healthRoutes.js';

const apiRouter = Router();

apiRouter.use('/documents', documentRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/health', healthRoutes);

export default apiRouter;
