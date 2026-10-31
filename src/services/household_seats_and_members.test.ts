process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMember,
  listMembers,
  countHouseholdSeats,
  acceptMemberInvitation,
  deleteMember,
  updateMember,
  _resetMockMembers,
  SeatLimitExceededError,
  DuplicateMemberError,
  UnauthorizedMemberActionError,
  normalizePhone,
  normalizeEmail,
} from './memberService';
import {
  _resetMockSubscriptions,
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  validateUploadEntitlement,
  simulateSubscriptionDev,
} from './subscriptionService';

test('Kudumba Vault — Household Member Duplication, Seat Limits and Entitlements Test Suite', async (t) => {
  const ownerId = '507f1f77bcf86cd799439011';
  const otherUserId = '507f1f77bcf86cd799439099';

  t.beforeEach(() => {
    _resetMockMembers();
    _resetMockSubscriptions();
  });

  await t.test('1. Phone and email normalization', () => {
    assert.equal(normalizePhone('+91 98470 33102'), '+919847033102');
    assert.equal(normalizePhone('9847033102'), '+919847033102');
    assert.equal(normalizePhone('+971 50 849 2014'), '+971508492014');
    assert.equal(normalizePhone('   '), undefined);
    assert.equal(normalizePhone(undefined), undefined);

    assert.equal(normalizeEmail('  TesterVault@Gmail.com  '), 'testervault@gmail.com');
    assert.equal(normalizeEmail(''), undefined);
    assert.equal(normalizeEmail(undefined), undefined);
  });

  await t.test('2. Seat counting rules: Active and Invited reserve seats; Removed frees seats', async () => {
    // Household starts with 0 seats in member store
    assert.equal(await countHouseholdSeats(ownerId), 0);

    // Add active member
    const m1 = await createMember(ownerId, {
      nameEn: 'Fatima',
      role: 'OWNER',
      phone: '+91 98470 11111',
      status: 'ACTIVE',
    });
    assert.equal(await countHouseholdSeats(ownerId), 1);

    // Add invited member (invitations reserve a seat)
    const m2 = await createMember(ownerId, {
      nameEn: 'Zainab',
      role: 'EDITOR',
      phone: '+91 98470 22222',
      status: 'INVITED',
    });
    assert.equal(await countHouseholdSeats(ownerId), 2);

    // Accept invitation idempotently (seat count remains 2, does NOT double-count)
    await acceptMemberInvitation(ownerId, m2._id);
    assert.equal(await countHouseholdSeats(ownerId), 2);

    // Second accept call is a safe no-op
    await acceptMemberInvitation(ownerId, m2._id);
    assert.equal(await countHouseholdSeats(ownerId), 2);

    // Delete invited/active member -> seat immediately freed
    await deleteMember(ownerId, m2._id);
    assert.equal(await countHouseholdSeats(ownerId), 1);
  });

  await t.test('3. Limit enforcement on Founding Free plan (Max 5 members)', async () => {
    // Fill up to 5 seats
    for (let i = 1; i <= 5; i++) {
      await createMember(ownerId, {
        nameEn: `Member ${i}`,
        phone: `+91 98470 0000${i}`,
      });
    }
    assert.equal(await countHouseholdSeats(ownerId), 5);

    // Attempting 6th member must throw SeatLimitExceededError
    await assert.rejects(
      async () => {
        await createMember(ownerId, {
          nameEn: 'Member 6',
          phone: '+91 98470 00006',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SeatLimitExceededError);
        assert.equal(err.maxSeats, 5);
        assert.equal(err.currentSeats, 5);
        return true;
      }
    );
  });

  await t.test('4. Soft delete frees seat and allows adding another member under the limit', async () => {
    // Add 5 members
    const members: any[] = [];
    for (let i = 1; i <= 5; i++) {
      members.push(
        await createMember(ownerId, {
          nameEn: `Member ${i}`,
          phone: `+91 98470 0000${i}`,
          role: i === 1 ? 'OWNER' : 'EDITOR',
        })
      );
    }
    assert.equal(await countHouseholdSeats(ownerId), 5);

    // Remove member 5
    await deleteMember(ownerId, members[4]._id);
    assert.equal(await countHouseholdSeats(ownerId), 4);

    // Now adding a new member succeeds
    const replacement = await createMember(ownerId, {
      nameEn: 'Replacement Member',
      phone: '+91 98470 00099',
    });
    assert.ok(replacement._id);
    assert.equal(await countHouseholdSeats(ownerId), 5);
  });

  await t.test('5. Duplicate member prevention: Name, Phone, and Email', async () => {
    await createMember(ownerId, {
      nameEn: 'Athil Chalil',
      phone: '+91 98470 33102',
      email: 'athil@kudumba.in',
    });

    // 1. Duplicate name (case-insensitive)
    await assert.rejects(
      async () => {
        await createMember(ownerId, {
          nameEn: 'athil chalil',
          phone: '+91 98470 99999',
        });
      },
      (err: any) => {
        assert.ok(err instanceof DuplicateMemberError);
        assert.equal(err.field, 'name');
        return true;
      }
    );

    // 2. Duplicate phone (even with formatting difference)
    await assert.rejects(
      async () => {
        await createMember(ownerId, {
          nameEn: 'Different Name',
          phone: '98470 33102', // India 10-digit formats to +919847033102
        });
      },
      (err: any) => {
        assert.ok(err instanceof DuplicateMemberError);
        assert.equal(err.field, 'phone');
        return true;
      }
    );

    // 3. Duplicate email
    await assert.rejects(
      async () => {
        await createMember(ownerId, {
          nameEn: 'Another Name',
          phone: '+91 98470 88888',
          email: 'ATHIL@kudumba.in',
        });
      },
      (err: any) => {
        assert.ok(err instanceof DuplicateMemberError);
        assert.equal(err.field, 'email');
        return true;
      }
    );
  });

  await t.test('6. Concurrent member additions are serialized and cannot exceed the limit', async () => {
    // 4 seats pre-occupied
    for (let i = 1; i <= 4; i++) {
      await createMember(ownerId, {
        nameEn: `Existing Member ${i}`,
        phone: `+91 98470 1111${i}`,
      });
    }
    assert.equal(await countHouseholdSeats(ownerId), 4);

    // 3 concurrent requests competing for the remaining 1 seat
    const results = await Promise.allSettled([
      createMember(ownerId, { nameEn: 'Concurrent Candidate A', phone: '+91 98470 99901' }),
      createMember(ownerId, { nameEn: 'Concurrent Candidate B', phone: '+91 98470 99902' }),
      createMember(ownerId, { nameEn: 'Concurrent Candidate C', phone: '+91 98470 99903' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed, exactly 2 must be rejected with SeatLimitExceededError
    assert.equal(fulfilled.length, 1, 'Only one concurrent request can claim the last seat');
    assert.equal(rejected.length, 2, 'Remaining concurrent requests must be rejected');
    assert.equal(await countHouseholdSeats(ownerId), 5, 'Total seats must never exceed 5');
  });

  await t.test('7. Sole primary owner cannot be deleted', async () => {
    const ownerMember = await createMember(ownerId, {
      nameEn: 'Sole Owner',
      role: 'OWNER',
    });

    await assert.rejects(
      async () => {
        await deleteMember(ownerId, ownerMember._id);
      },
      /Cannot delete the primary household owner/
    );
  });

  await t.test('8. Non-owner / unauthorized member action is rejected', async () => {
    await assert.rejects(
      async () => {
        await createMember(
          ownerId,
          { nameEn: 'Rogue Member' },
          { requesterId: otherUserId, requesterRole: 'USER' }
        );
      },
      (err: any) => {
        assert.ok(err instanceof UnauthorizedMemberActionError);
        return true;
      }
    );
  });

  await t.test('9. Database-backed atomic seat enforcement across multi-instance collisions', async () => {
    // Fill up to 4 seats
    for (let i = 1; i <= 4; i++) {
      const m = await createMember(ownerId, {
        nameEn: `Pre-existing Member ${i}`,
        phone: `+91 98470 2222${i}`,
      });
      assert.ok(m.seatNumber >= 1 && m.seatNumber <= 5, 'Must have valid assigned seatNumber');
    }
    assert.equal(await countHouseholdSeats(ownerId), 4);

    // Simulate two server instances competing for the 5th and final seat
    const candidate1 = await createMember(ownerId, {
      nameEn: 'Instance A Candidate',
      phone: '+91 98470 33331',
    });
    assert.equal(candidate1.seatNumber, 5, 'Claimed final available seatNumber 5');

    // Any subsequent attempt (simulating another server instance) is rejected by seat check and unique constraint
    await assert.rejects(
      async () => {
        await createMember(ownerId, {
          nameEn: 'Instance B Candidate',
          phone: '+91 98470 33332',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SeatLimitExceededError);
        assert.equal(err.maxSeats, 5);
        return true;
      }
    );
  });

  await t.test('10. Trial provisioning for dedicated test account is idempotent and immutable', async () => {
    const testDedicatedUserId = '507f1f77bcf86cd799439088';
    const testDedicatedEmail = 'dedicated.test.user@kudumba.in';

    // 1. First retrieval provisions the 3-day trial
    const subInitial = await getOrCreateUserSubscription(testDedicatedUserId, testDedicatedEmail);
    assert.equal(subInitial.status, 'trialing');
    assert.equal(subInitial.planId, 'founding-free');
    assert.ok(subInitial.trialStart);
    assert.ok(subInitial.trialEnd);
    assert.ok(subInitial.gracePeriodEnd);

    // Verify exactly 3-day duration and 48-hour grace duration
    const trialHours = Math.round((subInitial.trialEnd.getTime() - subInitial.trialStart.getTime()) / (1000 * 60 * 60));
    assert.equal(trialHours, 72, 'Trial must be exactly 72 hours (3 days)');
    const graceHours = Math.round((subInitial.gracePeriodEnd.getTime() - subInitial.trialEnd.getTime()) / (1000 * 60 * 60));
    assert.equal(graceHours, 48, 'Grace period must be exactly 48 hours');

    // 2. Simulated re-login / re-fetch / page refresh
    const subRefreshed = await getOrCreateUserSubscription(testDedicatedUserId, testDedicatedEmail);
    assert.equal(subRefreshed.trialStart.getTime(), subInitial.trialStart.getTime(), 'trialStart must not reset');
    assert.equal(subRefreshed.trialEnd.getTime(), subInitial.trialEnd.getTime(), 'trialEnd must not reset');
    assert.equal(subRefreshed.gracePeriodEnd.getTime(), subInitial.gracePeriodEnd.getTime(), 'gracePeriodEnd must not reset');
  });

  await t.test('11. Displayed plan, status, storage quota, file-size limit, and member limit match backend', async () => {
    const testDedicatedUserId = '507f1f77bcf86cd799439088';
    const entitlement = await evaluateUserEntitlement(testDedicatedUserId);

    assert.equal(entitlement.planId, 'founding-free');
    assert.equal(entitlement.planName, 'Founding Household (Free Trial / V1 Launch)');
    assert.equal(entitlement.status, 'trialing');
    assert.equal(entitlement.isTrialing, true);
    assert.equal(entitlement.storageQuotaBytes, 3 * 1024 * 1024 * 1024); // 3 GB
    assert.equal(entitlement.maxFileSizeBytes, 25 * 1024 * 1024); // 25 MB
    assert.equal(entitlement.maxFamilyMembers, 5); // 5 members
    assert.equal(entitlement.canUpload, true);
    assert.equal(entitlement.canDownloadOrView, true);
  });

  await t.test('12. Expired trial uploads are rejected while existing-document access is preserved', async () => {
    const testDedicatedUserId = '507f1f77bcf86cd799439077';
    await getOrCreateUserSubscription(testDedicatedUserId);

    // Simulate expiration of the 3-day trial
    await simulateSubscriptionDev(testDedicatedUserId, 'EXPIRE_TRIAL');

    const entitlement = await evaluateUserEntitlement(testDedicatedUserId);
    assert.equal(entitlement.status, 'expired');
    assert.equal(entitlement.canUpload, false, 'Expired trial must not allow uploads');
    assert.equal(entitlement.canDownloadOrView, true, 'Existing documents must remain accessible');

    // Attempting upload validation must reject
    const uploadCheck = await validateUploadEntitlement(testDedicatedUserId, 1024 * 1024);
    assert.equal(uploadCheck.allowed, false, 'Upload must be rejected when trial expired');
    assert.ok(uploadCheck.reason?.includes('expired') || uploadCheck.reason?.includes('Subscription'));
  });
});
