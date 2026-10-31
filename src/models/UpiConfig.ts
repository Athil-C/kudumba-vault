import mongoose, { Schema, Document } from 'mongoose';

export interface IUpiConfig extends Document {
  key: string;
  upiId: string;
  merchantName: string;
  qrImageUrl?: string;
  whatsappNumber: string;
  supportEmail: string;
  instructionsEn: string;
  instructionsMl: string;
  isEnabled: boolean;
  updatedBy?: string;
  updatedAt: Date;
}

const UpiConfigSchema = new Schema<IUpiConfig>(
  {
    key: { type: String, required: true, unique: true, default: 'global_upi' },
    upiId: {
      type: String,
      required: true,
      trim: true,
      default: () => process.env.ADMIN_UPI_ID || 'kudumbavault@oksbi',
    },
    merchantName: {
      type: String,
      required: true,
      trim: true,
      default: () => process.env.ADMIN_UPI_MERCHANT_NAME || 'Kudumba Vault',
    },
    qrImageUrl: { type: String, trim: true },
    whatsappNumber: { type: String, trim: true, default: '+91 90612 64525' },
    supportEmail: { type: String, trim: true, default: 'support@kudumbavault.com' },
    instructionsEn: {
      type: String,
      default:
        'Scan the UPI QR code below, complete the payment with the displayed amount, take a screenshot of the successful payment, and submit your UTR reference number.',
    },
    instructionsMl: {
      type: String,
      default:
        'താഴെ കാണുന്ന UPI QR കോഡ് സ്കാൻ ചെയ്ത് കൃത്യമായ തുക അടക്കുക. പെയ്മെന്റ് വിജയകരമായതിന്റെ സ്ക്രീൻഷോട്ട് എടുത്ത് UTR നമ്പർ നൽകി സബ്മിറ്റ് ചെയ്യുക.',
    },
    isEnabled: { type: Boolean, default: true },
    updatedBy: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

export const UpiConfig =
  (mongoose.models.UpiConfig as mongoose.Model<IUpiConfig>) ||
  mongoose.model<IUpiConfig>('UpiConfig', UpiConfigSchema);

// In-memory mock store for unit testing
let mockUpiConfigStore: any = null;

export function getMockUpiConfig(): any {
  if (!mockUpiConfigStore) {
    mockUpiConfigStore = {
      key: 'global_upi',
      upiId: process.env.ADMIN_UPI_ID || 'kudumbavault@oksbi',
      merchantName: process.env.ADMIN_UPI_MERCHANT_NAME || 'Kudumba Vault',
      whatsappNumber: '+91 90612 64525',
      supportEmail: 'support@kudumbavault.com',
      instructionsEn:
        'Scan the UPI QR code below, complete the payment with the displayed amount, take a screenshot of the successful payment, and submit your UTR reference number.',
      instructionsMl:
        'താഴെ കാണുന്ന UPI QR കോഡ് സ്കാൻ ചെയ്ത് കൃത്യമായ തുക അടക്കുക. പെയ്മെന്റ് വിജയകരമായതിന്റെ സ്ക്രീൻഷോട്ട് എടുത്ത് UTR നമ്പർ നൽകി സബ്മിറ്റ് ചെയ്യുക.',
      isEnabled: true,
    };
  }
  return mockUpiConfigStore;
}

export function setMockUpiConfig(data: any): void {
  mockUpiConfigStore = { ...getMockUpiConfig(), ...data };
}

export function resetMockUpiConfig(): void {
  mockUpiConfigStore = null;
}
