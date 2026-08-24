import { Router } from 'express';
import {
  uploadDocuments,
  getDocument,
  getDocumentFile,
  getDocumentPages,
  searchDocument,
  getSessionDocuments,
} from '../controllers/documentController.js';
import {
  getDocumentAnalysis,
  triggerDocumentAnalysis,
  compareDocuments,
} from '../controllers/analysisController.js';
import { askQuestion, getChatHistory } from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { uploadLimiter, standardLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Document management
router.post('/upload', optionalAuth, uploadLimiter, uploadMiddleware.array('files', 10), uploadDocuments);
router.get('/session', optionalAuth, getSessionDocuments);
router.get('/:id', optionalAuth, getDocument);
router.get('/:id/file', optionalAuth, getDocumentFile);
router.get('/:id/pages', optionalAuth, getDocumentPages);
router.get('/:id/search', optionalAuth, searchDocument);

// Document Analysis
router.get('/:id/analysis', optionalAuth, getDocumentAnalysis);
router.post('/:id/analyze', optionalAuth, standardLimiter, triggerDocumentAnalysis);
router.post('/multi/compare', optionalAuth, standardLimiter, compareDocuments);

// Document Q&A / Chat
router.post('/:id/questions', optionalAuth, standardLimiter, askQuestion);
router.get('/:id/chat-history', optionalAuth, getChatHistory);

export default router;
