import mongoose, { Schema, Document as MongooseDoc } from 'mongoose';

export interface IDocumentSessionDoc extends MongooseDoc {
  sessionId: string;
  userId?: mongoose.Types.ObjectId;
  documentIds: string[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSessionSchema = new Schema<IDocumentSessionDoc>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    documentIds: [{ type: String }],
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const DocumentSessionModel =
  mongoose.models.DocumentSession ||
  mongoose.model<IDocumentSessionDoc>('DocumentSession', DocumentSessionSchema);
