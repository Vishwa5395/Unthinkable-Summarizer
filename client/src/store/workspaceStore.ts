import { create } from 'zustand';
import { UnifiedDocument, SummaryMode, User, DocumentAnalysis, MultiDocumentAnalysis, BoundingBox } from '../types';
import { getAuthToken, setAuthToken } from '../lib/api';

interface WorkspaceState {
  documents: UnifiedDocument[];
  activeDocumentId: string | null;
  summaryMode: SummaryMode;
  activeTab: string; // 'doc_${id}' or 'combined'
  activeCitation: {
    documentId?: string;
    page: number;
    blockId?: string;
    boundingBox?: BoundingBox;
    timestamp: number;
  } | null;
  viewerZoom: number; // percentage, e.g. 100
  isUploading: boolean;
  uploadProgress: number;
  isAnalyzing: boolean;
  isAuthModalOpen: boolean;
  isHistoryDrawerOpen: boolean;
  user: User | null;
  token: string | null;
  mobileViewMode: 'document' | 'analysis';
  cachedAnalyses: Record<string, DocumentAnalysis>; // key: `${docId}:${mode}`
  cachedMultiAnalysis: MultiDocumentAnalysis | null;

  // Actions
  setDocuments: (docs: UnifiedDocument[]) => void;
  addDocuments: (docs: UnifiedDocument[]) => void;
  updateDocument: (id: string, updates: Partial<UnifiedDocument>) => void;
  setActiveDocumentId: (id: string | null) => void;
  setSummaryMode: (mode: SummaryMode) => void;
  setActiveTab: (tab: string) => void;
  triggerCitationJump: (
    page: number,
    documentId?: string,
    blockId?: string,
    boundingBox?: BoundingBox
  ) => void;
  setViewerZoom: (zoom: number | ((prev: number) => number)) => void;
  setIsUploading: (isUploading: boolean, progress?: number) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  setHistoryDrawerOpen: (open: boolean) => void;
  setUser: (user: User | null, token?: string | null) => void;
  setMobileViewMode: (mode: 'document' | 'analysis') => void;
  cacheAnalysis: (analysis: DocumentAnalysis) => void;
  cacheMultiAnalysis: (analysis: MultiDocumentAnalysis | null) => void;
  resetSession: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  documents: [],
  activeDocumentId: null,
  summaryMode: 'balanced',
  activeTab: '',
  activeCitation: null,
  viewerZoom: 100,
  isUploading: false,
  uploadProgress: 0,
  isAnalyzing: false,
  isAuthModalOpen: false,
  isHistoryDrawerOpen: false,
  user: null,
  token: getAuthToken(),
  mobileViewMode: 'analysis',
  cachedAnalyses: {},
  cachedMultiAnalysis: null,

  setDocuments: (docs) =>
    set((state) => ({
      documents: docs,
      activeDocumentId: docs.length > 0 ? (state.activeDocumentId && docs.some(d => d.id === state.activeDocumentId) ? state.activeDocumentId : docs[0].id) : null,
      activeTab: docs.length > 0 ? (state.activeTab || `doc_${docs[0].id}`) : '',
    })),

  addDocuments: (newDocs) =>
    set((state) => {
      const merged = [...state.documents];
      for (const doc of newDocs) {
        const idx = merged.findIndex((d) => d.id === doc.id);
        if (idx >= 0) {
          merged[idx] = doc;
        } else {
          merged.push(doc);
        }
      }
      const activeId = state.activeDocumentId || (newDocs[0] ? newDocs[0].id : null);
      return {
        documents: merged,
        activeDocumentId: activeId,
        activeTab: state.activeTab || (activeId ? `doc_${activeId}` : ''),
      };
    }),

  updateDocument: (id, updates) =>
    set((state) => ({
      documents: state.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),

  setActiveDocumentId: (id) =>
    set({
      activeDocumentId: id,
      activeTab: id ? `doc_${id}` : 'combined',
    }),

  setSummaryMode: (mode) => set({ summaryMode: mode }),

  setActiveTab: (tab) =>
    set((state) => {
      if (tab === 'combined') {
        return { activeTab: 'combined' };
      }
      const docId = tab.replace(/^doc_/, '');
      return {
        activeTab: tab,
        activeDocumentId: docId || state.activeDocumentId,
      };
    }),

  triggerCitationJump: (page, documentId, blockId, boundingBox) =>
    set((state) => ({
      activeCitation: {
        page,
        documentId: documentId || state.activeDocumentId || undefined,
        blockId,
        boundingBox,
        timestamp: Date.now(),
      },
      // If target is in another document, switch active document
      activeDocumentId: documentId || state.activeDocumentId,
      activeTab: documentId ? `doc_${documentId}` : state.activeTab,
      mobileViewMode: 'document', // on mobile switch to viewer
    })),

  setViewerZoom: (zoomOrFn) =>
    set((state) => ({
      viewerZoom: typeof zoomOrFn === 'function' ? zoomOrFn(state.viewerZoom) : zoomOrFn,
    })),

  setIsUploading: (isUploading, progress = 0) =>
    set({ isUploading, uploadProgress: progress }),

  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),

  setHistoryDrawerOpen: (open) => set({ isHistoryDrawerOpen: open }),

  setUser: (user, token = null) => {
    if (token !== undefined) {
      setAuthToken(token);
    }
    set({ user, token: token || null });
  },

  setMobileViewMode: (mode) => set({ mobileViewMode: mode }),

  cacheAnalysis: (analysis) =>
    set((state) => ({
      cachedAnalyses: {
        ...state.cachedAnalyses,
        [`${analysis.documentId}:${analysis.mode}`]: analysis,
      },
    })),

  cacheMultiAnalysis: (analysis) => set({ cachedMultiAnalysis: analysis }),

  resetSession: () =>
    set({
      documents: [],
      activeDocumentId: null,
      activeTab: '',
      activeCitation: null,
      cachedAnalyses: {},
      cachedMultiAnalysis: null,
      isAnalyzing: false,
    }),
}));
