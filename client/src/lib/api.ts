import {
  UnifiedDocument,
  DocumentAnalysis,
  QuestionAnswer,
  MultiDocumentAnalysis,
  SummaryMode,
  ChatMessage,
  User,
} from '../types';

// Centralized API Base URL resolution
export function getApiBaseUrl(): string {
  const envUrl = (
    (import.meta as any).env?.VITE_API_BASE_URL ||
    (import.meta as any).env?.VITE_API_URL ||
    ''
  ).trim();

  if (envUrl) {
    return envUrl.endsWith('/api')
      ? envUrl
      : envUrl.endsWith('/')
      ? `${envUrl}api`
      : `${envUrl}/api`;
  }

  // In production deployments (e.g. Vercel), route directly to live Render backend
  if (
    typeof window !== 'undefined' &&
    window.location &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1')
  ) {
    return 'https://unthinkable-summarizer.onrender.com/api';
  }

  // Local development default (backend server on port 5000)
  return 'http://localhost:5000/api';
}

export const API_BASE = getApiBaseUrl();

export function getSessionId(): string {
  let sess = localStorage.getItem('unthinkable_session_id');
  if (!sess) {
    sess = `sess_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    localStorage.setItem('unthinkable_session_id', sess);
  }
  return sess;
}

export function getAuthToken(): string | null {
  return localStorage.getItem('unthinkable_auth_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('unthinkable_auth_token', token);
  } else {
    localStorage.removeItem('unthinkable_auth_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const sessionId = getSessionId();

  const headers: Record<string, string> = {
    'x-session-id': sessionId,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set json content-type if body is object and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({
    success: false,
    error: { code: 'NETWORK_ERROR', message: 'Unable to connect to the Unthinkable server.' },
  }));

  if (!res.ok || data.success === false) {
    const errorMsg = data.error?.message || `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data.data;
}

export const api = {
  async uploadFiles(files: File[]): Promise<{ sessionId: string; documents: UnifiedDocument[] }> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    return request<{ sessionId: string; documents: UnifiedDocument[] }>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  async getDocument(id: string): Promise<UnifiedDocument> {
    return request<UnifiedDocument>(`/documents/${id}`);
  },

  async getDocumentAnalysis(id: string, mode: SummaryMode = 'balanced'): Promise<DocumentAnalysis> {
    return request<DocumentAnalysis>(`/documents/${id}/analysis?mode=${mode}`);
  },

  async triggerAnalysis(id: string, mode: SummaryMode): Promise<DocumentAnalysis> {
    return request<DocumentAnalysis>(`/documents/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  },

  async compareDocuments(documentIds: string[], sessionId: string): Promise<MultiDocumentAnalysis> {
    return request<MultiDocumentAnalysis>('/documents/multi/compare', {
      method: 'POST',
      body: JSON.stringify({ documentIds, sessionId }),
    });
  },

  async searchDocument(
    id: string,
    query: string
  ): Promise<{ query: string; documentId: string; totalMatches: number; matches: Array<{ pageNumber: number; matchCount: number; snippets: string[] }> }> {
    return request(`/documents/${id}/search?q=${encodeURIComponent(query)}`);
  },

  async askQuestion(
    id: string,
    question: string,
    multiDocument: boolean = false,
    sessionId?: string
  ): Promise<QuestionAnswer> {
    return request<QuestionAnswer>(`/documents/${id}/questions`, {
      method: 'POST',
      body: JSON.stringify({ question, multiDocument, sessionId: sessionId || getSessionId() }),
    });
  },

  async getChatHistory(id: string): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(`/documents/${id}/chat-history`);
  },

  async register(email: string, password: string, name: string): Promise<{ token: string; user: User }> {
    return request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async getMe(): Promise<{ authenticated: boolean; user: User | null; sessionId: string; dbConnected: boolean }> {
    return request('/auth/me');
  },

  async getHealth(): Promise<{ status: string; aiMode: string; aiModel: string; ocrProvider: string }> {
    return request('/health');
  },
};
