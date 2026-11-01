process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_DB = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlanPricing,
  createPaymentRequest,
  submitPaymentProof,
  cancelPaymentRequest,
  approvePaymentRequest,
  rejectPaymentRequest,
  getAdminPaymentRequests,
  getUserCurrentPaymentStatus,
  getUpiPaymentConfig,
  updateUpiPaymentConfig,
} from './paymentService';
import { clearMockPaymentRequests, getMockPaymentRequests } from '../models/PaymentRequest';
import { clearMockPaymentHistories } from '../models/PaymentHistory';
import { _resetMockSubscriptions, evaluateUserEntitlement } from './subscriptionService';
import { buildUpiPaymentUri, generateQrSvg, generateQrDataUrl } from '../utils/qrCodeGenerator';

test('Kudumba Vault — Manual UPI QR Subscription System & Admin Approval Engine', async (t) => {
  const testUserId = '507f1f77bcf86cd799439099';
  const testUserId2 = '507f1f77bcf86cd799439098';
  const adminId = '507f1f77bcf86cd799439001';
  const adminEmail = 'admin@kudumbavault.com';

  const validBillingAddress = {
    fullName: 'Anand Menon',
    houseBuilding: 'Sobha Silver Tower Flat 4B',
    streetLocality: 'Kaloor Road',
    city: 'Kochi',
    state: 'Kerala',
    country: 'India',
    postalCode: '682017',
    phone: '+91 98470 12345',
  };

  t.beforeEach(() => {
    clearMockPaymentRequests();
    clearMockPaymentHistories();
    _resetMockSubscriptions();
  });

  await t.test('1. Plan Pricing Engine: validates monthly, quarterly, and annual rates with coupon discounts', async () => {
    // NRI Plus (₹99/mo) - 1 Month: 0 discount
    const monthly = calculatePlanPricing('nri-plus', 'monthly');
    assert.equal(monthly.monthlyRate, 99);
    assert.equal(monthly.durationMonths, 1);
    assert.equal(monthly.baseTotal, 99);
    assert.equal(monthly.planSavings, 0);
    assert.equal(monthly.finalPayable, 99);

    // NRI Plus - 3 Months: savings 39 (₹297 - ₹39 = ₹258)
    const quarterly = calculatePlanPricing('nri-plus', 'quarterly');
    assert.equal(quarterly.durationMonths, 3);
    assert.equal(quarterly.baseTotal, 297);
    assert.equal(quarterly.planSavings, 39);
    assert.equal(quarterly.finalPayable, 258);

    // NRI Plus - 12 Months: 20% discount (₹1188 - ₹238 = ₹950)
    const yearly = calculatePlanPricing('nri-plus', 'yearly');
    assert.equal(yearly.durationMonths, 12);
    assert.equal(yearly.baseTotal, 1188);
    assert.equal(yearly.planSavings, 238);
    assert.equal(yearly.finalPayable, 950);

    // Coupon application: KUDUMBA10 (10% off payable amount)
    const withCoupon = calculatePlanPricing('nri-plus', 'monthly', 'KUDUMBA10');
    assert.equal(withCoupon.couponCode, 'KUDUMBA10');
    assert.equal(withCoupon.couponDiscount, 10);
    assert.equal(withCoupon.finalPayable, 89);

    // Coupon FESTIE33 (33% off payable amount)
    const festieCoupon = calculatePlanPricing('nri-plus', 'monthly', 'FESTIE33');
    assert.equal(festieCoupon.couponCode, 'FESTIE33');
    assert.equal(festieCoupon.couponDiscount, 33);
    assert.equal(festieCoupon.finalPayable, 66);

    // Invalid coupon code throws descriptive error
    assert.throws(
      () => calculatePlanPricing('nri-plus', 'monthly', 'BOGUS99'),
      /Invalid or expired coupon code/
    );

    // Rejects non-billable / free plan for manual checkout
    assert.throws(
      () => calculatePlanPricing('founding-free', 'monthly'),
      /cannot be billed via manual payment/
    );
  });

  await t.test('2. Billing Address Validation: rejects missing required fields and invalid phone numbers', async () => {
    // Missing city
    await assert.rejects(
      async () => {
        await createPaymentRequest(testUserId, {
          planId: 'nri-plus',
          duration: 'monthly',
          billingAddress: { ...validBillingAddress, city: '' },
        });
      },
      /City is required/
    );

    // Missing postal code
    await assert.rejects(
      async () => {
        await createPaymentRequest(testUserId, {
          planId: 'nri-plus',
          duration: 'monthly',
          billingAddress: { ...validBillingAddress, postalCode: '' },
        });
      },
      /Postal PIN code is required/
    );

    // Invalid phone number
    await assert.rejects(
      async () => {
        await createPaymentRequest(testUserId, {
          planId: 'nri-plus',
          duration: 'monthly',
          billingAddress: { ...validBillingAddress, phone: '123' },
        });
      },
      /Valid contact phone number is required/
    );
  });

  await t.test('3. Payment Request Lifecycle: creates pending request with verified server pricing', async () => {
    const request = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      couponCode: 'KUDUMBA10',
      billingAddress: validBillingAddress,
    });

    assert.ok(request._id || request.id);
    assert.equal(request.status, 'PENDING');
    assert.equal(request.subscriptionPlanId, 'nri-plus');
    assert.equal(request.payableAmount, 89);
    assert.equal(request.billingAddressSnapshot.city, 'Kochi');

    // Retrieve active request via status helper
    const status = await getUserCurrentPaymentStatus(testUserId);
    assert.ok(status.activeRequest);
    assert.equal(status.activeRequest?.status, 'PENDING');
    assert.equal(status.activeRequest?.payableAmount, 89);
  });

  await t.test('4. Concurrency Guard: strictly rejects creating a second request while one is pending', async () => {
    await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });

    // Attempt duplicate creation
    await assert.rejects(
      async () => {
        await createPaymentRequest(testUserId, {
          planId: 'partner-pro',
          duration: 'yearly',
          billingAddress: validBillingAddress,
        });
      },
      /A subscription change is already pending/
    );
  });

  await t.test('5. User Request Cancellation: allows user to cancel own pending request and re-apply', async () => {
    const request = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });

    const reqId = request.id || request._id.toString();

    // Another user cannot cancel this request
    await assert.rejects(
      async () => {
        await cancelPaymentRequest(testUserId2, reqId);
      },
      /Payment request does not belong to the current user/
    );

    // Owner cancels request
    const result = await cancelPaymentRequest(testUserId, reqId);
    assert.equal(result, true);

    const cancelledReq = getMockPaymentRequests().get(reqId);
    assert.equal(cancelledReq.status, 'CANCELLED');

    // User is now eligible to create a new request
    const newRequest = await createPaymentRequest(testUserId, {
      planId: 'partner-pro',
      duration: 'quarterly',
      billingAddress: validBillingAddress,
    });

    assert.equal(newRequest.status, 'PENDING');
    assert.equal(newRequest.subscriptionPlanId, 'partner-pro');
  });

  await t.test('6. Payment Proof Submission & UTR Validation: enforces regex, uniqueness, and date bounds', async () => {
    const request = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });

    const reqId = request.id || request._id.toString();

    // Invalid short UTR
    await assert.rejects(
      async () => {
        await submitPaymentProof(testUserId, {
          requestId: reqId,
          utrNumber: '1234',
          paymentDate: new Date().toISOString(),
        });
      },
      /Invalid UTR format/
    );

    // Invalid symbols in UTR
    await assert.rejects(
      async () => {
        await submitPaymentProof(testUserId, {
          requestId: reqId,
          utrNumber: 'UTR@#$999999',
          paymentDate: new Date().toISOString(),
        });
      },
      /Invalid UTR format/
    );

    // Future payment date rejected (> 5 min)
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await assert.rejects(
      async () => {
        await submitPaymentProof(testUserId, {
          requestId: reqId,
          utrNumber: '402812345678',
          paymentDate: futureDate,
        });
      },
      /Payment date cannot be in the future/
    );

    // Successful submission
    const validUtr = '402812345678';
    const updated = await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: validUtr,
      paymentDate: new Date().toISOString(),
    });

    assert.equal(updated.utrNumber, validUtr);
    assert.ok(updated.paymentDate);

    // Another user cannot submit the exact same UTR
    const request2 = await createPaymentRequest(testUserId2, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId2 = request2.id || request2._id.toString();

    await assert.rejects(
      async () => {
        await submitPaymentProof(testUserId2, {
          requestId: reqId2,
          utrNumber: validUtr,
          paymentDate: new Date().toISOString(),
        });
      },
      /already been submitted/
    );
  });

  await t.test('7. Admin Approval Workflow: activates plan, computes period, creates financial records', async () => {
    // Initial entitlement is free trial
    const initialEntitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(initialEntitlement.planId, 'founding-free');
    assert.equal(initialEntitlement.storageQuotaBytes, 3 * 1024 * 1024 * 1024);
    assert.equal(initialEntitlement.maxFamilyMembers, 5);

    // Create request for NRI Plus (15GB storage, 12 family members)
    const request = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = request.id || request._id.toString();

    // Admin CANNOT approve request before user submits UTR
    await assert.rejects(
      async () => {
        await approvePaymentRequest(adminId, adminEmail, reqId);
      },
      /Cannot approve request without a submitted UTR/
    );

    // User submits valid UTR
    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'HDFC98765432101',
      paymentDate: new Date().toISOString(),
    });

    // Admin verifies and approves
    const { request: approvedReq, subscription } = await approvePaymentRequest(
      adminId,
      adminEmail,
      reqId
    );

    assert.equal(approvedReq.status, 'APPROVED');
    assert.equal(subscription.status, 'active');
    assert.equal(subscription.planId, 'nri-plus');
    assert.equal(subscription.retentionStatus, 'retained_paid');

    // Period end should be ~30 days in the future
    const daysUntilExpiry = Math.round(
      (new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    assert.ok(daysUntilExpiry >= 29 && daysUntilExpiry <= 31);

    // Verify user entitlement is atomically elevated to 15GB and 12 family members
    const upgradedEntitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(upgradedEntitlement.status, 'active');
    assert.equal(upgradedEntitlement.planId, 'nri-plus');
    assert.equal(upgradedEntitlement.canUpload, true);
    assert.equal(upgradedEntitlement.storageQuotaBytes, 15 * 1024 * 1024 * 1024);
    assert.equal(upgradedEntitlement.maxFamilyMembers, 12);

    // Preventing duplicate approval
    await assert.rejects(
      async () => {
        await approvePaymentRequest(adminId, adminEmail, reqId);
      },
      /Cannot approve request. Status is already APPROVED/
    );
  });

  await t.test('8. Admin Rejection Workflow: requires mandatory reason and keeps subscription intact', async () => {
    const request = await createPaymentRequest(testUserId, {
      planId: 'partner-pro',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    const reqId = request.id || request._id.toString();

    await submitPaymentProof(testUserId, {
      requestId: reqId,
      utrNumber: 'FAKEUTR12345678',
      paymentDate: new Date().toISOString(),
    });

    // Rejection without reason fails
    await assert.rejects(
      async () => {
        await rejectPaymentRequest(adminId, adminEmail, reqId, '');
      },
      /at least 5 characters/
    );

    // Rejection with too short reason fails
    await assert.rejects(
      async () => {
        await rejectPaymentRequest(adminId, adminEmail, reqId, 'no');
      },
      /at least 5 characters/
    );

    // Admin rejects with valid explanation
    const rejectedReq = await rejectPaymentRequest(
      adminId,
      adminEmail,
      reqId,
      'UTR not found in bank statement for this timestamp.'
    );

    assert.equal(rejectedReq.status, 'REJECTED');
    assert.equal(rejectedReq.rejectionReason, 'UTR not found in bank statement for this timestamp.');

    // Subscription remains unchanged (founding-free / trialing)
    const entitlement = await evaluateUserEntitlement(testUserId);
    assert.equal(entitlement.planId, 'founding-free');

    // Active request is cleared/rejected
    const status = await getUserCurrentPaymentStatus(testUserId);
    assert.equal(status.activeRequest?.status, 'REJECTED');
    assert.equal(status.activeRequest?.rejectionReason, 'UTR not found in bank statement for this timestamp.');
  });

  await t.test('9. Admin Listing & Filtering: correctly returns pending requests', async () => {
    const req1 = await createPaymentRequest(testUserId, {
      planId: 'nri-plus',
      duration: 'monthly',
      billingAddress: validBillingAddress,
    });
    await submitPaymentProof(testUserId, {
      requestId: req1.id || req1._id.toString(),
      utrNumber: 'UTRONE12345678',
      paymentDate: new Date().toISOString(),
    });

    const pending = await getAdminPaymentRequests('PENDING');
    assert.ok(pending.length >= 1);
    assert.equal(pending[0].status, 'PENDING');
  });

  await t.test('10. Pure Vector QR Code & UPI URI Generator: produces valid vector standards', async () => {
    const upiUri = buildUpiPaymentUri({
      upiId: 'kudumbavault@icici',
      merchantName: 'Kudumba Vault Technologies',
      amount: 249,
      refId: 'REQ-12345678',
    });

    assert.ok(upiUri.startsWith('upi://pay?'));
    assert.ok(upiUri.includes('pa=kudumbavault%40icici'));
    assert.ok(upiUri.includes('pn=Kudumba%20Vault%20Technologies'));
    assert.ok(upiUri.includes('am=249.00'));
    assert.ok(upiUri.includes('cu=INR'));

    const svg = generateQrSvg(upiUri, { sizePx: 200 });
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('width="200"'));
    assert.ok(svg.includes('height="200"'));
    assert.ok(svg.includes('viewBox='));
    assert.ok(svg.includes('</svg>'));

    const dataUrl = generateQrDataUrl(upiUri, { sizePx: 200 });
    assert.ok(dataUrl.startsWith('data:image/svg+xml;utf8,'));
  });

  await t.test('11. UPI Configuration Management: validates UPI ID and persists settings', async () => {
    const config = await getUpiPaymentConfig();
    assert.ok(config.upiId);
    assert.ok(config.merchantName);

    // Invalid UPI ID format
    await assert.rejects(
      async () => {
        await updateUpiPaymentConfig({ upiId: 'invalid-upi-without-at' });
      },
      /Invalid UPI ID format/
    );

    // Valid update
    const updated = await updateUpiPaymentConfig({
      upiId: 'vault.kerala@okhdfcbank',
      merchantName: 'Kudumba Vault LLC',
    });
    assert.equal(updated.upiId, 'vault.kerala@okhdfcbank');
    assert.equal(updated.merchantName, 'Kudumba Vault LLC');
  });
});
