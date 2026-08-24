import { UnifiedDocument, DocumentAnalysis, QuestionAnswer } from '../schemas/document.schema.js';

interface StoredChat {
  id: string;
  sessionId: string;
  documentId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Array<{
    documentId?: string;
    page: number;
    reason?: string;
    snippet?: string;
    confidence: number;
  }>;
  relevantPages: number[];
  operationalMode: 'full' | 'standard' | 'degraded';
  provider: string;
  createdAt: string;
  expiresAt?: Date;
}

class MemoryStoreService {
  private documents: Map<string, UnifiedDocument> = new Map();
  private analyses: Map<string, DocumentAnalysis> = new Map(); // key: documentId:mode
  private multiAnalyses: Map<string, any> = new Map(); // key: sessionId
  private sessions: Map<string, { sessionId: string; documentIds: string[]; expiresAt: Date }> = new Map();
  private chatMessages: Map<string, StoredChat[]> = new Map(); // key: sessionId or documentId

  // Documents
  saveDocument(doc: UnifiedDocument): void {
    this.documents.set(doc.id, { ...doc });
    // Update session
    const session = this.sessions.get(doc.sessionId) || {
      sessionId: doc.sessionId,
      documentIds: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    if (!session.documentIds.includes(doc.id)) {
      session.documentIds.push(doc.id);
    }
    this.sessions.set(doc.sessionId, session);
  }

  getDocument(id: string): UnifiedDocument | undefined {
    return this.documents.get(id);
  }

  updateDocumentStatus(id: string, status: UnifiedDocument['status'], statusMessage?: string, progressPercent?: number): void {
    const doc = this.documents.get(id);
    if (doc) {
      doc.status = status;
      if (statusMessage) doc.statusMessage = statusMessage;
      if (progressPercent !== undefined) doc.progressPercent = progressPercent;
      this.documents.set(id, doc);
    }
  }

  getDocumentsBySession(sessionId: string): UnifiedDocument[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.documentIds
      .map((id) => this.documents.get(id))
      .filter((doc): doc is UnifiedDocument => Boolean(doc));
  }

  deleteDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;
    this.documents.delete(id);
    // Remove from session
    const session = this.sessions.get(doc.sessionId);
    if (session) {
      session.documentIds = session.documentIds.filter((dId) => dId !== id);
    }
    return true;
  }

  // Analyses
  saveAnalysis(analysis: DocumentAnalysis): void {
    const key = `${analysis.documentId}:${analysis.mode}`;
    this.analyses.set(key, { ...analysis });
  }

  getAnalysis(documentId: string, mode: string = 'balanced'): DocumentAnalysis | undefined {
    return this.analyses.get(`${documentId}:${mode}`) || this.analyses.get(`${documentId}:balanced`) || Array.from(this.analyses.values()).find(a => a.documentId === documentId);
  }

  // Multi-Document Analyses
  saveMultiAnalysis(sessionId: string, analysis: any): void {
    this.multiAnalyses.set(sessionId, analysis);
  }

  getMultiAnalysis(sessionId: string): any | undefined {
    return this.multiAnalyses.get(sessionId);
  }

  // Chat
  saveChatMessage(chat: StoredChat): void {
    const key = chat.documentId || chat.sessionId;
    const history = this.chatMessages.get(key) || [];
    history.push(chat);
    // Keep max 50 messages per context
    if (history.length > 50) history.shift();
    this.chatMessages.set(key, history);
  }

  getChatHistory(contextId: string): StoredChat[] {
    return this.chatMessages.get(contextId) || [];
  }

  // Statistics
  getStats(): { totalDocuments: number; totalSessions: number; totalAnalyses: number } {
    return {
      totalDocuments: this.documents.size,
      totalSessions: this.sessions.size,
      totalAnalyses: this.analyses.size,
    };
  }

  // TTL Pruning
  pruneExpired(): number {
    const now = new Date();
    let count = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        for (const docId of session.documentIds) {
          this.documents.delete(docId);
        }
        this.sessions.delete(sessionId);
        this.chatMessages.delete(sessionId);
        this.multiAnalyses.delete(sessionId);
        count++;
      }
    }
    return count;
  }
}

export const memoryStore = new MemoryStoreService();
