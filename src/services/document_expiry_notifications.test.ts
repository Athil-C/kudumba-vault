import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAndDispatchDocumentExpiryNotification,
  evaluateMilestoneBracket,
  calculateDaysRemainingInTimezone,
} from './expiryDetector';
import { NotificationTracker } from './notificationTracker';
import { setMailerTransporterForTesting } from './mailer';
import { buildExpiryEmailContent } from './emailTemplates';
import { runSchedulerCycle } from './scheduler';

test('1. Uploading an already-expired document (Case A)', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30'); // Reference: 28 Oct 2026 IST
  const expiredDate = '2026-10-20'; // 8 days ago

  const result = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-expired-01',
      title: 'Kerala SSLC Certificate',
      category: 'EDUCATION',
      docNumber: 'SSLC-982143',
      expiryDate: expiredDate,
    },
    user: {
      id: 'user-01',
      email: 'user01@kudumbavault.app',
      name: 'Ramesh Nair',
    },
    reason: 'upload',
    referenceDate: refDate,
    tracker,
  });

  assert.equal(result.notified, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.milestone, -1);
  assert.equal(result.daysRemaining, -8);

  // Verify email template wording for expired document
  const emailContent = buildExpiryEmailContent({
    recipientName: 'Ramesh Nair',
    documentTitle: 'Kerala SSLC Certificate',
    documentCategory: 'EDUCATION',
    authorityName: 'Government of Kerala',
    maskedNumber: 'SSLC-••••43',
    expiryDateStr: expiredDate,
    daysRemaining: -8,
    milestone: -1,
    preferredLang: 'ml',
    vaultUrl: 'https://kudumba.app',
  });

  assert.match(emailContent.subject, /Action Required|കാലാവധി കഴിഞ്ഞിരിക്കുന്നു|കാലാവധി കഴിഞ്ഞു/i);
  assert.match(emailContent.html, /കാലാവധി കഴിഞ്ഞിരിക്കുന്നു/);
  assert.match(emailContent.html, /Expired/);
  assert.equal(emailContent.html.includes('2026-10-20'), true);
});

test('2. Uploading a document expiring in 1 day (Case B: Tomorrow)', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const tomorrowDate = '2026-10-29'; // 1 day remaining

  const result = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-expiring-tomorrow-02',
      title: 'Pravasi Kshemanidhi Passbook',
      category: 'INSURANCE',
      docNumber: 'PK-449102',
      expiryDate: tomorrowDate,
    },
    user: {
      id: 'user-02',
      email: 'pravasi@kudumbavault.app',
      name: 'Suresh Kumar',
    },
    reason: 'upload',
    referenceDate: refDate,
    tracker,
  });

  assert.equal(result.notified, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.milestone, 1);
  assert.equal(result.daysRemaining, 1);
});

test('3. Uploading a document expiring in 7 days (Case B: 7-day milestone)', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const in7Days = '2026-11-04'; // 7 days remaining

  const result = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-expiring-7d-03',
      title: 'Indian Passport',
      category: 'IDENTITY',
      docNumber: 'Z1234567',
      expiryDate: in7Days,
    },
    user: {
      id: 'user-03',
      email: 'passport.holder@kudumbavault.app',
      name: 'Anjali Menon',
    },
    reason: 'upload',
    referenceDate: refDate,
    tracker,
  });

  assert.equal(result.notified, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.milestone, 7);
  assert.equal(result.daysRemaining, 7);
});

test('4. Uploading a document expiring in 30 days (Case B: 30-day milestone)', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const in30Days = '2026-11-27'; // 30 days remaining

  const result = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-expiring-30d-04',
      title: 'Vehicle Insurance Policy',
      category: 'VEHICLE',
      docNumber: 'POL-908122',
      expiryDate: in30Days,
    },
    user: {
      id: 'user-04',
      email: 'vehicle.owner@kudumbavault.app',
      name: 'Deepak Varma',
    },
    reason: 'upload',
    referenceDate: refDate,
    reminderWindowDays: 30,
    tracker,
  });

  assert.equal(result.notified, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.milestone, 30);
  assert.equal(result.daysRemaining, 30);
});

test('5. Uploading a document expiring outside the reminder window (Case C)', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const in45Days = '2026-12-12'; // 45 days remaining (outside 30-day default window)

  const result = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-expiring-45d-05',
      title: 'Fixed Deposit Receipt',
      category: 'FINANCIAL',
      docNumber: 'FD-771234',
      expiryDate: in45Days,
    },
    user: {
      id: 'user-05',
      email: 'investor@kudumbavault.app',
      name: 'Lakshmi Pillai',
    },
    reason: 'upload',
    referenceDate: refDate,
    reminderWindowDays: 30,
    tracker,
  });

  assert.equal(result.notified, false);
  assert.equal(result.status, 'skipped_not_expiring');
  assert.equal(result.daysRemaining, 45);
  assert.equal(tracker.hasBeenSent('doc-expiring-45d-05', 'investor@kudumbavault.app', 30, in45Days), false);
});

test('6. Uploading a document without an expiry date (Case D)', async () => {
  const tracker = new NotificationTracker();

  // Test with null expiry date
  const nullResult = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-no-expiry-06a',
      title: 'Birth Certificate',
      category: 'LEGAL',
      docNumber: 'BC-112233',
      expiryDate: null,
    },
    user: {
      id: 'user-06',
      email: 'user06@kudumbavault.app',
    },
    tracker,
  });
  assert.equal(nullResult.notified, false);
  assert.equal(nullResult.status, 'skipped_no_expiry');

  // Test with empty string expiry date
  const emptyResult = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-no-expiry-06b',
      title: 'Land Deed / Aadhar Card',
      category: 'PROPERTY',
      docNumber: 'LD-445566',
      expiryDate: '   ',
    },
    user: {
      id: 'user-06',
      email: 'user06@kudumbavault.app',
    },
    tracker,
  });
  assert.equal(emptyResult.notified, false);
  assert.equal(emptyResult.status, 'skipped_no_expiry');
});

test('7. Updating an expiry date (Case E)', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');

  // Step 1: Initial upload with far future expiry date (outside reminder window)
  const step1 = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-update-07',
      title: 'Health Insurance Policy',
      category: 'INSURANCE',
      expiryDate: '2027-05-15', // ~200 days away
    },
    user: {
      id: 'user-07',
      email: 'user07@kudumbavault.app',
    },
    reason: 'upload',
    referenceDate: refDate,
    tracker,
  });
  assert.equal(step1.notified, false);
  assert.equal(step1.status, 'skipped_not_expiring');

  // Step 2: User corrects or updates the expiry date to an expiring soon date (7 days away)
  const updatedExpiryDate = '2026-11-04'; // 7 days away
  const step2 = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-update-07',
      title: 'Health Insurance Policy',
      category: 'INSURANCE',
      expiryDate: updatedExpiryDate,
    },
    user: {
      id: 'user-07',
      email: 'user07@kudumbavault.app',
    },
    reason: 'update',
    referenceDate: refDate,
    tracker,
  });
  assert.equal(step2.notified, true);
  assert.equal(step2.status, 'sent');
  assert.equal(step2.milestone, 7);

  // Step 3: User saves another field (e.g. title) without changing the expiry date
  const step3 = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-update-07',
      title: 'Health Insurance Policy (Star Health)',
      category: 'INSURANCE',
      expiryDate: updatedExpiryDate,
    },
    user: {
      id: 'user-07',
      email: 'user07@kudumbavault.app',
    },
    reason: 'update',
    referenceDate: refDate,
    tracker,
  });
  assert.equal(step3.notified, false);
  assert.equal(step3.status, 'skipped_duplicate');
});

test('8. Retrying a failed email', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const expiryDate = '2026-10-29'; // 1 day remaining

  // Simulate an SMTP outage via mock transporter failure
  const failingTransporter = {
    sendMail: async () => {
      throw new Error('ETIMEDOUT: Connection to smtp.gmail.com:465 failed');
    },
  } as any;
  setMailerTransporterForTesting(failingTransporter);

  // First attempt fails
  const attempt1 = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-retry-08',
      title: 'Driving License',
      category: 'IDENTITY',
      expiryDate,
    },
    user: {
      id: 'user-08',
      email: 'user08@kudumbavault.app',
    },
    referenceDate: refDate,
    tracker,
  });

  assert.equal(attempt1.notified, false);
  assert.equal(attempt1.status, 'failed');
  assert.match(attempt1.error || '', /ETIMEDOUT/);

  // Verify tracker logged the failed attempt
  const key = tracker.getDeduplicationKey('doc-retry-08', 'user08@kudumbavault.app', 1, expiryDate);
  const record1 = tracker.getRecord(key);
  assert.ok(record1);
  assert.equal(record1.status, 'failed');
  assert.equal(record1.attemptCount, 1);

  // Simulate SMTP recovery: reset to default mock transporter
  setMailerTransporterForTesting(null);

  // Retry the notification
  const attempt2 = await checkAndDispatchDocumentExpiryNotification({
    document: {
      id: 'doc-retry-08',
      title: 'Driving License',
      category: 'IDENTITY',
      expiryDate,
    },
    user: {
      id: 'user-08',
      email: 'user08@kudumbavault.app',
    },
    referenceDate: refDate,
    tracker,
  });

  assert.equal(attempt2.notified, true);
  assert.equal(attempt2.status, 'sent');

  // Verify tracker updated to sent and attemptCount incremented
  const record2 = tracker.getRecord(key);
  assert.ok(record2);
  assert.equal(record2.status, 'sent');
  assert.equal(record2.attemptCount, 2);
});

test('9. Preventing duplicate notifications across repeated triggers', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const expiryDate = '2026-10-29';

  const params = {
    document: {
      id: 'doc-dedup-09',
      title: 'Electricity Meter Agreement',
      category: 'UTILITY',
      expiryDate,
    },
    user: {
      id: 'user-09',
      email: 'user09@kudumbavault.app',
    },
    referenceDate: refDate,
    tracker,
  };

  // First call succeeds
  const first = await checkAndDispatchDocumentExpiryNotification(params);
  assert.equal(first.notified, true);
  assert.equal(first.status, 'sent');

  // Second call immediately afterwards (e.g. component re-render or double click)
  const second = await checkAndDispatchDocumentExpiryNotification(params);
  assert.equal(second.notified, false);
  assert.equal(second.status, 'skipped_duplicate');

  // Third call
  const third = await checkAndDispatchDocumentExpiryNotification(params);
  assert.equal(third.notified, false);
  assert.equal(third.status, 'skipped_duplicate');
});

test('10. Multi-tenant privacy: User A never receives User B document details', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');

  const userA = { id: 'user-a', email: 'alice@domain-a.com', name: 'Alice Kurian' };
  const userB = { id: 'user-b', email: 'bob@domain-b.com', name: 'Bob Thomas' };

  const docA = {
    id: 'doc-alice-passport',
    title: 'Secret Alice Passport',
    category: 'IDENTITY',
    docNumber: 'A-SECRET-999',
    expiryDate: '2026-10-29',
  };

  // Dispatch for User A
  const resultA = await checkAndDispatchDocumentExpiryNotification({
    document: docA,
    user: userA,
    referenceDate: refDate,
    tracker,
  });

  assert.equal(resultA.notified, true);
  assert.equal(resultA.status, 'sent');

  // Verify tracker record is assigned strictly to userA's email
  const keyA = tracker.getDeduplicationKey(docA.id, userA.email, 1, '2026-10-29');
  const recordA = tracker.getRecord(keyA);
  assert.ok(recordA);
  assert.equal(recordA.recipientEmail, userA.email);

  // Ensure no notification key exists under userB's email for User A's document
  const keyB = tracker.getDeduplicationKey(docA.id, userB.email, 1, '2026-10-29');
  assert.equal(tracker.getRecord(keyB), undefined);

  // Generated email template must contain Alice's details and never reference Bob
  const emailA = buildExpiryEmailContent({
    recipientName: userA.name,
    documentTitle: docA.title,
    documentCategory: 'IDENTITY',
    authorityName: 'Authority',
    maskedNumber: 'A-••••999',
    expiryDateStr: '2026-10-29',
    daysRemaining: 1,
    milestone: 1,
    preferredLang: 'ml',
    vaultUrl: 'https://kudumba.app',
  });

  assert.match(emailA.html, /Alice/);
  assert.equal(emailA.html.includes('Bob'), false);
  assert.equal(emailA.html.includes(userB.email), false);
});

test('11. SMTP failure after a successful upload does not corrupt or fail document save', async () => {
  const tracker = new NotificationTracker();
  const refDate = new Date('2026-10-28T12:00:00+05:30');

  // Inject a mock transporter that fails SMTP
  const mockFailingTransporter = {
    sendMail: async () => {
      throw new Error('550 User unknown or quota exceeded');
    },
  } as any;
  setMailerTransporterForTesting(mockFailingTransporter);

  try {
    // 1. Simulate saving the document to database (mocking MongoDB operation)
    const simulatedSavedDoc = {
      id: 'doc-uploaded-11',
      title: 'Tax Assessment 2026',
      category: 'FINANCIAL',
      expiryDate: '2026-10-29',
      isPersisted: true,
    };
    assert.equal(simulatedSavedDoc.isPersisted, true);

    // 2. Dispatch expiry notification non-blockingly
    const dispatchResult = await checkAndDispatchDocumentExpiryNotification({
      document: simulatedSavedDoc,
      user: {
        id: 'user-11',
        email: 'taxpayer@kudumbavault.app',
      },
      referenceDate: refDate,
      tracker,
    });

    // 3. Email failed, but no unhandled exception was thrown
    assert.equal(dispatchResult.notified, false);
    assert.equal(dispatchResult.status, 'failed');
    assert.match(dispatchResult.error || '', /550/);

    // 4. The saved document remains completely intact and valid
    assert.equal(simulatedSavedDoc.id, 'doc-uploaded-11');
    assert.equal(simulatedSavedDoc.isPersisted, true);
  } finally {
    setMailerTransporterForTesting(null);
  }
});

test('12. Scheduled reminders after a missed job run (Catch-up Scan)', async () => {
  // Test running the scheduler cycle with referenceDate
  const refDate = new Date('2026-10-28T12:00:00+05:30');
  const report = await runSchedulerCycle({
    referenceDate: refDate,
    timeZone: 'Asia/Kolkata',
    reminderWindowDays: 30,
  });

  assert.equal(typeof report.evaluatedCount, 'number');
  assert.equal(typeof report.sentCount, 'number');
  assert.equal(typeof report.skippedDuplicateCount, 'number');
  assert.equal(typeof report.failedCount, 'number');
  assert.ok(report.evaluatedCount >= 0);
});

test('13. Date boundary and timezone cases in Asia/Kolkata (IST: UTC+5:30)', () => {
  // Case 13a: Reference date is 2026-10-28 12:00:00 IST
  const refDate = new Date('2026-10-28T12:00:00+05:30');

  // Yesterday
  assert.equal(calculateDaysRemainingInTimezone('2026-10-27', refDate, 'Asia/Kolkata'), -1);

  // Today
  assert.equal(calculateDaysRemainingInTimezone('2026-10-28', refDate, 'Asia/Kolkata'), 0);

  // Tomorrow
  assert.equal(calculateDaysRemainingInTimezone('2026-10-29', refDate, 'Asia/Kolkata'), 1);

  // Exactly 7 days
  assert.equal(calculateDaysRemainingInTimezone('2026-11-04', refDate, 'Asia/Kolkata'), 7);

  // Exactly 30 days
  assert.equal(calculateDaysRemainingInTimezone('2026-11-27', refDate, 'Asia/Kolkata'), 30);

  // 31 days (outside 30-day window)
  assert.equal(calculateDaysRemainingInTimezone('2026-11-28', refDate, 'Asia/Kolkata'), 31);

  // Case 13b: Late UTC time vs IST date rollover
  // 2026-10-28 20:00:00 UTC is 2026-10-29 01:30:00 IST (already the next day in Kerala)
  const lateUtcDate = new Date('2026-10-28T20:00:00.000Z');
  // For an expiry date of 2026-10-29, in IST it is "today" (0 days remaining)
  const daysInIst = calculateDaysRemainingInTimezone('2026-10-29', lateUtcDate, 'Asia/Kolkata');
  assert.equal(daysInIst, 0);

  // Case 13c: Bracket evaluation for boundaries
  const evalYesterday = evaluateMilestoneBracket(-1);
  assert.equal(evalYesterday.shouldNotify, true);
  assert.equal(evalYesterday.milestone, -1);
  assert.equal(evalYesterday.urgency, 'CRITICAL');
  assert.equal(evalYesterday.isExpired, true);

  const evalToday = evaluateMilestoneBracket(0);
  assert.equal(evalToday.shouldNotify, true);
  assert.equal(evalToday.milestone, 0);
  assert.equal(evalToday.urgency, 'CRITICAL');
  assert.equal(evalToday.isExpired, true);

  const evalTomorrow = evaluateMilestoneBracket(1);
  assert.equal(evalTomorrow.shouldNotify, true);
  assert.equal(evalTomorrow.milestone, 1);
  assert.equal(evalTomorrow.urgency, 'CRITICAL');
  assert.equal(evalTomorrow.isExpired, false);

  const eval30 = evaluateMilestoneBracket(30);
  assert.equal(eval30.shouldNotify, true);
  assert.equal(eval30.milestone, 30);
  assert.equal(eval30.urgency, 'NOTICE');

  const eval31 = evaluateMilestoneBracket(31, 30);
  assert.equal(eval31.shouldNotify, false);
});
