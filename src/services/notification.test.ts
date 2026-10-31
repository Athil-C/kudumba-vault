import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMailer, sendEmail } from '../services/mailer';
import {
  calculateDaysRemainingInTimezone,
  evaluateMilestone,
  runDocumentExpiryJob,
} from '../services/expiryDetector';
import { NotificationTracker } from '../services/notificationTracker';
import { buildExpiryEmailContent, escapeHtml } from '../services/emailTemplates';
import { VaultDocumentItem, HouseholdMemberItem } from '../types/vault';

test('1. SMTP configuration and transporter verification', async () => {
  // When credentials are not yet configured or empty in test environment
  const status = await verifyMailer();
  assert.equal(typeof status.configured, 'boolean');
  assert.equal(typeof status.connected, 'boolean');

  // Verify that sendEmail works safely without throwing in mock/safe mode
  const sendRes = await sendEmail({
    to: 'test@example.com',
    subject: 'Test Subject',
    text: 'Test Body',
    html: '<p>Test Body</p>',
  });
  assert.equal(typeof sendRes.success, 'boolean');
});

test('2. Milestone evaluation: 60 days before expiry', () => {
  const eval60 = evaluateMilestone(60);
  assert.equal(eval60.shouldNotify, true);
  assert.equal(eval60.milestone, 60);
  assert.equal(eval60.urgency, 'NOTICE');
});

test('3. Milestone evaluation: 30 days before expiry', () => {
  const eval30 = evaluateMilestone(30);
  assert.equal(eval30.shouldNotify, true);
  assert.equal(eval30.milestone, 30);
  assert.equal(eval30.urgency, 'NOTICE');
});

test('4. Milestone evaluation: 7 days before expiry', () => {
  const eval7 = evaluateMilestone(7);
  assert.equal(eval7.shouldNotify, true);
  assert.equal(eval7.milestone, 7);
  assert.equal(eval7.urgency, 'WARNING');
});

test('5. Milestone evaluation: 1 day before expiry (tomorrow)', () => {
  const eval1 = evaluateMilestone(1);
  assert.equal(eval1.shouldNotify, true);
  assert.equal(eval1.milestone, 1);
  assert.equal(eval1.urgency, 'CRITICAL');
});

test('6. Milestone evaluation: 0 days (expiring today)', () => {
  const eval0 = evaluateMilestone(0);
  assert.equal(eval0.shouldNotify, true);
  assert.equal(eval0.milestone, 0);
  assert.equal(eval0.urgency, 'CRITICAL');
});

test('7. Milestone evaluation: already-expired document (weekly recurrence)', () => {
  const evalOverdue7 = evaluateMilestone(-7);
  assert.equal(evalOverdue7.shouldNotify, true);
  assert.equal(evalOverdue7.milestone, -7);

  const evalOverdue14 = evaluateMilestone(-14);
  assert.equal(evalOverdue14.shouldNotify, true);
  assert.equal(evalOverdue14.milestone, -14);

  // Non-weekly overdue offset should not fire
  const evalOverdue3 = evaluateMilestone(-3);
  assert.equal(evalOverdue3.shouldNotify, false);
});

test('8. Safe handling of invalid or missing expiry dates', () => {
  assert.equal(calculateDaysRemainingInTimezone(''), null);
  assert.equal(calculateDaysRemainingInTimezone('invalid-date'), null);
  assert.equal(calculateDaysRemainingInTimezone(null as any), null);
  assert.equal(calculateDaysRemainingInTimezone(undefined), null);
});

test('9. Safe handling of missing or invalid recipient emails', async () => {
  const tracker = new NotificationTracker();
  const testDoc: VaultDocumentItem = {
    id: 'doc-no-email',
    titleMl: 'ആധാർ',
    titleEn: 'Aadhaar Card',
    ownerMl: 'ടെസ്റ്റ്',
    ownerEn: 'Test Person',
    docNumber: '1234-5678-9012',
    expiryDate: '2026-05-01',
    status: 'VALID',
    authorityMl: 'UIDAI',
    authorityEn: 'UIDAI',
    renewalHistory: [],
  };

  const report = await runDocumentExpiryJob({
    docs: [testDoc],
    members: [],
    tracker,
    defaultRecipientEmail: 'not-an-email',
    referenceDate: new Date('2026-03-02T03:30:00Z'), // Exactly 60 days before 2026-05-01
  });

  assert.equal(report.sentCount, 0);
  const detail = report.details.find((d) => d.documentId === 'doc-no-email');
  assert.equal(detail?.status, 'skipped_no_email');
});

test('10. Duplicate notification prevention (Idempotency)', async () => {
  const tracker = new NotificationTracker();
  const testDoc: VaultDocumentItem = {
    id: 'doc-duplicate-test',
    titleMl: 'പാസ്‌പോർട്ട്',
    titleEn: 'Passport',
    ownerMl: 'രാഹുൽ',
    ownerEn: 'Rahul Nair',
    docNumber: 'Z894201',
    expiryDate: '2026-04-01',
    status: 'DUE_SOON',
    authorityMl: 'ഗവണ്മെന്റ്',
    authorityEn: 'Govt of India',
    renewalHistory: [],
  };

  // Run cycle 1: Exactly 30 days before
  const report1 = await runDocumentExpiryJob({
    docs: [testDoc],
    members: [],
    tracker,
    defaultRecipientEmail: 'athilchalil@gmail.com',
    referenceDate: new Date('2026-03-02T03:30:00Z'),
  });
  assert.equal(report1.claimedCount, 1);
  assert.equal(report1.sentCount, 1);

  // Run cycle 2 immediately with same parameters: should skip duplicate
  const report2 = await runDocumentExpiryJob({
    docs: [testDoc],
    members: [],
    tracker,
    defaultRecipientEmail: 'athilchalil@gmail.com',
    referenceDate: new Date('2026-03-02T03:30:00Z'),
  });
  assert.equal(report2.claimedCount, 0);
  assert.equal(report2.skippedDuplicateCount, 1);
  assert.equal(report2.sentCount, 0);
});

test('11. Bounded retry policy on failure', () => {
  const tracker = new NotificationTracker();
  const docId = 'doc-retry-test';
  const email = 'athilchalil@gmail.com';
  const milestone = 7;
  const expiry = '2026-04-01';

  // Attempt 1
  assert.equal(tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry), true);
  tracker.markFailed(docId, email, milestone, expiry, 'Temporary network error');

  // Attempt 2
  assert.equal(tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry), true);
  tracker.markFailed(docId, email, milestone, expiry, 'Temporary network error');

  // Attempt 3
  assert.equal(tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry), true);
  tracker.markFailed(docId, email, milestone, expiry, 'Temporary network error');

  // Attempt 4: Should be rejected because attempt count >= 3
  assert.equal(tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry), false);
});

test('12. Multiple concurrent workers claiming the same notification', () => {
  const tracker = new NotificationTracker();
  const docId = 'doc-concurrency-test';
  const email = 'athilchalil@gmail.com';
  const milestone = 1;
  const expiry = '2026-04-01';

  // Worker 1 claims
  const worker1Claim = tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry);
  assert.equal(worker1Claim, true);

  // Worker 2 attempts concurrent claim while Worker 1 is in-flight: MUST fail
  const worker2Claim = tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry);
  assert.equal(worker2Claim, false);

  // Worker 1 finishes and marks sent
  tracker.markSent(docId, email, milestone, expiry, 'msg-12345');

  // Worker 3 attempts claim after sent: MUST fail
  const worker3Claim = tracker.claimForDispatch(docId, 'mem-1', email, milestone, expiry);
  assert.equal(worker3Claim, false);
});

test('13. Family routing and authorization isolation', async () => {
  const tracker = new NotificationTracker();
  const members: HouseholdMemberItem[] = [
    {
      id: 'mem-father',
      nameMl: 'വേണുഗോപാൽ',
      nameEn: 'Venugopal Nair',
      relationMl: 'അച്ഛൻ',
      relationEn: 'Father',
      initials: 'VN',
      email: 'venugopal@gmail.com',
    },
    {
      id: 'mem-son',
      nameMl: 'രാഹുൽ',
      nameEn: 'Rahul Nair',
      relationMl: 'മകൻ',
      relationEn: 'Son',
      initials: 'RN',
      email: 'rahul.dubai@gmail.com',
    },
  ];

  const fatherDoc: VaultDocumentItem = {
    id: 'doc-father-rc',
    titleMl: 'ആർസി ബുക്ക്',
    titleEn: 'Car RC Book',
    ownerMl: 'വേണുഗോപാൽ',
    ownerEn: 'Venugopal Nair',
    memberId: 'mem-father',
    docNumber: 'KL-07-1234',
    expiryDate: '2026-03-09',
    status: 'DUE_SOON',
    authorityMl: 'MVD',
    authorityEn: 'Motor Vehicles Dept',
    renewalHistory: [],
  };

  // Exactly 7 days before 2026-03-09
  const report = await runDocumentExpiryJob({
    docs: [fatherDoc],
    members,
    tracker,
    referenceDate: new Date('2026-03-02T03:30:00Z'),
  });

  assert.equal(report.sentCount, 1);
  const detail = report.details[0];
  // Notification should be routed to father's email, not another member's email
  assert.equal(detail.recipientEmail, 'venugopal@gmail.com');
});

test('14. Timezone boundaries (Asia/Kolkata UTC+5:30) vs UTC calculations', () => {
  // 11:30 PM UTC on 2026-03-01 is 5:00 AM IST on 2026-03-02
  const lateNightUtc = new Date('2026-03-01T23:30:00Z');
  const targetExpiry = '2026-03-03';

  // In Asia/Kolkata, reference date is March 2, target is March 3 -> exactly 1 day remaining
  const daysInIst = calculateDaysRemainingInTimezone(targetExpiry, lateNightUtc, 'Asia/Kolkata');
  assert.equal(daysInIst, 1);

  // In UTC, reference date is March 1, target is March 3 -> 2 days remaining
  const daysInUtc = calculateDaysRemainingInTimezone(targetExpiry, lateNightUtc, 'UTC');
  assert.equal(daysInUtc, 2);
});

test('15. Email template design, XSS escaping, and sensitive data protection', () => {
  const content = buildExpiryEmailContent({
    recipientName: '<script>alert("hack")</script>Rahul',
    documentTitle: 'Passport & Visa',
    documentCategory: 'Identity',
    authorityName: 'Passport Office',
    maskedNumber: '•••• •••• 4821',
    expiryDateStr: '2026-04-10',
    daysRemaining: 30,
    milestone: 30,
    preferredLang: 'ml',
    vaultUrl: 'https://kudumbavault.app',
  });

  // Verify escaping: raw <script> tag must NOT exist in HTML
  assert.ok(!content.html.includes('<script>alert'));
  assert.ok(content.html.includes('&lt;script&gt;'));

  // Sensitive full number must never appear in subject or HTML
  assert.ok(!content.subject.includes('7482'));
  assert.ok(content.html.includes('•••• •••• 4821'));

  // Verify subject and branding
  assert.ok(content.subject.includes('കുടുംബ വോൾട്ട്'));
  assert.ok(content.html.includes('#DE2832')); // Primary Red brand theme matching design
});
