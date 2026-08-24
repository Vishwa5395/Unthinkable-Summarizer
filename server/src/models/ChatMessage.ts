import mongoose, { Schema, Document as MongooseDoc } from 'mongoose';

export interface IChatMessageDoc extends MongooseDoc {
  id: string;
  sessionId: string;
  documentId?: string;
  userId?: mongoose.Types.ObjectId;
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
  createdAt: Date;
  expiresAt?: Date;
}

const ChatMessageSchema = new Schema<IChatMessageDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true },
    documentId: { type: String, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    citations: [
      {
        documentId: String,
        page: Number,
        reason: String,
        snippet: String,
        confidence: Number,
      },
    ],
    relevantPages: [Number],
    operationalMode: { type: String, enum: ['full', 'standard', 'degraded'], default: 'standard' },
    provider: { type: String, default: 'deterministic' },
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const ChatMessageModel =
  mongoose.models.ChatMessage || mongoose.model<IChatMessageDoc>('ChatMessage', ChatMessageSchema);
