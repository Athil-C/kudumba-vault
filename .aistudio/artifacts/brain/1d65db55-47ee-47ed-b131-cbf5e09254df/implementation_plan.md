# Kudumba Vault — Revised V1 Architecture, Risk Analysis & Phase (a) Execution Plan

Kudumba Vault is a bilingual (Malayalam & English) private household document vault, expiry alert engine, and household management platform for Kerala families and Gulf-based NRI members: *"Everything your family needs to find in 10 seconds, with alerts before anything expires."*

## User Review & Critical Decisions (Updated per Your Changes)

> [!IMPORTANT]
> This revised plan incorporates your V1 scope adjustments, cost-optimized infrastructure choices, Malayalam-first language preference, new Kerala household modules, and a complete risk analysis of what these changes affect. **Click "Proceed" to approve this updated plan and start Phase (a) only** (Project Setup, Design System, Malayalam/English i18n, and the 11-page Public Marketing Site). We will not start Phase (b) until you review Phase (a).

### Summary of Incorporated Changes
1. **Execution Gate — Phase (a) First**: Immediately upon approval, we will build **Phase (a) only** (Design System, Malayalam/English i18n engine, SEO metadata/JSON-LD, and all 11 Public Marketing Pages + Interactive Hero Phone Preview + Waitlist/WhatsApp flows), followed by run instructions, environment variables, migrations, and a test checklist.
2. **Streamlined V1 Scope**:
   - **Included in V1**: Public Marketing Site, Household Vault + Expiry Alerts, Workers & Contacts Book, and 4 high-value Kerala family modules:
     - **NRI "Request a Document"** (remote document request workflow for Gulf family members)
     - **Kuri / Chit Fund Tracker** (monthly installment reminders, auction dates, foreman contact, paid ledger)
     - **House Construction & Renovation Tracker** (milestone bills, panchayat/municipal permit expiry, contractor payments)
     - **Domestic Helper Salary & Leave Ledger** (monthly salary, advances, leave days, payment acknowledgement)
   - **Deferred to V2**: Partner Portal (CA/Agent multi-client view), Super-Admin Console, multi-tier Razorpay paywalls (V1 ships with free/founding household access), complex perspective scanner (replaced with lightweight client compression), and Web Push (prioritizing Email/SMS/WhatsApp first).
3. **Cost-Optimized Tech Stack (Supabase / Serverless Cron Compatible)**:
   - Replaces always-on Redis + BullMQ workers with database-backed scheduled Cron polling (`next_reminder_at` index + DB retry state), cutting baseline hosting cost to near ₹0–₹1,500/month while preserving full Postgres RLS and S3/Supabase private storage compatibility.
4. **Language Posture**:
   - **Malayalam (`മലയാളം`) + English (`EN`)** with full support for Malayalam as the default experience and instant 1-tap switching on every page.

---

## What These Changes Break or Make Riskier (Technical Risk Analysis)

> [!WARNING]
> Removing Redis/BullMQ, deferring Share Packs/Scanner, and defaulting to Malayalam introduce 5 specific engineering risks that we have mitigated in the updated design:

1. **Replacing Redis + BullMQ with Scheduled Cron (`next_reminder_at`)**:
   - *What It Risks*: Cron jobs run on fixed ticks (e.g., every 15 minutes or daily at 7:00 AM IST) rather than real-time event queues. If MSG91 SMS or Email delivery fails mid-run or hits a rate limit, a naive cron job can either double-send reminders to already-processed rows or silently drop failed notifications.
   - *Mitigation*: We add `reminderLockUntil`, `retryCount`, and an explicit `ReminderLog` idempotency constraint (`@@unique([documentId, channel, triggerOffsetDays])`) directly in the database so Cron workers can safely lock rows, retry up to 3 times with backoff, and move permanently failing sends to a database `DLQ` state without Redis.
2. **Deferring Perspective Scanner While Keeping Direct Mobile Camera Uploads**:
   - *What It Risks*: Uncompressed smartphone camera photos in Kerala households average 5–12 MB per page. Uploading raw images over slow rural mobile networks will cause timeouts and rapidly consume storage quotas.
   - *Mitigation*: Even while deferring 4-point perspective warping to V2, we retain automatic zero-dependency browser `<canvas>` compression (resizing to max `1600px` and JPEG `0.80` quality, reducing 8 MB photos to ~250 KB before upload).
3. **Deferring Multi-Document Share Packs (`SharePack`)**:
   - *What It Risks*: Without Share Packs, users will download individual Aadhaar or Passport files to share over WhatsApp, risking unmasked Aadhaar exposure.
   - *Mitigation*: Move **Aadhaar First-8-Digit Auto-Masking (`XXXX-XXXX-4821`)** and optional **Single-Document Purpose Watermarking** directly onto the individual Document view/download action so V1 users still get privacy protection without needing full multi-doc Share Packs.
4. **Removing Partner Portal & Billing from V1 Database Operations**:
   - *What It Risks*: Hard-coding single-household assumptions in V1 makes adding B2B Partner organizations or paid plans in V2 a painful rewrite.
   - *Mitigation*: Keep `tenant_id` on every table and keep the central `can(tenant, feature)` entitlement helper in code (returning `true` for all V1 founding households), so V2 billing and Partner Portal plug in with zero schema-breaking migrations.
5. **Malayalam Default Typography & Layout Overflow**:
   - *What It Risks*: Malayalam script words (e.g., `കാലാവധി കഴിയുന്നവ`, `സുരക്ഷിത കുടുംബ വോൾട്ട്`) have taller ascenders/descenders and 25–35% wider character runs than English, which clips inside fixed-height (`h-8` or `h-10`) buttons and tight grid cards.
   - *Mitigation*: Enforce `Noto Sans Malayalam` with `line-height: 1.65`, use `min-h-[48px] py-2.5 px-4` instead of fixed heights, and allow natural multi-line wrapping inside cards while keeping top-bar navigation labels concise.

---

## 1. Overview & Phase (a) Scope

- **Phase (a) Deliverables (Immediate Build upon Approval)**:
  1. **Project Foundation & Design System**: Warm Malabar Teak & Deep Teal (`#0D4F48`) + Sunlight Off-White (`#FAF7F2`) + Kasavu Gold (`#D97706`) tokens, `Noto Sans Malayalam` + `Plus Jakarta Sans` + `JetBrains Mono` typography, accessible 48px+ touch targets, and reusable status badges (Red/Orange/Green always paired with Icon + Text).
  2. **Bilingual i18n Engine (`ml` / `en`)**: Complete Malayalam and English translation dictionaries with persistent language toggle in the header, supporting Malayalam-first browsing.
  3. **Complete 11-Page Public Marketing Site**:
     - **Home**: Hero with product sentence (*"Everything your family needs to find in 10 seconds, with alerts before anything expires"* / *"നിങ്ങളുടെ കുടുംബത്തിന് ആവശ്യമുള്ളതെല്ലാം 10 സെക്കൻഡിനുള്ളിൽ കണ്ടെത്താം, കാലാവധി കഴിയുന്നതിന് മുമ്പ് മുന്നറിയിപ്പും"*), interactive Phone Mockup previewing the Attention Dashboard, 3-step "How It Works", Feature Grid (including Kuri, Construction & Helper Ledger previews), Trust & Security strip, Founding Family Pricing teaser, FAQ, and Waitlist / Early Access Sign-Up CTA.
     - **Features**: Deep dive into Document Vault, 60/30/7/1-day Expiry Alerts, Workers Book, NRI Document Requests, Kuri Tracker, Construction Tracker, and Helper Salary Ledger.
     - **How It Works**: Step-by-step interactive walkthrough for Kerala parents and Gulf NRIs.
     - **Pricing**: Founding Family Free tier vs upcoming Family & NRI plans (transparent, no hidden fees).
     - **Security & Privacy**: AES-256-GCM encryption, Aadhaar 8-digit masking, private buckets, DPDP Act 2023 compliance, and explicit non-government affiliation notice.
     - **For NRIs**: Tailored guide for UAE, Saudi Arabia, Qatar, Oman, Kuwait, and Bahrain Malayalis managing parents' land tax, KSEB, insurance, and medical records remotely.
     - **For Partners**: Information & waitlist page for Chartered Accountants, insurance agents, and resident associations (upcoming V2 Partner Portal).
     - **FAQ, Contact, Privacy Policy, Terms**: Complete legal, DPDP consent rights, support form, and floating one-tap WhatsApp contact button.
  4. **SEO & PWA Readiness**: Complete OpenGraph tags, dynamic `<title>` and meta descriptions, `/sitemap.xml` & `/robots.txt` endpoints, Schema.org `SoftwareApplication` + `FAQPage` JSON-LD, and installable PWA manifest.

---

## 2. Visual Identity & Design Tokens

- **Color Palette (60-30-10 Sunlight-Legible Contrast)**:
  - `--bg-canvas`: `#FAF7F2` (Warm Off-White Canvas — glare-free outdoor sunlight legibility)
  - `--bg-surface`: `#FFFFFF` (Elevated Card Surface with `#E6E0D6` 1px hairline border)
  - `--bg-subtle`: `#F2ECE1` (Warm Sand for secondary containers & filter bars)
  - `--text-primary`: `#11221D` (Deep Forest Charcoal — >13:1 WCAG AAA contrast)
  - `--text-secondary`: `#43564F` (Muted Slate-Teal for supporting copy)
  - `--primary`: `#0D4F48` (Deep Malabar Teal — primary buttons, active indicators)
  - `--primary-hover`: `#093B36` (Deepened Teal for hover/press states)
  - `--accent`: `#D97706` (Kasavu Saffron/Gold — focal highlights, NRI tags)
  - `--status-critical`: `#B91C1C` on `#FEF2F2` (Always paired with `AlertTriangle` icon + text label)
  - `--status-warning`: `#B45309` on `#FFFBEB` (Always paired with `Clock` icon + text label)
  - `--status-healthy`: `#15803D` on `#F0FDF4` (Always paired with `CheckCircle2` icon + text label)
- **Typography**:
  - **Malayalam UI & Prose**: `Noto Sans Malayalam` (`Manjari` fallback), minimum `16px` body text, `1.65` line-height.
  - **English Headings & UI**: `Plus Jakarta Sans` (600/700 display, 400/500 body, minimum `16px`).
  - **Tabular Data & Dates**: `JetBrains Mono` (`tabular-nums`) for countdown days, rupee amounts (`₹`), and masked IDs.

---

## 3. Technical Architecture & Updated Prisma Schema (with V1 Kerala Modules & RLS)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE (a): PUBLIC BILINGUAL MARKETING SITE & PWA SHELL               │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  ┌────────────────────────┐  │
│  │ 11 Marketing Pages      │  │ Interactive Hero Phone   │  │ Conversion & SEO       │  │
│  │ • മലയാളം / EN Switcher  │  │ • Attention Feed Demo    │  │ • Waitlist / Early CTA │  │
│  │ • Home, Features, NRIs  │  │ • 3-Tap Add Preview      │  │ • WhatsApp Quick Chat  │  │
│  │ • Security, FAQ, Legal  │  │ • Kuri & Worker Preview  │  │ • Sitemap & JSON-LD    │  │
│  └────────────┬────────────┘  └─────────────┬────────────┘  └───────────┬────────────┘  │
└───────────────┼─────────────────────────────┼───────────────────────────┼───────────────┘
                │                             │                           │
┌───────────────▼─────────────────────────────▼───────────────────────────▼───────────────┐
│                  PHASES (b)–(f): HOUSEHOLD VAULT, CRON ALERTS & KERALA LEDGERS          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Supabase / Auth  │  │ Document Vault   │  │ DB Cron Reminders│  │ Kerala Modules  │  │
│  │ • Phone + OTP    │  │ • 18 Seed Types  │  │ • 60/30/7/1d     │  │ • Workers Book  │  │
│  │ • Household RBAC │  │ • AES-256-GCM    │  │ • Idempotent Log │  │ • NRI Requests  │  │
│  │ • App PIN Lock   │  │ • Aadhaar Mask   │  │ • Retry + DB DLQ │  │ • Kuri / Helper │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Updated Prisma Schema (Streamlined V1 + Kerala Household Trackers)

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres"]
}

enum MemberRole {
  OWNER
  EDITOR
  VIEWER
}

enum Visibility {
  SHARED
  PRIVATE
}

enum DocCategory {
  IDENTITY
  VEHICLE
  PROPERTY
  MEDICAL
  INSURANCE
  LOANS_GOLD
  WARRANTY
  GULF_DOCS
  OTHER
}

enum ReminderChannel {
  EMAIL
  SMS
  WHATSAPP
}

enum ReminderStatus {
  QUEUED
  SENT
  FAILED
  DLQ
}

model RegionConfig {
  id                  String         @id @default(cuid())
  code                String         @unique // KL-IN, UAE, KSA, QAT, OMN, KWT, BHR
  nameEn              String
  nameMl              String
  documentTypes       DocumentType[]
}

model DocumentType {
  id                  String       @id @default(cuid())
  code                String       @unique // AADHAAR, PAN, PASSPORT, IQAMA, VEHICLE_RC, KSEB_BILL, LAND_TAX, etc.
  category            DocCategory
  nameEn              String
  nameMl              String
  regionCode          String       @default("KL-IN")
  region              RegionConfig @relation(fields: [regionCode], references: [code])
  hasExpiry           Boolean      @default(true)
  isSensitiveId       Boolean      @default(false)
  maskFirst8Digits    Boolean      @default(false) // true for Aadhaar
  renewalPortalName   String?
  renewalPortalUrl    String?
  defaultRemindDays   Int[]        @default([60, 30, 7, 1])
}

model Tenant {
  id                  String               @id @default(cuid())
  name                String
  planCode            String               @default("FOUNDING_FREE")
  regionCode          String               @default("KL-IN")
  storageUsedBytes    BigInt               @default(0)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  members             TenantMember[]
  people              PersonProfile[]
  documents           Document[]
  workers             WorkerContact[]
  nriRequests         NriDocumentRequest[]
  kuriTrackers        KuriTracker[]
  constructionLogs    ConstructionItem[]
  helperLedgers       DomesticHelper[]
  auditLogs           AuditLog[]
}

model User {
  id                  String          @id @default(cuid())
  phone               String          @unique
  email               String?         @unique
  name                String
  preferredLang       String          @default("ml") // "ml" default per user change, "en" secondary
  appPinHash          String?
  notifyEmail         Boolean         @default(true)
  notifySms           Boolean         @default(true)
  deletedAt           DateTime?
  createdAt           DateTime        @default(now())

  memberships         TenantMember[]
  sessions            DeviceSession[]
  consents            ConsentRecord[]
}

model TenantMember {
  id                  String     @id @default(cuid())
  tenantId            String
  tenant              Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId              String     @relation(fields: [userId], references: [id], onDelete: Cascade)
  user                User
  role                MemberRole @default(VIEWER)
  joinedAt            DateTime   @default(now())

  @@unique([tenantId, userId])
  @@index([tenantId])
}

model PersonProfile {
  id                  String     @id @default(cuid())
  tenantId            String
  tenant              Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String
  relationship        String     // Self, Father, Mother, Spouse, Child
  isNriMember         Boolean    @default(false)
  countryCode         String     @default("IN")
  documents           Document[]

  @@index([tenantId])
}

model Document {
  id                  String           @id @default(cuid())
  tenantId            String
  tenant              Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  personId            String
  person              PersonProfile    @relation(fields: [personId], references: [id], onDelete: Cascade)
  createdByUserId     String
  docTypeCode         String
  category            DocCategory
  title               String
  maskedNumber        String?          // Always "XXXX-XXXX-1234" for Aadhaar
  encryptedNumber     String?          // AES-256-GCM ciphertext
  expiryDate          DateTime?
  nextReminderAt      DateTime?        // Indexed for serverless Cron polling
  reminderLockUntil   DateTime?        // Prevents duplicate concurrent Cron sends
  visibility          Visibility       @default(SHARED)
  notes               String?
  tags                String[]
  portalUrl           String?
  deletedAt           DateTime?        // 30-day soft-delete recovery
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  files               DocumentFile[]
  renewals            RenewalHistory[]
  reminderLogs        ReminderLog[]

  @@index([tenantId, deletedAt])
  @@index([tenantId, nextReminderAt])
}

model DocumentFile {
  id                  String   @id @default(cuid())
  tenantId            String
  documentId          String
  document            Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  pageLabel           String   // "Front", "Back", "Page 1"
  storageKey          String
  mimeType            String
  sizeBytes           Int
  createdAt           DateTime @default(now())

  @@index([tenantId, documentId])
}

model RenewalHistory {
  id                  String   @id @default(cuid())
  tenantId            String
  documentId          String
  document            Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  previousExpiryDate  DateTime
  newExpiryDate       DateTime
  renewedByUserId     String
  amountPaidInr       Int?
  notes               String?
  renewedAt           DateTime @default(now())

  @@index([tenantId, documentId])
}

model ReminderLog {
  id                  String          @id @default(cuid())
  tenantId            String
  documentId          String
  document            Document        @relation(fields: [documentId], references: [id], onDelete: Cascade)
  channel             ReminderChannel
  triggerOffsetDays   Int             // 60, 30, 7, 1, -7, -14
  recipient           String
  status              ReminderStatus
  retryCount          Int             @default(0)
  errorMessage        String?
  sentAt              DateTime        @default(now())

  @@unique([documentId, channel, triggerOffsetDays]) // Idempotency guard for Cron
  @@index([tenantId, sentAt])
}

model WorkerContact {
  id                  String       @id @default(cuid())
  tenantId            String
  tenant              Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String
  phone               String
  alternatePhone      String?
  trade               String       // Electrician, Plumber, Coconut Climber, AC Repair, Carpenter
  area                String
  rating              Int          @default(5)
  notes               String?
  workRecords         WorkRecord[]

  @@index([tenantId, trade])
}

model WorkRecord {
  id                  String        @id @default(cuid())
  tenantId            String
  workerId            String
  worker              WorkerContact @relation(fields: [workerId], references: [id], onDelete: Cascade)
  title               String
  workDate            DateTime
  amountInr           Int
  isPaid              Boolean       @default(true)
  notes               String?
  photoKeys           String[]

  @@index([tenantId, workerId])
}

// Added Module 1: NRI Remote Document Requests
model NriDocumentRequest {
  id                  String   @id @default(cuid())
  tenantId            String
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  requestedByName     String   // e.g. "Anूप (Dubai)"
  targetPersonName    String   // e.g. "Appachan"
  docTypeCode         String
  purposeNote         String
  status              String   @default("PENDING") // PENDING, UPLOADED
  fulfilledDocumentId String?
  createdAt           DateTime @default(now())

  @@index([tenantId])
}

// Added Module 2: Kuri / Chit Fund Tracker
model KuriTracker {
  id                  String   @id @default(cuid())
  tenantId            String
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String   // e.g. "KSFE Bhadratha Kuri #42"
  organizer           String   // KSFE, Local Samithi, Private
  monthlyAmountInr    Int
  totalMonths         Int
  paidMonths          Int      @default(0)
  nextDueDate         DateTime
  isPrized            Boolean  @default(false)
  notes               String?

  @@index([tenantId])
}

// Added Module 3: House Construction & Permit Tracker
model ConstructionItem {
  id                  String    @id @default(cuid())
  tenantId            String
  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  stageTitle          String    // e.g. "Panchayat Building Permit Renewal", "Roofing Stage Bill"
  contractorName      String?
  amountInr           Int
  paidAmountInr       Int       @default(0)
  permitExpiryDate    DateTime?
  notes               String?
  createdAt           DateTime  @default(now())

  @@index([tenantId])
}

// Added Module 4: Domestic Helper Salary & Leave Ledger
model DomesticHelper {
  id                  String                @id @default(cuid())
  tenantId            String
  tenant              Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String
  phone               String?
  role                String                // Housemaid, Home Nurse, Gardener, Driver
  monthlySalaryInr    Int
  entries             HelperSalaryEntry[]

  @@index([tenantId])
}

model HelperSalaryEntry {
  id                  String         @id @default(cuid())
  tenantId            String
  helperId            String
  helper              DomesticHelper @relation(fields: [helperId], references: [id], onDelete: Cascade)
  monthLabel          String         // "Oct 2026"
  salaryPaidInr       Int
  advanceGivenInr     Int            @default(0)
  leaveDays           Int            @default(0)
  paidOn              DateTime       @default(now())

  @@index([tenantId, helperId])
}

model DeviceSession {
  id                  String    @id @default(cuid())
  userId              String
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceName          String
  ipAddress           String
  lastActiveAt        DateTime  @default(now())
  revokedAt           DateTime?
}

model ConsentRecord {
  id                  String   @id @default(cuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantId            String
  purpose             String
  policyVersion       String   @default("v1.0-DPDP-2023")
  granted             Boolean
  recordedAt          DateTime @default(now())
}

model AuditLog {
  id                  String   @id @default(cuid())
  tenantId            String
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  actorUserId         String
  action              String
  targetType          String
  targetId            String
  createdAt           DateTime @default(now())

  @@index([tenantId, createdAt])
}
```

### Updated Phase Execution Roadmap

- **Phase (a) [NEXT — Starts Immediately on Approval]**: Project setup, Malabar Teak & Teal design system, Malayalam-default (`മലയാളം` / `EN`) i18n engine, SEO metadata/sitemap/OpenGraph, WhatsApp quick-contact button, and all 11 Public Marketing Pages (`Home`, `Features`, `How It Works`, `Pricing`, `Security & Privacy`, `For NRIs`, `For Partners`, `FAQ`, `Contact`, `Privacy Policy`, `Terms`) with an interactive Hero Phone Mockup and Waitlist capture API. **Stops after Phase (a) for your review.**
- **Phase (b)**: Phone + OTP Auth (rate-limited), Household creation, Member roles (`Owner`, `Editor`, `Viewer`), and People profiles.
- **Phase (c)**: Document Vault (9 categories, 18 seeded Kerala/Gulf types), 3-tap upload with client-side `<canvas>` compression, AES-256-GCM number encryption, and Aadhaar masking.
- **Phase (d)**: Serverless Cron Expiry Reminders (`next_reminder_at` index, 60/30/7/1d + weekly overdue), Email/SMS logs, Attention Dashboard (Red/Orange/Green + icon + text), and "Mark as Renewed" history.
- **Phase (e)**: Workers & Contacts Book + Kerala Household Modules (NRI Document Requests, Kuri Tracker, House Construction Tracker, Domestic Helper Salary Ledger).
- **Phase (f)**: Single-document watermarked sharing, Global full-text search, App PIN lock, 30-day soft-delete recovery, DPDP data export/deletion, and cross-tenant RLS isolation test suite.
