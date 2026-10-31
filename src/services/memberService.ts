import mongoose, { Types } from 'mongoose';
import { HouseholdMemberModel, IHouseholdMember, HouseholdMemberStatus } from '../models/HouseholdMember';
import { isDbReady } from './documentService';
import { evaluateUserEntitlement } from './subscriptionService';

export class SeatLimitExceededError extends Error {
  currentSeats: number;
  maxSeats: number;
  planName: string;
  constructor(maxSeats: number, currentSeats: number, planName: string) {
    super(
      `Household seat limit reached (${currentSeats} of ${maxSeats} seats used). Upgrade your plan to add more family members.`
    );
    this.name = 'SeatLimitExceededError';
    this.maxSeats = maxSeats;
    this.currentSeats = currentSeats;
    this.planName = planName;
  }
}

export class DuplicateMemberError extends Error {
  field: 'name' | 'phone' | 'email';
  duplicateValue: string;
  constructor(field: 'name' | 'phone' | 'email', duplicateValue: string) {
    super(
      field === 'name'
        ? `A family member named "${duplicateValue}" already exists in your household.`
        : field === 'phone'
        ? `A family member with phone number "${duplicateValue}" already exists in your household.`
        : `A family member with email "${duplicateValue}" already exists in your household.`
    );
    this.name = 'DuplicateMemberError';
    this.field = field;
    this.duplicateValue = duplicateValue;
  }
}

export class UnauthorizedMemberActionError extends Error {
  constructor(message = 'Only the household owner or an admin can manage family members.') {
    super(message);
    this.name = 'UnauthorizedMemberActionError';
  }
}

import {
  RELATION_OPTIONS_EN,
  RELATION_MAP_ML,
  RESIDENCY_STATUS_OPTIONS,
  validateWhatsAppNumber,
  validateHomePhone,
  validateEmailFormat,
} from '../utils/memberValidation';

export {
  RELATION_OPTIONS_EN,
  RELATION_MAP_ML,
  RESIDENCY_STATUS_OPTIONS,
  validateWhatsAppNumber,
  validateHomePhone,
  validateEmailFormat,
};

export interface MemberActionContext {
  requesterId: string;
  requesterRole?: string;
}

export interface CreateMemberInput {
  nameEn: string;
  nameMl?: string;
  relationEn?: string;
  relationMl?: string;
  location?: string;
  locEn?: string;
  locMl?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  homePhone?: string;
  residencyStatus?: string;
  householdName?: string;
  role?: 'OWNER' | 'EDITOR';
  status?: HouseholdMemberStatus;
  initials?: string;
  colorHex?: string;
  avatarBg?: string;
  avatarDataUrl?: string;
}

export interface UpdateMemberInput {
  nameEn?: string;
  nameMl?: string;
  relationEn?: string;
  relationMl?: string;
  location?: string;
  locEn?: string;
  locMl?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  homePhone?: string;
  residencyStatus?: string;
  householdName?: string;
  role?: 'OWNER' | 'EDITOR';
  status?: HouseholdMemberStatus;
  initials?: string;
  colorHex?: string;
  avatarBg?: string;
  avatarDataUrl?: string;
  vaultId?: string;
  seatNumber?: number;
}

export interface UpdateOverviewInput {
  memberId?: string;
  householdName?: string;
  relationEn?: string;
  relationMl?: string;
  residencyStatus?: string;
  vaultId?: string;
}

export interface UpdatePersonalDetailsInput {
  memberId?: string;
  location?: string;
  locEn?: string;
  locMl?: string;
  email?: string;
  whatsapp?: string;
  homePhone?: string;
}

// In-memory mock store for testing and offline development
const mockMemberStore = new Map<string, any>();

export function _resetMockMembers(): void {
  mockMemberStore.clear();
}

export function getMockMember(memberId: string): any {
  return mockMemberStore.get(memberId);
}

function isMockDb(): boolean {
  return !isDbReady() && (process.env.ALLOW_MOCK_DB === 'true' || process.env.NODE_ENV === 'test');
}

/**
 * Normalizes a phone number by stripping formatting while preserving leading +,
 * and defaulting 10-digit Indian numbers to +91.
 */
export function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return undefined;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Normalizes email address to lowercase and trimmed.
 */
export function normalizeEmail(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || undefined;
}

/**
 * In-memory serialization lock per household to prevent race conditions during seat check-and-insert.
 */
const householdLocks = new Map<string, Promise<any>>();

export async function withHouseholdLock<T>(householdId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = householdLocks.get(householdId) || Promise.resolve();
  let release: () => void = () => {};
  const nextLock = new Promise<void>((res) => {
    release = res;
  });
  householdLocks.set(
    householdId,
    currentLock.then(() => nextLock)
  );

  try {
    await currentLock;
    return await fn();
  } finally {
    release();
    if (householdLocks.get(householdId) === nextLock) {
      householdLocks.delete(householdId);
    }
  }
}

/**
 * Counts all billable occupied seats in a household:
 * - Active household members
 * - Pending member invitations (which reserve a seat)
 * - Excludes removed/deleted members
 */
export async function countHouseholdSeats(ownerId: string): Promise<number> {
  if (isMockDb()) {
    return Array.from(mockMemberStore.values()).filter(
      (m) =>
        String(m.ownerId) === String(ownerId) &&
        !m.deletedAt &&
        (m.status === 'ACTIVE' || m.status === 'INVITED')
    ).length;
  }
  if (!Types.ObjectId.isValid(ownerId)) {
    return 0;
  }
  const queryOwnerId = new Types.ObjectId(ownerId);
  return HouseholdMemberModel.countDocuments({
    ownerId: queryOwnerId,
    deletedAt: null,
    status: { $in: ['ACTIVE', 'INVITED'] },
  });
}

/**
 * Lists all active and invited household members for a given owner.
 */
export async function listMembers(ownerId: string): Promise<any[]> {
  if (isMockDb()) {
    return Array.from(mockMemberStore.values()).filter(
      (m) => String(m.ownerId) === String(ownerId) && !m.deletedAt
    );
  }
  if (!isDbReady()) {
    throw new Error('Database is unavailable. Cannot list household members.');
  }

  if (!Types.ObjectId.isValid(ownerId)) {
    return [];
  }
  const queryOwnerId = new Types.ObjectId(ownerId);

  const members = await HouseholdMemberModel.find({
    ownerId: queryOwnerId,
    deletedAt: null,
  }).sort({ createdAt: 1 });

  return members.map((m) => m.toJSON());
}

/**
 * Creates a new household member with strict authorization, seat-limit check,
 * duplicate detection, and concurrency protection.
 */
export async function createMember(
  ownerId: string,
  input: CreateMemberInput,
  context?: MemberActionContext
): Promise<any> {
  if (!isDbReady() && !isMockDb()) {
    throw new Error('Database is unavailable. Cannot save household member.');
  }

  // 1. Authorization check
  if (context && context.requesterId !== ownerId && context.requesterRole !== 'ADMIN') {
    throw new UnauthorizedMemberActionError();
  }

  const nameEn = (input.nameEn || '').trim();
  const nameMl = (input.nameMl || nameEn).trim();
  if (!nameEn) {
    throw new Error('Member name is required.');
  }

  if (!isMockDb() && !Types.ObjectId.isValid(ownerId)) {
    throw new Error('Invalid owner ID format.');
  }
  const queryOwnerId = isMockDb() ? ownerId : new Types.ObjectId(ownerId);

  // Normalize phone and email
  const normPhone = normalizePhone(input.phone);
  const normEmail = normalizeEmail(input.email);
  const initials = input.initials?.trim() || nameEn.slice(0, 2).toUpperCase() || 'KV';

  // 2. Concurrency-protected seat limit and duplicate check
  return withHouseholdLock(ownerId, async () => {
    // A. Authoritative seat limit from subscription entitlement
    const entitlement = await evaluateUserEntitlement(ownerId);
    const maxSeats = entitlement.maxFamilyMembers || 5;

    // B. Authoritative current seat count (active + invited members)
    const currentSeats = await countHouseholdSeats(ownerId);

    // C. Strict seat-limit check
    if (currentSeats >= maxSeats) {
      throw new SeatLimitExceededError(maxSeats, currentSeats, entitlement.planName);
    }

    if (isMockDb()) {
      const activeMembers = Array.from(mockMemberStore.values()).filter(
        (m) =>
          String(m.ownerId) === String(ownerId) &&
          !m.deletedAt &&
          (m.status === 'ACTIVE' || m.status === 'INVITED')
      );
      if (activeMembers.length >= maxSeats) {
        throw new SeatLimitExceededError(maxSeats, activeMembers.length, entitlement.planName);
      }
      if (activeMembers.some((m) => m.nameEn.toLowerCase() === nameEn.toLowerCase())) {
        throw new DuplicateMemberError('name', nameEn);
      }
      if (
        normPhone &&
        activeMembers.some(
          (m) =>
            m.normalizedPhone === normPhone ||
            m.phone === normPhone ||
            m.phone === input.phone?.trim()
        )
      ) {
        throw new DuplicateMemberError('phone', input.phone || normPhone);
      }
      if (
        normEmail &&
        activeMembers.some(
          (m) => m.normalizedEmail === normEmail || m.email === normEmail
        )
      ) {
        throw new DuplicateMemberError('email', normEmail);
      }

      const occupiedSeats = new Set(activeMembers.map((m) => m.seatNumber).filter(Boolean));
      let assignedSeat = 1;
      while (assignedSeat <= maxSeats && occupiedSeats.has(assignedSeat)) {
        assignedSeat++;
      }
      if (assignedSeat > maxSeats) {
        throw new SeatLimitExceededError(maxSeats, activeMembers.length, entitlement.planName);
      }

      const newId = new Types.ObjectId().toString();
      const mockMember = {
        _id: newId,
        id: newId,
        ownerId,
        nameEn,
        nameMl,
        relationEn: (input.relationEn || 'Family Member').trim(),
        relationMl: (input.relationMl || input.relationEn || 'കുടുംബാംഗം').trim(),
        location: input.location?.trim() || input.locEn?.trim() || 'Kochi',
        locEn: input.locEn?.trim() || input.location?.trim() || 'Kochi',
        locMl: input.locMl?.trim(),
        phone: input.phone?.trim() || normPhone,
        normalizedPhone: normPhone,
        whatsapp: input.whatsapp?.trim() || input.phone?.trim() || normPhone,
        email: input.email?.trim() || normEmail,
        normalizedEmail: normEmail,
        homePhone: input.homePhone?.trim(),
        residencyStatus: input.residencyStatus?.trim(),
        householdName: input.householdName?.trim(),
        role: input.role || 'EDITOR',
        status: input.status || 'ACTIVE',
        seatNumber: assignedSeat,
        invitedBy: context?.requesterId || ownerId,
        initials,
        colorHex: input.colorHex,
        avatarBg: input.avatarBg,
        avatarDataUrl: input.avatarDataUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
        toJSON() {
          return { ...this };
        },
      };
      mockMemberStore.set(newId, mockMember);
      return { ...mockMember };
    }

    // D. Duplicate check within household: Name
    const existingByName = await HouseholdMemberModel.findOne({
      ownerId: queryOwnerId,
      deletedAt: null,
      nameEn: { $regex: new RegExp(`^${nameEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existingByName) {
      throw new DuplicateMemberError('name', nameEn);
    }

    // E. Duplicate check within household: Phone
    if (normPhone) {
      const existingByPhone = await HouseholdMemberModel.findOne({
        ownerId: queryOwnerId,
        deletedAt: null,
        $or: [
          { normalizedPhone: normPhone },
          { phone: normPhone },
          { phone: input.phone?.trim() },
        ],
      });
      if (existingByPhone) {
        throw new DuplicateMemberError('phone', input.phone || normPhone);
      }
    }

    // F. Duplicate check within household: Email
    if (normEmail) {
      const existingByEmail = await HouseholdMemberModel.findOne({
        ownerId: queryOwnerId,
        deletedAt: null,
        $or: [
          { normalizedEmail: normEmail },
          { email: normEmail },
        ],
      });
      if (existingByEmail) {
        throw new DuplicateMemberError('email', normEmail);
      }
    }

    // G. Determine atomic seat slot for multi-instance concurrency safety
    const activeMembers = await HouseholdMemberModel.find({
      ownerId: queryOwnerId,
      deletedAt: null,
      status: { $in: ['ACTIVE', 'INVITED'] },
    }).select('seatNumber');

    if (activeMembers.length >= maxSeats) {
      throw new SeatLimitExceededError(maxSeats, activeMembers.length, entitlement.planName);
    }

    const occupiedSeats = new Set(activeMembers.map((m) => m.seatNumber).filter(Boolean));
    let assignedSeat = 1;
    while (assignedSeat <= maxSeats && occupiedSeats.has(assignedSeat)) {
      assignedSeat++;
    }
    if (assignedSeat > maxSeats) {
      throw new SeatLimitExceededError(maxSeats, activeMembers.length, entitlement.planName);
    }

    // H. Create and persist new member
    const member = new HouseholdMemberModel({
      ownerId: queryOwnerId,
      nameEn,
      nameMl,
      relationEn: (input.relationEn || 'Family Member').trim(),
      relationMl: (input.relationMl || input.relationEn || 'കുടുംബാംഗം').trim(),
      location: input.location?.trim() || input.locEn?.trim() || 'Kochi',
      locEn: input.locEn?.trim() || input.location?.trim() || 'Kochi',
      locMl: input.locMl?.trim(),
      phone: input.phone?.trim() || normPhone,
      normalizedPhone: normPhone,
      whatsapp: input.whatsapp?.trim() || input.phone?.trim() || normPhone,
      email: input.email?.trim() || normEmail,
      normalizedEmail: normEmail,
      homePhone: input.homePhone?.trim(),
      residencyStatus: input.residencyStatus?.trim(),
      householdName: input.householdName?.trim(),
      role: input.role || 'EDITOR',
      status: input.status || 'ACTIVE',
      seatNumber: assignedSeat,
      invitedBy: context?.requesterId ? new Types.ObjectId(context.requesterId) : queryOwnerId,
      initials,
      colorHex: input.colorHex,
      avatarBg: input.avatarBg,
      avatarDataUrl: input.avatarDataUrl,
    });

    try {
      await member.save();
      return member.toJSON();
    } catch (saveErr: any) {
      if (saveErr.code === 11000) {
        if (saveErr.keyPattern?.seatNumber || saveErr.message?.includes('seatNumber')) {
          const freshSeats = await countHouseholdSeats(ownerId);
          throw new SeatLimitExceededError(maxSeats, freshSeats, entitlement.planName);
        }
        if (saveErr.keyPattern?.nameEn || saveErr.message?.includes('nameEn')) {
          throw new DuplicateMemberError('name', nameEn);
        }
        if (
          saveErr.keyPattern?.normalizedPhone ||
          saveErr.keyPattern?.phone ||
          saveErr.message?.includes('phone')
        ) {
          throw new DuplicateMemberError('phone', input.phone || normPhone || '');
        }
        if (
          saveErr.keyPattern?.normalizedEmail ||
          saveErr.keyPattern?.email ||
          saveErr.message?.includes('email')
        ) {
          throw new DuplicateMemberError('email', normEmail || '');
        }
      }
      throw saveErr;
    }
  });
}

/**
 * Accepts an invitation idempotently, transitioning status to ACTIVE without double-counting seats.
 */
export async function acceptMemberInvitation(
  ownerId: string,
  memberId: string,
  acceptingUserId?: string
): Promise<any> {
  if (isMockDb()) {
    const member = mockMemberStore.get(memberId);
    if (!member || String(member.ownerId) !== String(ownerId) || member.deletedAt) {
      throw new Error('Invitation not found or has been removed.');
    }
    if (member.status === 'ACTIVE') {
      return { ...member };
    }
    member.status = 'ACTIVE';
    member.invitationAcceptedAt = new Date();
    mockMemberStore.set(memberId, member);
    return { ...member };
  }

  if (!isDbReady()) {
    throw new Error('Database is unavailable.');
  }

  if (!Types.ObjectId.isValid(memberId) || !Types.ObjectId.isValid(ownerId)) {
    throw new Error('Invalid ID format.');
  }

  const queryOwnerId = new Types.ObjectId(ownerId);
  const member = await HouseholdMemberModel.findOne({
    _id: new Types.ObjectId(memberId),
    ownerId: queryOwnerId,
    deletedAt: null,
  });

  if (!member) {
    throw new Error('Invitation not found or has been removed.');
  }

  if (member.status === 'ACTIVE') {
    // Idempotent: already accepted
    return member.toJSON();
  }

  member.status = 'ACTIVE';
  member.invitationAcceptedAt = new Date();
  await member.save();
  return member.toJSON();
}

/**
 * Updates an existing household member with duplicate checks and authorization.
 */
export async function updateMember(
  ownerId: string,
  memberId: string,
  input: UpdateMemberInput,
  context?: MemberActionContext
): Promise<any> {
  // 1. Vault ID immutability check
  if (input.vaultId !== undefined || input.seatNumber !== undefined) {
    throw new Error('Vault ID is a system-generated identifier and cannot be modified.');
  }

  // 2. Role-based access control
  const isSuperAdmin = context?.requesterRole === 'SUPER_ADMIN' || context?.requesterRole === 'ADMIN';
  const isOwner = context ? (context.requesterId === ownerId || context.requesterRole === 'USER' || context.requesterRole === 'OWNER') : true;
  const isFamilyMember = context?.requesterRole === 'FAMILY_MEMBER';

  if (isFamilyMember) {
    // Family members can ONLY edit their own personal details
    const memberObj = isMockDb()
      ? mockMemberStore.get(memberId)
      : (isDbReady() && Types.ObjectId.isValid(memberId) ? await HouseholdMemberModel.findById(memberId) : null);

    const isOwnRecord = context?.requesterId === memberId ||
      (memberObj && String(memberObj.invitedBy || memberObj._id) === String(context?.requesterId));

    if (!isOwnRecord) {
      throw new UnauthorizedMemberActionError("Family members cannot edit another member's profile.");
    }

    if (
      input.householdName !== undefined ||
      input.role !== undefined ||
      input.status !== undefined ||
      input.relationEn !== undefined ||
      input.relationMl !== undefined ||
      input.nameEn !== undefined ||
      input.nameMl !== undefined
    ) {
      throw new UnauthorizedMemberActionError('Family members can only edit their own personal details.');
    }
  } else if (context && !isSuperAdmin && !isOwner) {
    throw new UnauthorizedMemberActionError();
  }

  // 3. Field validation
  if (input.email !== undefined && input.email.trim() !== '') {
    const emailCheck = validateEmailFormat(input.email);
    if (!emailCheck.valid) {
      throw new Error(emailCheck.error);
    }
  }

  if (input.whatsapp !== undefined && input.whatsapp.trim() !== '') {
    const waCheck = validateWhatsAppNumber(input.whatsapp);
    if (!waCheck.valid) {
      throw new Error(waCheck.error);
    }
  }

  if (input.homePhone !== undefined && input.homePhone.trim() !== '') {
    const hpCheck = validateHomePhone(input.homePhone);
    if (!hpCheck.valid) {
      throw new Error(hpCheck.error);
    }
  }

  if (isMockDb()) {
    const member = mockMemberStore.get(memberId);
    if (!member || member.deletedAt) {
      const err = new Error('Household member not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (!isSuperAdmin && String(member.ownerId) !== String(ownerId)) {
      const err = new Error('Access denied: You do not have permission to modify this household member.');
      (err as any).statusCode = 403;
      throw err;
    }
    if (input.nameEn !== undefined && input.nameEn.trim() !== member.nameEn) {
      const newName = input.nameEn.trim();
      const existing = Array.from(mockMemberStore.values()).find(
        (m) =>
          String(m.ownerId) === String(ownerId) &&
          m._id !== memberId &&
          !m.deletedAt &&
          m.nameEn.toLowerCase() === newName.toLowerCase()
      );
      if (existing) {
        throw new DuplicateMemberError('name', newName);
      }
      member.nameEn = newName;
    }
    if (input.phone !== undefined) {
      const newNormPhone = normalizePhone(input.phone);
      if (newNormPhone && newNormPhone !== member.normalizedPhone) {
        const existing = Array.from(mockMemberStore.values()).find(
          (m) =>
            String(m.ownerId) === String(ownerId) &&
            m._id !== memberId &&
            !m.deletedAt &&
            (m.normalizedPhone === newNormPhone || m.phone === newNormPhone)
        );
        if (existing) {
          throw new DuplicateMemberError('phone', input.phone || newNormPhone);
        }
      }
      member.phone = input.phone.trim();
      member.normalizedPhone = newNormPhone;
    }
    if (input.email !== undefined) {
      const newNormEmail = normalizeEmail(input.email);
      if (newNormEmail && newNormEmail !== member.normalizedEmail) {
        const existing = Array.from(mockMemberStore.values()).find(
          (m) =>
            String(m.ownerId) === String(ownerId) &&
            m._id !== memberId &&
            !m.deletedAt &&
            (m.normalizedEmail === newNormEmail || m.email === newNormEmail)
        );
        if (existing) {
          throw new DuplicateMemberError('email', newNormEmail);
        }
      }
      member.email = input.email.trim();
      member.normalizedEmail = newNormEmail;
    }
    if (input.nameMl !== undefined) member.nameMl = input.nameMl.trim();
    if (input.relationEn !== undefined) {
      member.relationEn = input.relationEn.trim();
      if (!input.relationMl && RELATION_MAP_ML[input.relationEn.trim()]) {
        member.relationMl = RELATION_MAP_ML[input.relationEn.trim()];
      }
    }
    if (input.relationMl !== undefined) member.relationMl = input.relationMl.trim();
    if (input.location !== undefined) {
      member.location = input.location.trim();
      member.locEn = input.location.trim();
    }
    if (input.locEn !== undefined) member.locEn = input.locEn.trim();
    if (input.locMl !== undefined) member.locMl = input.locMl.trim();
    if (input.whatsapp !== undefined) {
      member.whatsapp = input.whatsapp.trim();
      if (!input.phone) {
        member.phone = input.whatsapp.trim();
        member.normalizedPhone = normalizePhone(input.whatsapp);
      }
    }
    if (input.homePhone !== undefined) member.homePhone = input.homePhone.trim();
    if (input.residencyStatus !== undefined) member.residencyStatus = input.residencyStatus.trim();
    if (input.householdName !== undefined && input.householdName.trim()) {
      const trimmedHName = input.householdName.trim();
      member.householdName = trimmedHName;
      // Sync across household members in mock store
      for (const m of mockMemberStore.values()) {
        if (String(m.ownerId) === String(ownerId) && !m.deletedAt) {
          m.householdName = trimmedHName;
        }
      }
    }
    if (input.role !== undefined) member.role = input.role;
    if (input.status !== undefined) member.status = input.status;
    if (input.initials !== undefined) member.initials = input.initials.trim();
    if (input.colorHex !== undefined) member.colorHex = input.colorHex;
    if (input.avatarBg !== undefined) member.avatarBg = input.avatarBg;
    if (input.avatarDataUrl !== undefined) member.avatarDataUrl = input.avatarDataUrl;
    member.updatedAt = new Date();
    mockMemberStore.set(memberId, member);
    return { ...member };
  }

  if (!isDbReady()) {
    throw new Error('Database is unavailable. Cannot update household member.');
  }

  if (!Types.ObjectId.isValid(memberId) || (!isSuperAdmin && !Types.ObjectId.isValid(ownerId))) {
    throw new Error('Invalid ID format.');
  }
  const queryOwnerId = isSuperAdmin ? undefined : new Types.ObjectId(ownerId);

  const query: any = {
    _id: new Types.ObjectId(memberId),
    deletedAt: null,
  };
  if (queryOwnerId) {
    query.ownerId = queryOwnerId;
  }

  const existsAnywhere = await HouseholdMemberModel.findById(memberId);
  if (!existsAnywhere || existsAnywhere.deletedAt) {
    const err = new Error('Household member not found.');
    (err as any).statusCode = 404;
    throw err;
  }
  if (!isSuperAdmin && String(existsAnywhere.ownerId) !== String(ownerId)) {
    const err = new Error('Access denied: You do not have permission to modify this household member.');
    (err as any).statusCode = 403;
    throw err;
  }

  const member = await HouseholdMemberModel.findOne(query);

  if (!member) {
    const err = new Error('Household member not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // Duplicate checks if name, phone, or email are updated
  if (input.nameEn !== undefined && input.nameEn.trim() !== member.nameEn) {
    const newName = input.nameEn.trim();
    const existing = await HouseholdMemberModel.findOne({
      ownerId: member.ownerId,
      _id: { $ne: member._id },
      deletedAt: null,
      nameEn: { $regex: new RegExp(`^${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existing) {
      throw new DuplicateMemberError('name', newName);
    }
    member.nameEn = newName;
  }

  if (input.phone !== undefined) {
    const newNormPhone = normalizePhone(input.phone);
    if (newNormPhone && newNormPhone !== member.normalizedPhone) {
      const existing = await HouseholdMemberModel.findOne({
        ownerId: member.ownerId,
        _id: { $ne: member._id },
        deletedAt: null,
        $or: [
          { normalizedPhone: newNormPhone },
          { phone: newNormPhone },
        ],
      });
      if (existing) {
        throw new DuplicateMemberError('phone', input.phone || newNormPhone);
      }
    }
    member.phone = input.phone.trim();
    member.normalizedPhone = newNormPhone;
  }

  if (input.email !== undefined) {
    const newNormEmail = normalizeEmail(input.email);
    if (newNormEmail && newNormEmail !== member.normalizedEmail) {
      const existing = await HouseholdMemberModel.findOne({
        ownerId: member.ownerId,
        _id: { $ne: member._id },
        deletedAt: null,
        $or: [
          { normalizedEmail: newNormEmail },
          { email: newNormEmail },
        ],
      });
      if (existing) {
        throw new DuplicateMemberError('email', newNormEmail);
      }
    }
    member.email = input.email.trim();
    member.normalizedEmail = newNormEmail;
  }

  if (input.nameMl !== undefined) member.nameMl = input.nameMl.trim();
  if (input.relationEn !== undefined) {
    member.relationEn = input.relationEn.trim();
    if (!input.relationMl && RELATION_MAP_ML[input.relationEn.trim()]) {
      member.relationMl = RELATION_MAP_ML[input.relationEn.trim()];
    }
  }
  if (input.relationMl !== undefined) member.relationMl = input.relationMl.trim();
  if (input.location !== undefined) {
    member.location = input.location.trim();
    member.locEn = input.location.trim();
  }
  if (input.locEn !== undefined) member.locEn = input.locEn.trim();
  if (input.locMl !== undefined) member.locMl = input.locMl.trim();
  if (input.whatsapp !== undefined) {
    member.whatsapp = input.whatsapp.trim();
    if (!input.phone) {
      member.phone = input.whatsapp.trim();
      member.normalizedPhone = normalizePhone(input.whatsapp);
    }
  }
  if (input.homePhone !== undefined) member.homePhone = input.homePhone.trim();
  if (input.residencyStatus !== undefined) member.residencyStatus = input.residencyStatus.trim();
  if (input.householdName !== undefined && input.householdName.trim()) {
    member.householdName = input.householdName.trim();
  }
  if (input.role !== undefined) member.role = input.role;
  if (input.status !== undefined) member.status = input.status;
  if (input.initials !== undefined) member.initials = input.initials.trim();
  if (input.colorHex !== undefined) member.colorHex = input.colorHex;
  if (input.avatarBg !== undefined) member.avatarBg = input.avatarBg;
  if (input.avatarDataUrl !== undefined) member.avatarDataUrl = input.avatarDataUrl;

  await member.save();

  // If household name was changed, sync across all household members and User familyName
  if (input.householdName !== undefined && input.householdName.trim()) {
    const trimmedHName = input.householdName.trim();
    await HouseholdMemberModel.updateMany(
      { ownerId: member.ownerId, deletedAt: null },
      { $set: { householdName: trimmedHName } }
    );
    try {
      const { User } = await import('../models/User');
      await User.updateOne(
        { _id: member.ownerId },
        { $set: { familyName: trimmedHName } }
      );
    } catch {
      // Non-blocking user familyName sync
    }
  }

  return member.toJSON();
}

/**
 * Loads a comprehensive profile object for a household member.
 */
export async function getMemberProfile(
  ownerId: string,
  memberId?: string,
  context?: MemberActionContext
): Promise<any> {
  const isSuperAdmin = context?.requesterRole === 'SUPER_ADMIN' || context?.requesterRole === 'ADMIN';

  let member: any = null;
  if (isMockDb()) {
    if (memberId) {
      member = mockMemberStore.get(memberId);
      if (!member || member.deletedAt) {
        const err = new Error('Household member profile not found.');
        (err as any).statusCode = 404;
        throw err;
      }
      if (!isSuperAdmin && String(member.ownerId) !== String(ownerId)) {
        const err = new Error('Access denied: You do not have permission to view this member profile.');
        (err as any).statusCode = 403;
        throw err;
      }
    } else {
      member =
        Array.from(mockMemberStore.values()).find(
          (m) => String(m.ownerId) === String(ownerId) && !m.deletedAt && m.role === 'OWNER'
        ) ||
        Array.from(mockMemberStore.values()).find(
          (m) => String(m.ownerId) === String(ownerId) && !m.deletedAt
        );
    }
  } else {
    if (!isDbReady()) {
      throw new Error('Database is unavailable. Cannot load member profile.');
    }
    if (memberId && Types.ObjectId.isValid(memberId)) {
      const existsAnywhere = await HouseholdMemberModel.findById(memberId);
      if (!existsAnywhere || existsAnywhere.deletedAt) {
        const err = new Error('Household member profile not found.');
        (err as any).statusCode = 404;
        throw err;
      }
      if (!isSuperAdmin && String(existsAnywhere.ownerId) !== String(ownerId)) {
        const err = new Error('Access denied: You do not have permission to view this member profile.');
        (err as any).statusCode = 403;
        throw err;
      }
      const q: any = { _id: new Types.ObjectId(memberId), deletedAt: null };
      if (!isSuperAdmin && Types.ObjectId.isValid(ownerId)) {
        q.ownerId = new Types.ObjectId(ownerId);
      }
      member = await HouseholdMemberModel.findOne(q);
    } else if (Types.ObjectId.isValid(ownerId)) {
      member =
        (await HouseholdMemberModel.findOne({
          ownerId: new Types.ObjectId(ownerId),
          deletedAt: null,
          role: 'OWNER',
        })) ||
        (await HouseholdMemberModel.findOne({
          ownerId: new Types.ObjectId(ownerId),
          deletedAt: null,
        }));
    }
    if (member) {
      member = member.toJSON();
    }
  }

  if (!member) {
    throw new Error('Household member profile not found or access denied.');
  }

  const seatNum = member.seatNumber || 1;
  const vaultId = `KV#${String(seatNum).padStart(3, '0')}`;
  const canEditHousehold =
    isSuperAdmin ||
    (!context && member.role === 'OWNER') ||
    (context ? (context.requesterRole !== 'FAMILY_MEMBER' && (context.requesterId === ownerId || context.requesterRole === 'ADMIN' || context.requesterRole === 'USER')) : true) ||
    member.role === 'OWNER';

  return {
    id: member._id || member.id,
    nameEn: member.nameEn,
    nameMl: member.nameMl,
    householdName: member.householdName || 'Kudumba',
    relationEn: member.relationEn,
    relationMl: member.relationMl,
    residencyStatus: member.residencyStatus || 'Resident (Kerala)',
    vaultId,
    seatNumber: seatNum,
    location: member.location || member.locEn || 'Kerala',
    locEn: member.locEn || member.location || 'Kerala',
    locMl: member.locMl,
    email: member.email || '',
    whatsapp: member.whatsapp || member.phone || '',
    phone: member.phone || '',
    homePhone: member.homePhone || '',
    role: member.role || 'EDITOR',
    status: member.status || 'ACTIVE',
    initials: member.initials || (member.nameEn ? member.nameEn.slice(0, 2).toUpperCase() : 'KV'),
    avatarDataUrl: member.avatarDataUrl,
    canEditHousehold,
  };
}

/**
 * Updates Overview section fields (Household, Relation, Residency Status) with RBAC and validation.
 */
export async function updateMemberOverview(
  ownerId: string,
  memberId: string,
  input: UpdateOverviewInput,
  context?: MemberActionContext
): Promise<any> {
  if (input.vaultId !== undefined) {
    throw new Error('Vault ID is a system-generated identifier and cannot be modified.');
  }

  if (context?.requesterRole === 'FAMILY_MEMBER') {
    throw new UnauthorizedMemberActionError('Family members cannot edit household-level data or relations.');
  }

  const updates: UpdateMemberInput = {};
  if (input.householdName !== undefined) {
    if (!input.householdName.trim()) {
      throw new Error('Household name cannot be empty.');
    }
    updates.householdName = input.householdName.trim();
  }
  if (input.relationEn !== undefined) {
    updates.relationEn = input.relationEn.trim();
    if (!input.relationMl && RELATION_MAP_ML[input.relationEn.trim()]) {
      updates.relationMl = RELATION_MAP_ML[input.relationEn.trim()];
    }
  }
  if (input.relationMl !== undefined) {
    updates.relationMl = input.relationMl.trim();
  }
  if (input.residencyStatus !== undefined) {
    updates.residencyStatus = input.residencyStatus.trim();
  }

  const updatedMember = await updateMember(ownerId, memberId, updates, context);
  const profile = await getMemberProfile(ownerId, memberId, context);
  return { profile, member: updatedMember };
}

/**
 * Updates Personal Details section fields (Location, Email, WhatsApp, Home Line) with RBAC and validation.
 */
export async function updateMemberPersonalDetails(
  ownerId: string,
  memberId: string,
  input: UpdatePersonalDetailsInput,
  context?: MemberActionContext
): Promise<any> {
  const updates: UpdateMemberInput = {};
  if (input.location !== undefined) {
    updates.location = input.location.trim();
    updates.locEn = input.location.trim();
  }
  if (input.locEn !== undefined) {
    updates.locEn = input.locEn.trim();
  }
  if (input.locMl !== undefined) {
    updates.locMl = input.locMl.trim();
  }
  if (input.email !== undefined) {
    updates.email = input.email.trim();
  }
  if (input.whatsapp !== undefined) {
    updates.whatsapp = input.whatsapp.trim();
    updates.phone = input.whatsapp.trim();
  }
  if (input.homePhone !== undefined) {
    updates.homePhone = input.homePhone.trim();
  }

  const updatedMember = await updateMember(ownerId, memberId, updates, context);
  const profile = await getMemberProfile(ownerId, memberId, context);
  return { profile, member: updatedMember };
}

/**
 * Soft-deletes a member, immediately freeing their seat in the household quota.
 */
export async function deleteMember(
  ownerId: string,
  memberId: string,
  context?: MemberActionContext
): Promise<{ success: boolean; memberId: string }> {
  if (context && context.requesterId !== ownerId && context.requesterRole !== 'ADMIN') {
    throw new UnauthorizedMemberActionError();
  }

  if (isMockDb()) {
    const member = mockMemberStore.get(memberId);
    if (!member || member.deletedAt) {
      const err = new Error('Household member not found.');
      (err as any).statusCode = 404;
      throw err;
    }
    if (String(member.ownerId) !== String(ownerId) && context?.requesterRole !== 'ADMIN') {
      const err = new Error('Access denied: You do not have permission to delete this household member.');
      (err as any).statusCode = 403;
      throw err;
    }
    if (member.role === 'OWNER') {
      const otherOwners = Array.from(mockMemberStore.values()).filter(
        (m) =>
          String(m.ownerId) === String(ownerId) &&
          m.role === 'OWNER' &&
          !m.deletedAt &&
          m._id !== memberId
      );
      if (otherOwners.length === 0) {
        throw new Error('Cannot delete the primary household owner.');
      }
    }
    member.deletedAt = new Date();
    member.status = 'REMOVED';
    mockMemberStore.set(memberId, member);
    return { success: true, memberId };
  }

  if (!isDbReady()) {
    throw new Error('Database is unavailable. Cannot delete household member.');
  }

  if (!Types.ObjectId.isValid(memberId) || !Types.ObjectId.isValid(ownerId)) {
    throw new Error('Invalid ID format.');
  }
  const queryOwnerId = new Types.ObjectId(ownerId);

  const existsAnywhere = await HouseholdMemberModel.findById(memberId);
  if (!existsAnywhere || existsAnywhere.deletedAt) {
    const err = new Error('Household member not found.');
    (err as any).statusCode = 404;
    throw err;
  }
  if (String(existsAnywhere.ownerId) !== String(ownerId) && context?.requesterRole !== 'ADMIN') {
    const err = new Error('Access denied: You do not have permission to delete this household member.');
    (err as any).statusCode = 403;
    throw err;
  }

  const member = await HouseholdMemberModel.findOne({
    _id: new Types.ObjectId(memberId),
    ownerId: queryOwnerId,
    deletedAt: null,
  });

  if (!member) {
    const err = new Error('Household member not found.');
    (err as any).statusCode = 404;
    throw err;
  }

  // Prevent deleting the household owner if it is the only OWNER
  if (member.role === 'OWNER') {
    const otherOwners = await HouseholdMemberModel.countDocuments({
      ownerId: queryOwnerId,
      role: 'OWNER',
      deletedAt: null,
      _id: { $ne: member._id },
    });
    if (otherOwners === 0) {
      throw new Error('Cannot delete the primary household owner.');
    }
  }

  member.deletedAt = new Date();
  member.status = 'REMOVED';
  await member.save();

  return { success: true, memberId };
}
