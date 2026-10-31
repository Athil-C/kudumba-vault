import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskAadhaarNumber,
  maskSensitiveNumber,
  evaluateExpiryStatus,
  getNextReminderMilestone,
  canAccessTenantDocument,
  validateWaitlistInput,
  isDocumentForMember,
} from './vaultLogic';
import {
  formatHumanDate,
  formatINR,
  VaultDocumentItem,
} from '../types/vault';
import {
  getDefaultDocScanDataUrl,
  getEffectiveDocImageDataUrl,
} from './documentCardGenerator';

test('maskAadhaarNumber always masks first 8 digits and preserves only last 4', () => {
  assert.equal(maskAadhaarNumber('7482 9103 4821'), 'XXXX-XXXX-4821');
  assert.equal(maskAadhaarNumber('748291034821'), 'XXXX-XXXX-4821');
  assert.equal(maskAadhaarNumber('12'), 'XXXX-XXXX-XXXX');
});

test('maskSensitiveNumber applies Aadhaar masking for AADHAAR and standard masking for passports', () => {
  assert.equal(maskSensitiveNumber('9988-7766-5544', 'AADHAAR'), 'XXXX-XXXX-5544');
  assert.equal(maskSensitiveNumber('N8472910', 'PASSPORT'), '•••• •••• 2910');
});

test('evaluateExpiryStatus returns CRITICAL, WARNING, and HEALTHY with paired icons and bilingual labels', () => {
  const expired = evaluateExpiryStatus('2026-10-20', '2026-10-25');
  assert.equal(expired.state, 'CRITICAL');
  assert.equal(expired.iconName, 'AlertTriangle');
  assert.equal(expired.daysRemaining, -5);
  assert.ok(expired.labelMl.includes('5'));

  const urgent = evaluateExpiryStatus('2026-10-29', '2026-10-25');
  assert.equal(urgent.state, 'CRITICAL');
  assert.equal(urgent.daysRemaining, 4);

  const warning = evaluateExpiryStatus('2026-11-20', '2026-10-25');
  assert.equal(warning.state, 'WARNING');
  assert.equal(warning.iconName, 'Clock');
  assert.equal(warning.daysRemaining, 26);

  const healthy = evaluateExpiryStatus('2027-06-15', '2026-10-25');
  assert.equal(healthy.state, 'HEALTHY');
  assert.equal(healthy.iconName, 'CheckCircle2');
});

test('getNextReminderMilestone schedules 60, 30, 7, 1 and weekly overdue offsets', () => {
  assert.equal(getNextReminderMilestone(90), 60);
  assert.equal(getNextReminderMilestone(45), 30);
  assert.equal(getNextReminderMilestone(12), 7);
  assert.equal(getNextReminderMilestone(3), 1);
  assert.equal(getNextReminderMilestone(-2), -7);
  assert.equal(getNextReminderMilestone(-9), -14);
});

test('canAccessTenantDocument strictly prevents cross-tenant reads and enforces private visibility', () => {
  const tenantADocPrivate = {
    id: 'doc-1',
    tenantId: 'tenant-nair-family',
    createdByUserId: 'user-appachan',
    visibility: 'PRIVATE' as const,
  };

  const tenantADocShared = {
    id: 'doc-2',
    tenantId: 'tenant-nair-family',
    createdByUserId: 'user-appachan',
    visibility: 'SHARED' as const,
  };

  // Cross-tenant attempt must ALWAYS fail
  assert.equal(
    canAccessTenantDocument(
      { tenantId: 'tenant-menon-family', userId: 'user-menon' },
      tenantADocShared
    ),
    false
  );

  // Same-tenant member can read SHARED doc, but NOT someone else's PRIVATE doc
  assert.equal(
    canAccessTenantDocument(
      { tenantId: 'tenant-nair-family', userId: 'user-son-dubai' },
      tenantADocShared
    ),
    true
  );
  assert.equal(
    canAccessTenantDocument(
      { tenantId: 'tenant-nair-family', userId: 'user-son-dubai' },
      tenantADocPrivate
    ),
    false
  );

  // Creator can read PRIVATE doc
  assert.equal(
    canAccessTenantDocument(
      { tenantId: 'tenant-nair-family', userId: 'user-appachan' },
      tenantADocPrivate
    ),
    true
  );
});

test('validateWaitlistInput rejects invalid phones/names and accepts Kerala & Gulf contacts', () => {
  assert.equal(
    validateWaitlistInput({
      name: 'A',
      phoneOrEmail: '9447123456',
      familyType: 'KERALA_RESIDENT',
      districtOrCountry: 'Kozhikode',
    }).valid,
    false
  );

  assert.equal(
    validateWaitlistInput({
      name: 'Rajesh Nair',
      phoneOrEmail: 'invalid',
      familyType: 'GULF_NRI',
      districtOrCountry: 'Dubai, UAE',
    }).valid,
    false
  );

  assert.equal(
    validateWaitlistInput({
      name: 'Rajesh Nair',
      phoneOrEmail: '+971 50 482 9102',
      familyType: 'GULF_NRI',
      districtOrCountry: 'Dubai, UAE',
    }).valid,
    true
  );
});

test('formatHumanDate and formatINR format localized dates and Indian Rupee digit grouping', () => {
  assert.equal(formatINR(850), '₹850');
  assert.equal(formatINR(125000), '₹1,25,000');
  const humanEn = formatHumanDate('2025-03-14', 'en');
  assert.ok(humanEn.includes('2025') && humanEn.includes('Mar'));
});

test('getDefaultDocScanDataUrl generates valid SVG data URL for all document types', () => {
  const aadhaarDoc: VaultDocumentItem = {
    id: 'test-1',
    titleMl: 'ആധാർ കാർഡ്',
    titleEn: 'Aadhaar Identity Card',
    docTypeCode: 'AADHAAR',
    ownerMl: 'അഞ്ജലി രാഹുൽ',
    ownerEn: 'Anjali Rahul',
    docNumber: '5928-4410-9832',
    expiryDate: '2032-12-31',
    status: 'VALID',
    authorityMl: 'UIDAI ഇന്ത്യ',
    authorityEn: 'UIDAI',
    renewalHistory: [],
  };

  const aadhaarUrl = getDefaultDocScanDataUrl(aadhaarDoc);
  assert.ok(aadhaarUrl.startsWith('data:image/svg+xml'));
  assert.ok(aadhaarUrl.includes('Aadhaar') || aadhaarUrl.includes('UNIQUE%20IDENTIFICATION'));

  // Test that getEffectiveDocImageDataUrl prioritizes uploaded fileDataUrl
  const uploadedDoc: VaultDocumentItem = {
    ...aadhaarDoc,
    fileDataUrl: 'data:image/jpeg;base64,sample123',
  };
  assert.equal(getEffectiveDocImageDataUrl(uploadedDoc), 'data:image/jpeg;base64,sample123');

  // Test fallback to generated scan when no fileDataUrl is present
  assert.equal(getEffectiveDocImageDataUrl(aadhaarDoc), aadhaarUrl);
});

test('Settings Dashboard: storage usage, plan limits and category distribution', () => {
  const PLAN_LIMIT_STORAGE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

  // 1. Zero document storage calculation handles safely without NaN or division by zero
  const zeroBytes = 0;
  const zeroPercent = Math.min(100, Math.round((zeroBytes / PLAN_LIMIT_STORAGE_BYTES) * 100));
  assert.equal(zeroPercent, 0);

  // 2. Reference benchmark storage: 1.2 GB of 3 GB used => 40%
  const benchmarkBytes = 1.2 * 1024 * 1024 * 1024;
  const benchmarkPercent = Math.min(100, Math.round((benchmarkBytes / PLAN_LIMIT_STORAGE_BYTES) * 100));
  assert.equal(benchmarkPercent, 40);

  // 3. Storage warning trigger threshold (> 85%)
  const highUsageBytes = 2.7 * 1024 * 1024 * 1024; // 90%
  const highUsagePercent = Math.min(100, Math.round((highUsageBytes / PLAN_LIMIT_STORAGE_BYTES) * 100));
  assert.equal(highUsagePercent, 90);
  assert.ok(highUsagePercent > 85, 'Warning threshold exceeded');

  // 4. Category breakdown aggregation
  const sampleDocs: VaultDocumentItem[] = [
    {
      id: 'd1',
      titleMl: 'പാസ്‌പോർട്ട്',
      titleEn: 'Passport',
      category: 'IDENTITY',
      categoryId: 'IDENTITY',
      ownerMl: 'അഥിൽ',
      ownerEn: 'Athil',
      docNumber: 'P1234567',
      expiryDate: '2028-10-10',
      status: 'VALID',
      authorityMl: 'ഇന്ത്യൻ പാസ്‌പോർട്ട് ഓഫീസ്',
      authorityEn: 'Passport Office',
      renewalHistory: [],
    },
    {
      id: 'd2',
      titleMl: 'ആധാരം',
      titleEn: 'Title Deed',
      category: 'PROPERTY',
      categoryId: 'PROPERTY',
      ownerMl: 'അഥിൽ',
      ownerEn: 'Athil',
      docNumber: 'TD-9988',
      expiryDate: '2099-01-01',
      status: 'VALID',
      authorityMl: 'സബ് രജിസ്ട്രാർ',
      authorityEn: 'Sub Registrar',
      renewalHistory: [],
    },
  ];

  const categoryCounts: Record<string, number> = { IDENTITY: 0, PROPERTY: 0 };
  for (const doc of sampleDocs) {
    if (doc.categoryId && categoryCounts[doc.categoryId] !== undefined) {
      categoryCounts[doc.categoryId] += 1;
    }
  }
  assert.equal(categoryCounts.IDENTITY, 1);
  assert.equal(categoryCounts.PROPERTY, 1);
});

test('isDocumentForMember accurately isolates documents and prevents first-name leakage', () => {
  // Scenario matching user report: 5 members with the same first name "nihal"
  const members = [
    { id: 'mem-1', nameEn: 'nihal bnalii', nameMl: 'നിഹാൽ ബനാലി' },
    { id: 'mem-2', nameEn: 'nihal bsnalii', nameMl: 'നിഹാൽ ബിസ്നാലി' },
    { id: 'mem-3', nameEn: 'nihal bnaliia', nameMl: 'നിഹാൽ ബനാലിയ' },
    { id: 'mem-4', nameEn: 'nihal bnaliiaa', nameMl: 'നിഹാൽ ബനാലിയാ' },
    { id: 'mem-5', nameEn: 'nihal bnaliiaaas', nameMl: 'നിഹാൽ ബനാലിയാസ്' },
  ];

  // Document uploaded specifically for nihal bnalii (with memberId)
  const docWithMemberId = {
    id: 'doc-1',
    memberId: 'mem-1',
    ownerEn: 'nihal bnalii',
    ownerMl: 'നിഹാൽ ബനാലി',
  };

  assert.equal(isDocumentForMember(docWithMemberId, members[0]), true, 'Must match target member with exact memberId');
  assert.equal(isDocumentForMember(docWithMemberId, members[1]), false, 'Must NOT leak to nihal bsnalii');
  assert.equal(isDocumentForMember(docWithMemberId, members[2]), false, 'Must NOT leak to nihal bnaliia');
  assert.equal(isDocumentForMember(docWithMemberId, members[3]), false, 'Must NOT leak to nihal bnaliiaa');
  assert.equal(isDocumentForMember(docWithMemberId, members[4]), false, 'Must NOT leak to nihal bnaliiaaas');

  // Document uploaded without memberId (legacy), but with owner name "nihal bnalii"
  const docWithoutMemberId = {
    id: 'doc-2',
    ownerEn: 'nihal bnalii',
    ownerMl: 'നിഹാൽ ബനാലി',
  };

  assert.equal(isDocumentForMember(docWithoutMemberId, members[0]), true, 'Must match exact full name');
  assert.equal(isDocumentForMember(docWithoutMemberId, members[1]), false, 'Must NOT match nihal bsnalii despite same first name');
  assert.equal(isDocumentForMember(docWithoutMemberId, members[2]), false, 'Must NOT match nihal bnaliia despite substring match');
  assert.equal(isDocumentForMember(docWithoutMemberId, members[3]), false, 'Must NOT match nihal bnaliiaa');
  assert.equal(isDocumentForMember(docWithoutMemberId, members[4]), false, 'Must NOT match nihal bnaliiaaas');

  // Shared all-family document matches all members
  const sharedFamilyDoc = {
    id: 'doc-shared',
    ownerEn: 'All Family',
  };
  members.forEach((m) => {
    assert.equal(isDocumentForMember(sharedFamilyDoc, m), true, 'All Family doc should match all members');
  });

  // Malayalam shared document
  const mlSharedDoc = {
    id: 'doc-shared-ml',
    ownerMl: 'എല്ലാ കുടുംബാംഗങ്ങളും',
  };
  members.forEach((m) => {
    assert.equal(isDocumentForMember(mlSharedDoc, m), true, 'Malayalam all-family doc should match all members');
  });
});

