process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMemberSeatsUsage,
  MemberSeatsUsage,
} from '../utils/vaultLogic';
import { AUTHORITATIVE_PLANS, getPlanConfig } from '../config/planConfig';
import {
  createMember,
  listMembers,
  countHouseholdSeats,
  _resetMockMembers,
  SeatLimitExceededError,
} from './memberService';
import {
  _resetMockSubscriptions,
  getOrCreateUserSubscription,
  evaluateUserEntitlement,
  simulateSubscriptionDev,
} from './subscriptionService';
import {
  createPaymentRequest,
  submitPaymentProof,
  approvePaymentRequest,
} from './paymentService';
import { clearMockPaymentRequests } from '../models/PaymentRequest';
import { clearMockPaymentHistories } from '../models/PaymentHistory';

test('Kudumba Vault — Family Member Seat Allocation and Usage Display Regression Suite', async (t) => {
  const testUserId = '507f1f77bcf86cd799439123';
  const adminId = '507f1f77bcf86cd799439999';
  const adminEmail = 'admin@kudumbavault.com';

  const billingAddress = {
    fullName: 'Gulf Householder',
    houseBuilding: 'Villa 42',
    streetLocality: 'Al Nahda',
    city: 'Dubai',
    state: 'Dubai',
    country: 'United Arab Emirates',
    postalCode: '00000',
    phone: '+971501234567',
  };

  t.beforeEach(() => {
    _resetMockMembers();
    _resetMockSubscriptions();
    clearMockPaymentRequests();
    clearMockPaymentHistories();
  });

  await t.test('1. Free plan displays 0/5 seats and 5 free seats remaining with 0% consumption', async () => {
    // Authoritative Founding Free configuration check
    const freePlan = getPlanConfig('founding-free');
    assert.equal(freePlan.maxFamilyMembers, 5, 'Founding Free must have 5 family members quota');

    // Pure calculation validation
    const calc = calculateMemberSeatsUsage(0, freePlan.maxFamilyMembers);
    assert.equal(calc.currentMembers, 0);
    assert.equal(calc.maximumSeats, 5);
    assert.equal(calc.remainingSeats, 5);
    assert.equal(calc.usagePercentage, 0);
    assert.equal(calc.isLimitReached, false);
    assert.equal(calc.isLimitExceeded, false);

    // Backend entitlement validation
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.planId, 'founding-free');
    assert.equal(entitlement.maxFamilyMembers, 5);

    const seatsCount = await countHouseholdSeats(testUserId);
    assert.equal(seatsCount, 0);

    const uiCalc = calculateMemberSeatsUsage(seatsCount, entitlement.maxFamilyMembers);
    assert.equal(`${uiCalc.currentMembers} / ${uiCalc.maximumSeats} Seats`, '0 / 5 Seats');
    assert.equal(`${uiCalc.remainingSeats} free seats remaining`, '5 free seats remaining');
    assert.equal(uiCalc.usagePercentage, 0);
  });

  await t.test('2. NRI Family Plus displays 0/12 seats and 12 free seats remaining with 0% consumption', async () => {
    // Authoritative NRI Family Plus configuration check
    const nriPlan = getPlanConfig('nri-plus');
    assert.equal(nriPlan.maxFamilyMembers, 12, 'NRI Family Plus must have 12 family members quota');

    // Pure calculation validation
    const calc = calculateMemberSeatsUsage(0, nriPlan.maxFamilyMembers);
    assert.equal(calc.currentMembers, 0);
    assert.equal(calc.maximumSeats, 12);
    assert.equal(calc.remainingSeats, 12);
    assert.equal(calc.usagePercentage, 0);
    assert.equal(calc.isLimitReached, false);
    assert.equal(calc.isLimitExceeded, false);

    // Simulate NRI Plus upgrade
    await simulateSubscriptionDev(testUserId, 'SIMULATE_UPGRADE');
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.planId, 'nri-plus');
    assert.equal(entitlement.maxFamilyMembers, 12);

    const seatsCount = await countHouseholdSeats(testUserId);
    assert.equal(seatsCount, 0);

    const uiCalc = calculateMemberSeatsUsage(seatsCount, entitlement.maxFamilyMembers);
    assert.equal(`${uiCalc.currentMembers} / ${uiCalc.maximumSeats} Seats`, '0 / 12 Seats');
    assert.equal(`${uiCalc.remainingSeats} free seats remaining`, '12 free seats remaining');
    assert.equal(uiCalc.usagePercentage, 0);
  });

  await t.test('3. NRI Family Plus with 12 members displays 12/12 seats, 0 free seats, and 100% progress', async () => {
    // Activate NRI Plus
    await simulateSubscriptionDev(testUserId, 'SIMULATE_UPGRADE');
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.maxFamilyMembers, 12);

    // Populate exactly 12 family members
    for (let i = 1; i <= 12; i++) {
      await createMember(testUserId, {
        nameEn: `Family Member ${i}`,
        phone: `+91 98470 110${i < 10 ? '0' + i : i}`,
      });
    }

    const currentSeats = await countHouseholdSeats(testUserId);
    assert.equal(currentSeats, 12);

    const calc = calculateMemberSeatsUsage(currentSeats, entitlement.maxFamilyMembers);
    assert.equal(calc.currentMembers, 12);
    assert.equal(calc.maximumSeats, 12);
    assert.equal(calc.remainingSeats, 0, 'Remaining seats must be exactly 0');
    assert.equal(calc.usagePercentage, 100, 'Usage percentage must be exactly 100%');
    assert.equal(calc.isLimitReached, true);
    assert.equal(calc.isLimitExceeded, false);

    // Expected UI display strings
    assert.equal(`${calc.currentMembers} / ${calc.maximumSeats} Seats`, '12 / 12 Seats');
    assert.equal(`${calc.remainingSeats} free seats remaining`, '0 free seats remaining');
  });

  await t.test('4. Remaining seats never become negative, even if members exceed seat quota', () => {
    // Scenario A: 12 members on a 5-seat quota (e.g. post-downgrade)
    const calcExceeded = calculateMemberSeatsUsage(12, 5);
    assert.equal(calcExceeded.currentMembers, 12);
    assert.equal(calcExceeded.maximumSeats, 5);
    assert.equal(calcExceeded.remainingSeats, 0, 'Remaining seats must NEVER be negative (expected 0, not -7)');
    assert.equal(calcExceeded.usagePercentage, 100, 'Usage percentage must be clamped at 100%');
    assert.equal(calcExceeded.isLimitReached, true);
    assert.equal(calcExceeded.isLimitExceeded, true);

    // Scenario B: Boundary zero and missing limits
    const calcZeroQuota = calculateMemberSeatsUsage(3, 0);
    assert.equal(calcZeroQuota.remainingSeats, 0);
    assert.equal(calcZeroQuota.usagePercentage, 0, 'Zero quota should not produce NaN');

    const calcNull = calculateMemberSeatsUsage(null, null);
    assert.equal(calcNull.currentMembers, 0);
    assert.equal(calcNull.maximumSeats, 0);
    assert.equal(calcNull.remainingSeats, 0);
    assert.equal(calcNull.usagePercentage, 0);
  });

  await t.test('5. Partners & Societies displays the 50-seat limit', async () => {
    const partnerPlan = getPlanConfig('partner-pro');
    assert.equal(partnerPlan.maxFamilyMembers, 50, 'Partners & Societies must have 50 seats limit');

    // Test seat usage calculations for 15 out of 50 seats
    const calc15 = calculateMemberSeatsUsage(15, partnerPlan.maxFamilyMembers);
    assert.equal(calc15.currentMembers, 15);
    assert.equal(calc15.maximumSeats, 50);
    assert.equal(calc15.remainingSeats, 35);
    assert.equal(calc15.usagePercentage, 30);
    assert.equal(`${calc15.currentMembers} / ${calc15.maximumSeats} Seats`, '15 / 50 Seats');

    // Test seat usage calculations for 50 out of 50 seats
    const calc50 = calculateMemberSeatsUsage(50, partnerPlan.maxFamilyMembers);
    assert.equal(calc50.currentMembers, 50);
    assert.equal(calc50.maximumSeats, 50);
    assert.equal(calc50.remainingSeats, 0);
    assert.equal(calc50.usagePercentage, 100);
    assert.equal(calc50.isLimitReached, true);
  });

  await t.test('6. Payment approval refreshes member entitlements from 5 to 12 seats', async () => {
    // Initially on Founding Free
    const initialEntitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(initialEntitlement.planId, 'founding-free');
    assert.equal(initialEntitlement.maxFamilyMembers, 5);

    // User creates payment request for NRI Family Plus
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress,
    });
    const reqId = req.id || req._id.toString();

    // User submits payment proof
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'UPISBI2026103099',
      paymentDate: new Date().toISOString(),
    });

    // Admin verifies and approves payment request
    const approvalResult = await approvePaymentRequest(adminId, adminEmail, reqId);
    assert.equal(approvalResult.request.status, 'APPROVED');
    assert.equal(approvalResult.subscription.planId, 'nri-plus');

    // Entitlement must now authoritatively reflect 12 family members
    const refreshedEntitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(refreshedEntitlement.status, 'active');
    assert.equal(refreshedEntitlement.planId, 'nri-plus');
    assert.equal(refreshedEntitlement.planName, 'NRI Family Plus');
    assert.equal(refreshedEntitlement.maxFamilyMembers, 12, 'Entitlement must refresh to 12 seats after approval');
  });

  await t.test('7. Existing family members remain unchanged after an upgrade', async () => {
    // User starts with 5 members on Founding Free
    for (let i = 1; i <= 5; i++) {
      await createMember(testUserId, {
        nameEn: `Initial Member ${i}`,
        phone: `+91 98470 2200${i}`,
      });
    }

    const membersBefore = await listMembers(testUserId);
    assert.equal(membersBefore.length, 5);
    const memberNamesBefore = membersBefore.map((m) => m.nameEn).sort();

    // Upgrade to NRI Family Plus approved
    const req = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'yearly',
      billingAddress,
    });
    const reqId = req.id || req._id.toString();

    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'UPIUPGRADE20261030',
      paymentDate: new Date().toISOString(),
    });

    await approvePaymentRequest(adminId, adminEmail, reqId);

    // Verify all 5 existing members are strictly preserved
    const membersAfter = await listMembers(testUserId);
    assert.equal(membersAfter.length, 5, 'Existing members count must not change upon plan upgrade');
    const memberNamesAfter = membersAfter.map((m) => m.nameEn).sort();
    assert.deepEqual(memberNamesAfter, memberNamesBefore, 'Existing member records must remain intact');
    assert.equal(await countHouseholdSeats(testUserId), 5);
  });

  await t.test('8. Backend prevents adding a 13th member to NRI Family Plus', async () => {
    // Activate NRI Family Plus
    await simulateSubscriptionDev(testUserId, 'SIMULATE_UPGRADE');
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.maxFamilyMembers, 12);

    // Add 12 members
    for (let i = 1; i <= 12; i++) {
      await createMember(testUserId, {
        nameEn: `NRI Member ${i}`,
        phone: `+971 50 11000${i < 10 ? '0' + i : i}`,
      });
    }
    assert.equal(await countHouseholdSeats(testUserId), 12);

    // Attempting to add a 13th member must strictly throw SeatLimitExceededError
    await assert.rejects(
      async () => {
        await createMember(testUserId, {
          nameEn: 'NRI Member 13',
          phone: '+971 50 9999999',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SeatLimitExceededError);
        assert.equal(err.maxSeats, 12);
        assert.equal(err.currentSeats, 12);
        assert.equal(err.planName, 'NRI Family Plus');
        return true;
      }
    );

    // Total seat count remains firmly 12
    assert.equal(await countHouseholdSeats(testUserId), 12);
  });

  await t.test('9. Downgrade preserves existing members but rejects further additions until within new quota', async () => {
    // Start on NRI Family Plus and add 7 members
    await simulateSubscriptionDev(testUserId, 'SIMULATE_UPGRADE');
    for (let i = 1; i <= 7; i++) {
      await createMember(testUserId, {
        nameEn: `Family Member ${i}`,
        phone: `+91 98470 3300${i}`,
      });
    }
    assert.equal(await countHouseholdSeats(testUserId), 7);

    // Simulate downgrade/expiration to Founding Free (5 seats quota)
    await simulateSubscriptionDev(testUserId, 'START_TRIAL');
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.planId, 'founding-free');
    assert.equal(entitlement.maxFamilyMembers, 5);

    // All 7 existing members remain preserved
    const membersAfterDowngrade = await listMembers(testUserId);
    assert.equal(membersAfterDowngrade.length, 7, 'Existing members must be preserved after downgrade');

    // UI calculation never shows negative seats
    const uiSeats = calculateMemberSeatsUsage(membersAfterDowngrade.length, entitlement.maxFamilyMembers);
    assert.equal(uiSeats.remainingSeats, 0, 'Remaining seats must be clamped to 0, never negative');
    assert.equal(uiSeats.usagePercentage, 100);
    assert.equal(uiSeats.isLimitExceeded, true);

    // Backend strictly prevents adding an 8th member because 7 >= 5
    await assert.rejects(
      async () => {
        await createMember(testUserId, {
          nameEn: 'Extra Member 8',
          phone: '+91 98470 99998',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SeatLimitExceededError);
        assert.equal(err.maxSeats, 5);
        assert.equal(err.currentSeats, 7);
        return true;
      }
    );
  });
});
