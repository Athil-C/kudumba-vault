process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMember,
  listMembers,
  updateMember,
  getMemberProfile,
  updateMemberOverview,
  updateMemberPersonalDetails,
  _resetMockMembers,
  validateWhatsAppNumber,
  validateHomePhone,
  validateEmailFormat,
  UnauthorizedMemberActionError,
  RELATION_OPTIONS_EN,
  RESIDENCY_STATUS_OPTIONS,
} from './memberService';

describe('Kudumba Vault — Profile Details Editing and Database Persistence Test Suite', () => {
  const ownerId = '507f1f77bcf86cd799439011';
  const otherOwnerId = '507f1f77bcf86cd799439099';

  beforeEach(() => {
    _resetMockMembers();
  });

  describe('1. Field Validators', () => {
    test('validateEmailFormat validates email structure correctly', () => {
      assert.equal(validateEmailFormat('test@example.com').valid, true);
      assert.equal(validateEmailFormat('user.name+tag@kudumba.org').valid, true);
      assert.equal(validateEmailFormat('invalid-email').valid, false);
      assert.equal(validateEmailFormat('missing@domain').valid, false);
      assert.equal(validateEmailFormat('').valid, true); // empty is allowed (optional)
      assert.equal(validateEmailFormat(undefined).valid, true);
    });

    test('validateWhatsAppNumber validates country code and international length', () => {
      // Valid Indian numbers
      assert.equal(validateWhatsAppNumber('+91 98765 43210').valid, true);
      assert.equal(validateWhatsAppNumber('+919876543210').valid, true);
      // Valid UAE/Gulf numbers
      assert.equal(validateWhatsAppNumber('+971 50 123 4567').valid, true);
      assert.equal(validateWhatsAppNumber('+971501234567').valid, true);
      // Valid US number
      assert.equal(validateWhatsAppNumber('+1 415 555 2671').valid, true);
      // Invalid: missing leading +
      assert.equal(validateWhatsAppNumber('9876543210').valid, false);
      // Invalid: too short
      assert.equal(validateWhatsAppNumber('+91 123').valid, false);
      // Optional empty check
      assert.equal(validateWhatsAppNumber('').valid, true);
      assert.equal(validateWhatsAppNumber(undefined).valid, true);
    });

    test('validateHomePhone validates optional landline phone number format', () => {
      assert.equal(validateHomePhone('+91 484 234 9102').valid, true);
      assert.equal(validateHomePhone('0484 2349102').valid, true);
      assert.equal(validateHomePhone('2349102').valid, true);
      assert.equal(validateHomePhone('123').valid, false); // too short
      assert.equal(validateHomePhone('').valid, true);
      assert.equal(validateHomePhone(undefined).valid, true);
    });
  });

  describe('2. Overview Section Editing & Persistence', () => {
    test('editing household name persists and updates other members in the household', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Rahul Nair',
        role: 'OWNER',
        householdName: 'Nair Tharavadu',
      });
      const m2 = await createMember(ownerId, {
        nameEn: 'Priya Nair',
        role: 'EDITOR',
        householdName: 'Nair Tharavadu',
      });

      // Update household name
      const res = await updateMemberOverview(
        ownerId,
        m1._id,
        { householdName: 'Nair Kudumbam' },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      assert.equal(res.profile.householdName, 'Nair Kudumbam');
      assert.equal(res.member.householdName, 'Nair Kudumbam');

      // Verify persistence by fetching profile and members again
      const refreshedProfile = await getMemberProfile(ownerId, m1._id);
      assert.equal(refreshedProfile.householdName, 'Nair Kudumbam');

      const allMembers = await listMembers(ownerId);
      const m2Refreshed = allMembers.find((m) => m._id === m2._id);
      assert.equal(m2Refreshed.householdName, 'Nair Kudumbam');
    });

    test('editing relationship updates English and maps Malayalam relation', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Anil Kumar',
        relationEn: 'Other',
        relationMl: 'മറ്റുള്ളവർ',
      });

      const res = await updateMemberOverview(
        ownerId,
        m1._id,
        { relationEn: 'Son' },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      assert.equal(res.profile.relationEn, 'Son');
      assert.equal(res.profile.relationMl, 'മകൻ');

      // Verify persistence
      const profile = await getMemberProfile(ownerId, m1._id);
      assert.equal(profile.relationEn, 'Son');
      assert.equal(profile.relationMl, 'മകൻ');
    });

    test('editing residency status persists supported statuses', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Suresh Menon',
        residencyStatus: 'Resident (Kerala)',
      });

      const res = await updateMemberOverview(
        ownerId,
        m1._id,
        { residencyStatus: 'NRI (Gulf / GCC)' },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      assert.equal(res.profile.residencyStatus, 'NRI (Gulf / GCC)');

      // Verify persistence across reload
      const profile = await getMemberProfile(ownerId, m1._id);
      assert.equal(profile.residencyStatus, 'NRI (Gulf / GCC)');
    });

    test('rejects modification of the system-generated Vault ID', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Deepa Varma',
      });

      await assert.rejects(
        async () => {
          await updateMemberOverview(
            ownerId,
            m1._id,
            { vaultId: 'KV#999' },
            { requesterId: ownerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message: 'Vault ID is a system-generated identifier and cannot be modified.',
        }
      );

      await assert.rejects(
        async () => {
          await updateMember(
            ownerId,
            m1._id,
            { seatNumber: 99 },
            { requesterId: ownerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message: 'Vault ID is a system-generated identifier and cannot be modified.',
        }
      );
    });
  });

  describe('3. Personal Details Section Editing & Persistence', () => {
    test('editing location, email, whatsapp, and home line persists permanently', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Harish Babu',
        location: 'Kochi, Kerala',
        email: 'harish@initial.com',
        phone: '+91 98470 12345',
        whatsapp: '+91 98470 12345',
      });

      const res = await updateMemberPersonalDetails(
        ownerId,
        m1._id,
        {
          location: 'Dubai, UAE (Downtown)',
          email: 'harish.babu@emirates.com',
          whatsapp: '+971 50 987 6543',
          homePhone: '+971 4 321 0000',
        },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      assert.equal(res.profile.location, 'Dubai, UAE (Downtown)');
      assert.equal(res.profile.email, 'harish.babu@emirates.com');
      assert.equal(res.profile.whatsapp, '+971 50 987 6543');
      assert.equal(res.profile.homePhone, '+971 4 321 0000');

      // Verify persistence across reload
      const refreshed = await getMemberProfile(ownerId, m1._id);
      assert.equal(refreshed.location, 'Dubai, UAE (Downtown)');
      assert.equal(refreshed.email, 'harish.babu@emirates.com');
      assert.equal(refreshed.whatsapp, '+971 50 987 6543');
      assert.equal(refreshed.homePhone, '+971 4 321 0000');
    });

    test('rejects invalid email formats', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Kavitha Pillai',
      });

      await assert.rejects(
        async () => {
          await updateMemberPersonalDetails(
            ownerId,
            m1._id,
            { email: 'not-an-email' },
            { requesterId: ownerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message: 'Please provide a valid email address (e.g. user@example.com).',
        }
      );
    });

    test('rejects invalid WhatsApp numbers without country code or incorrect length', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Manu Joseph',
      });

      // Missing leading +
      await assert.rejects(
        async () => {
          await updateMemberPersonalDetails(
            ownerId,
            m1._id,
            { whatsapp: '9847012345' },
            { requesterId: ownerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message:
            'WhatsApp number must include an international country code starting with + (e.g. +91 98765 43210 or +971 50 123 4567).',
        }
      );

      // Too short
      await assert.rejects(
        async () => {
          await updateMemberPersonalDetails(
            ownerId,
            m1._id,
            { whatsapp: '+91 123' },
            { requesterId: ownerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message:
            'WhatsApp number must contain between 8 and 15 digits including country code.',
        }
      );
    });

    test('rejects invalid home line phone numbers', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Sujatha K',
      });

      await assert.rejects(
        async () => {
          await updateMemberPersonalDetails(
            ownerId,
            m1._id,
            { homePhone: '12' },
            { requesterId: ownerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message:
            'Home line number must be a valid phone number containing 6 to 15 digits.',
        }
      );
    });

    test('preserves existing database values when optional fields are left unchanged', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Arun George',
        location: 'Kozhikode',
        email: 'arun@george.com',
        phone: '+91 98470 55555',
        whatsapp: '+91 98470 55555',
        homePhone: '+91 495 2345678',
        residencyStatus: 'Resident (Kerala)',
        householdName: 'George Villa',
      });

      // Update only location
      await updateMemberPersonalDetails(
        ownerId,
        m1._id,
        { location: 'Thiruvananthapuram' },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      const profile = await getMemberProfile(ownerId, m1._id);
      assert.equal(profile.location, 'Thiruvananthapuram');
      assert.equal(profile.email, 'arun@george.com');
      assert.equal(profile.whatsapp, '+91 98470 55555');
      assert.equal(profile.homePhone, '+91 495 2345678');
      assert.equal(profile.residencyStatus, 'Resident (Kerala)');
      assert.equal(profile.householdName, 'George Villa');
    });
  });

  describe('4. Role-Based Permissions & Cross-Household Security', () => {
    test('family member can ONLY edit their own personal details', async () => {
      const memberRecord = await createMember(ownerId, {
        nameEn: 'Maya Pillai',
        role: 'EDITOR',
      });

      // Maya updates her own location
      const res = await updateMemberPersonalDetails(
        ownerId,
        memberRecord._id,
        { location: 'Bengaluru, Karnataka' },
        { requesterId: memberRecord._id, requesterRole: 'FAMILY_MEMBER' }
      );
      assert.equal(res.profile.location, 'Bengaluru, Karnataka');
    });

    test('family member CANNOT edit another family member profile', async () => {
      const maya = await createMember(ownerId, { nameEn: 'Maya Pillai', role: 'EDITOR' });
      const ravi = await createMember(ownerId, { nameEn: 'Ravi Pillai', role: 'EDITOR' });

      await assert.rejects(
        async () => {
          await updateMemberPersonalDetails(
            ownerId,
            ravi._id,
            { location: 'London, UK' },
            { requesterId: maya._id, requesterRole: 'FAMILY_MEMBER' }
          );
        },
        (err: any) => {
          return (
            err instanceof UnauthorizedMemberActionError &&
            err.message.includes('Family members cannot edit another member')
          );
        }
      );
    });

    test('family member CANNOT edit household name or overview data', async () => {
      const maya = await createMember(ownerId, { nameEn: 'Maya Pillai', role: 'EDITOR' });

      await assert.rejects(
        async () => {
          await updateMemberOverview(
            ownerId,
            maya._id,
            { householdName: 'Hacked Household' },
            { requesterId: maya._id, requesterRole: 'FAMILY_MEMBER' }
          );
        },
        (err: any) => {
          return (
            err instanceof UnauthorizedMemberActionError &&
            err.message.includes('Family members cannot edit household-level data')
          );
        }
      );
    });

    test('unauthorized user cannot edit a member belonging to another household', async () => {
      const m1 = await createMember(ownerId, { nameEn: 'Owner 1 Member' });

      await assert.rejects(
        async () => {
          await updateMember(
            otherOwnerId,
            m1._id,
            { location: 'Malicious Edit' },
            { requesterId: otherOwnerId, requesterRole: 'USER' }
          );
        },
        {
          name: 'Error',
          message: 'Household member not found or access denied.',
        }
      );
    });

    test('super admin has full editing rights across any member profile', async () => {
      const m1 = await createMember(ownerId, {
        nameEn: 'Super Admin Target',
        location: 'Calicut',
      });

      const res = await updateMember(
        ownerId,
        m1._id,
        { location: 'Dubai, UAE (Admin Updated)' },
        { requesterId: 'admin-user-id', requesterRole: 'ADMIN' }
      );

      assert.equal(res.location, 'Dubai, UAE (Admin Updated)');
    });
  });

  describe('5. Complete Data Round-Trip & Session Persistence Simulation', () => {
    test('full lifecycle: create -> edit overview -> edit personal -> reload profile', async () => {
      // Step 1: Initial creation
      const created = await createMember(ownerId, {
        nameEn: 'Geetha Varma',
        nameMl: 'ഗീത വർമ്മ',
        householdName: 'Varma Kovilakam',
        relationEn: 'Mother',
        relationMl: 'അമ്മ',
        residencyStatus: 'Resident (Kerala)',
        location: 'Tripunithura, Kochi',
        email: 'geetha.varma@initial.org',
        phone: '+91 94470 11223',
        whatsapp: '+91 94470 11223',
        homePhone: '+91 484 277 8899',
      });

      assert.ok(created._id);

      // Step 2: Edit Overview (Relationship + Residency)
      await updateMemberOverview(
        ownerId,
        created._id,
        {
          relationEn: 'Mother',
          residencyStatus: 'NRI (Gulf / GCC)',
        },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      // Step 3: Edit Personal Details (WhatsApp + Location)
      await updateMemberPersonalDetails(
        ownerId,
        created._id,
        {
          location: 'Sharjah, UAE',
          whatsapp: '+971 55 123 4567',
          homePhone: '+971 6 543 2100',
        },
        { requesterId: ownerId, requesterRole: 'USER' }
      );

      // Step 4: Simulate user page refresh / reopen app by loading from database
      const profile = await getMemberProfile(ownerId, created._id);

      assert.equal(profile.nameEn, 'Geetha Varma');
      assert.equal(profile.nameMl, 'ഗീത വർമ്മ');
      assert.equal(profile.householdName, 'Varma Kovilakam');
      assert.equal(profile.relationEn, 'Mother');
      assert.equal(profile.relationMl, 'അമ്മ');
      assert.equal(profile.residencyStatus, 'NRI (Gulf / GCC)');
      assert.equal(profile.location, 'Sharjah, UAE');
      assert.equal(profile.whatsapp, '+971 55 123 4567');
      assert.equal(profile.homePhone, '+971 6 543 2100');
      assert.equal(profile.email, 'geetha.varma@initial.org');
      assert.equal(profile.vaultId, 'KV#001');
      assert.equal(profile.canEditHousehold, true);
    });
  });
});
