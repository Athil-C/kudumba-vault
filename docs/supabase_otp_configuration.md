# Supabase Auth: Email OTP Configuration & Troubleshooting Guide

This guide details the root cause of the signup email vs. UI mismatch, the resilience improvements made to **Kudumba Vault**, and the exact manual steps required in the **Supabase Dashboard** for project `kpcuuogvpwdvzvfktivo`.

---

## 1. Root Cause Analysis

### Why did the email still say "Confirm your email address" with a link?
1. **Cloud Template Storage**:
   - Supabase Auth emails are rendered and dispatched by Supabase's hosted GoTrue authentication service in the cloud.
   - Creating or editing local files (such as `supabase/templates/confirm_signup.html`) in this repository **does not push or deploy to the Supabase Cloud dashboard automatically**.
   - In the remote Supabase Dashboard for project `kpcuuogvpwdvzvfktivo`, the default template was still active with subject `Confirm your email address` and body containing `<a href="{{ .ConfirmationURL }}">Confirm your mail</a>`.

2. **Supabase Mailer OTP Length Default**:
   - Live API verification confirmed that Supabase project `kpcuuogvpwdvzvfktivo` generates an **8-digit numeric token** (e.g., `69496174`, `21817260`, `84207797`) by default, because `mailer_otp_length` defaults to `8` on recent Supabase cloud projects unless explicitly set to `6` in the Dashboard.
   - If the frontend strictly expected 6 digits, receiving an 8-digit code would prevent the user from completing verification.

3. **Client `emailRedirectTo` Parameter**:
   - Passing `emailRedirectTo` during `signUp` signals to Supabase GoTrue to construct a magic confirmation redirect link. We removed this parameter so Supabase strictly issues a standalone OTP.

---

## 2. Resilience Improvements Implemented in the Codebase

1. **Adaptive 6-digit & 8-digit OTP Verification (`AuthContext.tsx`)**:
   - `verifySignupOtp(otp, email)` accepts both 6-digit and 8-digit numeric codes (`cleanOtp.length === 6 || cleanOtp.length === 8`) and verifies them via `supabase.auth.verifyOtp({ email, token: cleanOtp, type: 'signup' })`.
2. **Adaptive OTP UI (`AuthModal.tsx`)**:
   - Displays 6 boxes by default.
   - Automatically detects 8-digit codes when pasted from the clipboard and expands to 8 boxes seamlessly.
   - Includes a one-click toggle button (*"Received an 8-digit code? Switch to 8 boxes"*) so users can switch between 6 and 8 boxes if needed.
3. **Template Cleared of Link Variables (`supabase/templates/confirm_signup.html`)**:
   - Uses `{{ .Token }}` exclusively.
   - Completely removes `{{ .ConfirmationURL }}` and any link-only references.

---

## 3. Required Supabase Dashboard Steps

Because the agent does not have access to your Supabase web dashboard, you must apply the template in the cloud control plane once:

### Step 1: Update the "Confirm signup" Email Template
1. Open the Supabase Dashboard:
   [https://supabase.com/dashboard/project/kpcuuogvpwdvzvfktivo/auth/templates](https://supabase.com/dashboard/project/kpcuuogvpwdvzvfktivo/auth/templates)
2. In the list of templates, click on **Confirm signup**.
3. Set the **Subject line** to:
   ```text
   {{ .Token }} is your Kudumba Vault verification code
   ```
4. In the **Body** text area, select all existing content and replace it with the HTML from:
   [`supabase/templates/confirm_signup.html`](../supabase/templates/confirm_signup.html)
   *(The template displays the verification code using `{{ .Token }}` and contains no confirmation URLs).*
5. Click **Save Changes**.

---

### Step 2: Configure OTP Length and Expiration Window
1. In the left sidebar, navigate to **Authentication** &rarr; **Providers**:
   [https://supabase.com/dashboard/project/kpcuuogvpwdvzvfktivo/auth/providers](https://supabase.com/dashboard/project/kpcuuogvpwdvzvfktivo/auth/providers)
2. Click to expand the **Email** provider.
3. Verify that **Enable Email provider** is **ON**.
4. Verify that **Confirm email** is **ON** (do NOT disable email confirmation).
5. Locate **Mailer OTP length**:
   - To use standard 6-digit codes: change the value from `8` to `6`.
   - *(Note: if left as `8`, the Kudumba Vault frontend will still work smoothly due to the adaptive 6/8-digit UI).*
6. Locate **Mailer OTP expiration**:
   - Set to `300` (5 minutes) for high security, or `3600` (1 hour) if preferred.
7. Click **Save**.

---

## 4. Verification & Testing

### How to test:
1. Open the Kudumba Vault app in your browser (`http://localhost:3000`).
2. Click **Create Vault** / **Sign Up**.
3. Fill in the registration form (Name, Family Name, Email, Password, Date of Birth).
4. Check your inbox for the verification email:
   - **Subject**: `[Code] is your Kudumba Vault verification code`
   - **Body**: Kudumba Vault branded email containing the numeric code.
5. Enter the code in the verification modal:
   - Type or paste the code into the input boxes.
   - Click **Verify & Enter Vault**.
6. The app verifies the OTP with Supabase (`supabase.auth.verifyOtp`), synchronizes the MongoDB user profile via `POST /api/auth/sync-profile`, and unlocks your personal vault.

---

## 5. Security & Isolation Invariants Preserved

- **Official GoTrue API**: Only official Supabase Auth methods are used (`signUp`, `verifyOtp({ email, token, type: 'signup' })`, `resend({ type: 'signup', email })`).
- **Separation of Concerns**: Password recovery continues to use the dedicated two-step recovery flow (Email recovery link &rarr; DOB verification &rarr; Reset authorization token). Signup OTPs cannot be exchanged for reset tokens.
- **Fail-Closed Isolation**: Unverified accounts cannot access protected document APIs, private storage downloads, or MongoDB profiles.
- **Inactivity Security**: Seven-day inactivity enforcement remains fully active.
