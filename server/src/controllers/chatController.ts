import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { contextRetrievalService } from '../services/retrieval/ContextRetrievalService.js';
import { AIProviderFactory } from '../providers/ai/AIProviderFactory.js';
import { memoryStore } from '../models/MemoryStore.js';
import { ChatMessageModel } from '../models/ChatMessage.js';
import { isDbConnected } from '../config/db.js';

export async function askQuestion(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params; // documentId or 'session'
    const { question, multiDocument, sessionId: bodySessionId } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUESTION', message: 'Please enter a valid question.' },
      });
      return;
    }

    const sessionId = bodySessionId || req.sessionId || 'default-session';
    let targetDocs: any[] = [];

    if (multiDocument || id === 'session') {
      targetDocs = memoryStore.getDocumentsBySession(sessionId);
    } else {
      const doc = memoryStore.getDocument(id);
      if (doc) targetDocs = [doc];
    }

    if (targetDocs.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_DOCUMENTS_FOUND', message: 'No documents available to answer this question.' },
      });
      return;
    }

    // 1. Retrieve top relevant chunks using BM25
    const retrievedChunks = contextRetrievalService.retrieveRelevantChunks(targetDocs, question, 5);

    // 2. Fetch recent conversation history
    const contextKey = id !== 'session' ? id : sessionId;
    const history = memoryStore.getChatHistory(contextKey).slice(-6).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    // 3. Generate grounded answer via AI provider (with automatic deterministic fallback)
    const { result, providerUsed, isFallback } = await AIProviderFactory.executeWithFallback(
      'answer-question',
      async (provider) => {
        return await provider.answerQuestion(question, {
          document: targetDocs[0],
          documents: targetDocs,
          retrievedChunks,
          chatHistory: history,
        });
      }
    );

    result.operationalMode = isFallback ? 'standard' : 'full';
    result.provider = providerUsed;

    // 4. Save to chat history
    const userMsgId = `msg_${uuidv4().replace(/-/g, '').substring(0, 10)}`;
    const assistantMsgId = `msg_${uuidv4().replace(/-/g, '').substring(0, 10)}`;

    memoryStore.saveChatMessage({
      id: userMsgId,
      sessionId,
      documentId: id !== 'session' ? id : undefined,
      role: 'user',
      content: question,
      citations: [],
      relevantPages: [],
      operationalMode: result.operationalMode,
      provider: result.provider,
      createdAt: new Date().toISOString(),
    });

    memoryStore.saveChatMessage({
      id: assistantMsgId,
      sessionId,
      documentId: id !== 'session' ? id : undefined,
      role: 'assistant',
      content: result.answer,
      citations: result.citations,
      relevantPages: result.relevantPages,
      operationalMode: result.operationalMode,
      provider: result.provider,
      createdAt: new Date().toISOString(),
    });

    if (isDbConnected() && req.user) {
      try {
        await ChatMessageModel.create([
          {
            id: userMsgId,
            sessionId,
            documentId: id !== 'session' ? id : undefined,
            userId: req.user.userId,
            role: 'user',
            content: question,
            citations: [],
            relevantPages: [],
            operationalMode: result.operationalMode,
            provider: result.provider,
          },
          {
            id: assistantMsgId,
            sessionId,
            documentId: id !== 'session' ? id : undefined,
            userId: req.user.userId,
            role: 'assistant',
            content: result.answer,
            citations: result.citations,
            relevantPages: result.relevantPages,
            operationalMode: result.operationalMode,
            provider: result.provider,
          },
        ]);
      } catch (err) {
        // silent fallback
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getChatHistory(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const history = memoryStore.getChatHistory(id);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
}
