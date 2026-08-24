import mongoose, { Schema, Document as MongooseDoc } from 'mongoose';

export interface IUser extends MongooseDoc {
  email: string;
  passwordHash: string;
  name: string;
  preferences?: {
    defaultSummaryMode?: 'brief' | 'balanced' | 'detailed';
    autoOcrHandwriting?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    preferences: {
      defaultSummaryMode: { type: String, enum: ['brief', 'balanced', 'detailed'], default: 'balanced' },
      autoOcrHandwriting: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
