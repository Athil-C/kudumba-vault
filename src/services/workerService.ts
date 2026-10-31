import mongoose, { Types } from 'mongoose';
import { WorkerRecordModel, IWorkerRecord, IWorkerHistoryEntry } from '../models/WorkerRecord';
import { isDbReady } from './documentService';

export interface CreateWorkerInput {
  nameEn: string;
  nameMl: string;
  areaEn: string;
  areaMl: string;
  tradeEn?: string;
  tradeMl?: string;
  tradeId?: string;
  iconName?: string;
  countryCode?: string;
  phone: string;
  altPhone?: string;
  whatsapp: string;
  rateAmount?: number;
  rateUnit?: string;
  lastVisit?: string;
  lastServiceDate?: string;
  notesEn?: string;
  notesMl?: string;
  rating?: number;
  favourite?: boolean;
  history?: IWorkerHistoryEntry[];
}

export interface UpdateWorkerInput {
  nameEn?: string;
  nameMl?: string;
  areaEn?: string;
  areaMl?: string;
  tradeEn?: string;
  tradeMl?: string;
  tradeId?: string;
  iconName?: string;
  countryCode?: string;
  phone?: string;
  altPhone?: string;
  whatsapp?: string;
  rateAmount?: number;
  rateUnit?: string;
  lastVisit?: string;
  lastServiceDate?: string;
  notesEn?: string;
  notesMl?: string;
  rating?: number;
  favourite?: boolean;
  history?: IWorkerHistoryEntry[];
}

// In-memory mock store for testing and offline development
const mockWorkerStore = new Map<string, any>();

export function _resetMockWorkers(): void {
  mockWorkerStore.clear();
}

export async function listWorkers(ownerId: string): Promise<any[]> {
  if (isDbReady()) {
    if (!Types.ObjectId.isValid(ownerId)) {
      return [];
    }
    const queryOwnerId = new Types.ObjectId(ownerId);

    const workers = await WorkerRecordModel.find({
      ownerId: queryOwnerId,
      deletedAt: null,
    }).sort({ updatedAt: -1 });

    return workers.map((w) => w.toJSON());
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    return Array.from(mockWorkerStore.values()).filter(
      (w) => String(w.ownerId) === String(ownerId) && !w.deletedAt
    );
  }

  throw new Error('Database is unavailable. Cannot list workers.');
}

export async function createWorker(
  ownerId: string,
  input: CreateWorkerInput
): Promise<any> {
  const nameEn = (input.nameEn || '').trim();
  const nameMl = (input.nameMl || nameEn).trim();
  if (!nameEn) {
    throw new Error('Worker name is required.');
  }

  const phone = (input.phone || '').trim();
  if (!phone) {
    throw new Error('Worker phone number is required.');
  }

  if (isDbReady()) {
    if (!Types.ObjectId.isValid(ownerId)) {
      throw new Error('Invalid owner ID format.');
    }
    const queryOwnerId = new Types.ObjectId(ownerId);

    const worker = new WorkerRecordModel({
      ownerId: queryOwnerId,
      nameEn,
      nameMl,
      areaEn: (input.areaEn || 'Kochi').trim(),
      areaMl: (input.areaMl || input.areaEn || 'കൊച്ചി').trim(),
      tradeEn: input.tradeEn?.trim(),
      tradeMl: input.tradeMl?.trim(),
      tradeId: input.tradeId?.trim(),
      iconName: input.iconName?.trim() || 'Wrench',
      countryCode: input.countryCode?.trim() || '+91',
      phone,
      altPhone: input.altPhone?.trim(),
      whatsapp: (input.whatsapp || phone).trim(),
      rateAmount: input.rateAmount || 0,
      rateUnit: input.rateUnit || 'per visit',
      lastVisit: input.lastVisit || new Date().toISOString().slice(0, 10),
      lastServiceDate: input.lastServiceDate,
      notesEn: input.notesEn?.trim() || '',
      notesMl: input.notesMl?.trim() || '',
      rating: input.rating ?? 5.0,
      favourite: !!input.favourite,
      history: input.history || [],
    });

    await worker.save();
    return worker.toJSON();
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const mockId = `mock-worker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const mockWorker = {
      _id: mockId,
      id: mockId,
      ownerId,
      nameEn,
      nameMl,
      areaEn: (input.areaEn || 'Kochi').trim(),
      areaMl: (input.areaMl || input.areaEn || 'കൊച്ചി').trim(),
      tradeEn: input.tradeEn?.trim(),
      tradeMl: input.tradeMl?.trim(),
      tradeId: input.tradeId?.trim(),
      iconName: input.iconName?.trim() || 'Wrench',
      countryCode: input.countryCode?.trim() || '+91',
      phone,
      altPhone: input.altPhone?.trim(),
      whatsapp: (input.whatsapp || phone).trim(),
      rateAmount: input.rateAmount || 0,
      rateUnit: input.rateUnit || 'per visit',
      lastVisit: input.lastVisit || new Date().toISOString().slice(0, 10),
      lastServiceDate: input.lastServiceDate,
      notesEn: input.notesEn?.trim() || '',
      notesMl: input.notesMl?.trim() || '',
      rating: input.rating ?? 5.0,
      favourite: !!input.favourite,
      history: input.history || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockWorkerStore.set(mockId, mockWorker);
    return mockWorker;
  }

  throw new Error('Database is unavailable. Cannot save worker.');
}

export async function updateWorker(
  ownerId: string,
  workerId: string,
  input: UpdateWorkerInput
): Promise<any> {
  if (isDbReady()) {
    if (!Types.ObjectId.isValid(workerId)) {
      const err = new Error('Invalid worker ID format.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (!Types.ObjectId.isValid(ownerId)) {
      const err = new Error('Invalid owner ID format.');
      (err as any).statusCode = 400;
      throw err;
    }
    const queryOwnerId = new Types.ObjectId(ownerId);

    // IDOR Protection: Check if worker exists anywhere
    const existsAnywhere = await WorkerRecordModel.findById(workerId);
    if (!existsAnywhere || existsAnywhere.deletedAt) {
      const err = new Error('Worker record not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (String(existsAnywhere.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to modify this worker.');
      (err as any).statusCode = 403;
      throw err;
    }

    const worker = await WorkerRecordModel.findOne({
      _id: new Types.ObjectId(workerId),
      ownerId: queryOwnerId,
      deletedAt: null,
    });

    if (!worker) {
      const err = new Error('Worker record not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (input.nameEn !== undefined) worker.nameEn = input.nameEn.trim();
    if (input.nameMl !== undefined) worker.nameMl = input.nameMl.trim();
    if (input.areaEn !== undefined) worker.areaEn = input.areaEn.trim();
    if (input.areaMl !== undefined) worker.areaMl = input.areaMl.trim();
    if (input.tradeEn !== undefined) worker.tradeEn = input.tradeEn.trim();
    if (input.tradeMl !== undefined) worker.tradeMl = input.tradeMl.trim();
    if (input.tradeId !== undefined) worker.tradeId = input.tradeId.trim();
    if (input.iconName !== undefined) worker.iconName = input.iconName.trim();
    if (input.countryCode !== undefined) worker.countryCode = input.countryCode.trim();
    if (input.phone !== undefined) worker.phone = input.phone.trim();
    if (input.altPhone !== undefined) worker.altPhone = input.altPhone.trim();
    if (input.whatsapp !== undefined) worker.whatsapp = input.whatsapp.trim();
    if (input.rateAmount !== undefined) worker.rateAmount = input.rateAmount;
    if (input.rateUnit !== undefined) worker.rateUnit = input.rateUnit;
    if (input.lastVisit !== undefined) worker.lastVisit = input.lastVisit;
    if (input.lastServiceDate !== undefined) worker.lastServiceDate = input.lastServiceDate;
    if (input.notesEn !== undefined) worker.notesEn = input.notesEn.trim();
    if (input.notesMl !== undefined) worker.notesMl = input.notesMl.trim();
    if (input.rating !== undefined) worker.rating = input.rating;
    if (input.favourite !== undefined) worker.favourite = input.favourite;
    if (input.history !== undefined) worker.history = input.history;

    await worker.save();
    return worker.toJSON();
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const existing = mockWorkerStore.get(workerId);
    if (!existing || existing.deletedAt) {
      const err = new Error('Worker record not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (String(existing.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to modify this worker.');
      (err as any).statusCode = 403;
      throw err;
    }

    if (input.nameEn !== undefined) existing.nameEn = input.nameEn.trim();
    if (input.nameMl !== undefined) existing.nameMl = input.nameMl.trim();
    if (input.phone !== undefined) existing.phone = input.phone.trim();
    existing.updatedAt = new Date().toISOString();
    mockWorkerStore.set(workerId, existing);
    return existing;
  }

  throw new Error('Database is unavailable. Cannot update worker.');
}

export async function deleteWorker(
  ownerId: string,
  workerId: string
): Promise<{ success: boolean }> {
  if (isDbReady()) {
    if (!Types.ObjectId.isValid(workerId)) {
      const err = new Error('Invalid worker ID format.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (!Types.ObjectId.isValid(ownerId)) {
      const err = new Error('Invalid owner ID format.');
      (err as any).statusCode = 400;
      throw err;
    }

    const existsAnywhere = await WorkerRecordModel.findById(workerId);
    if (!existsAnywhere || existsAnywhere.deletedAt) {
      const err = new Error('Worker record not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (String(existsAnywhere.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to delete this worker.');
      (err as any).statusCode = 403;
      throw err;
    }

    await WorkerRecordModel.findByIdAndUpdate(workerId, { $set: { deletedAt: new Date() } });
    return { success: true };
  }

  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_DB === 'true') {
    const existing = mockWorkerStore.get(workerId);
    if (!existing || existing.deletedAt) {
      const err = new Error('Worker record not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (String(existing.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to delete this worker.');
      (err as any).statusCode = 403;
      throw err;
    }
    existing.deletedAt = new Date().toISOString();
    mockWorkerStore.set(workerId, existing);
    return { success: true };
  }

  throw new Error('Database is unavailable. Cannot delete worker.');
}
