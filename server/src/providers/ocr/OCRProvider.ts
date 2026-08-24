export interface OCRWord {
  text: string;
  confidence: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface OCRResult {
  text: string;
  confidence: number; // 0.0 - 1.0
  isHandwritten: boolean;
  words: OCRWord[];
  warning?: string;
  durationMs: number;
}

export interface IOCRProvider {
  name: string;
  recognizeText(imageBuffer: Buffer, options?: { isHandwritingHint?: boolean }): Promise<OCRResult>;
  preprocessImage(imageBuffer: Buffer, options?: { enhanceHandwriting?: boolean }): Promise<Buffer>;
}
