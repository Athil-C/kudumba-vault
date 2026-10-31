# Supabase Auth: Password Recovery Email Template Configuration

This guide provides the instructions for configuring the **Reset Password** email template in your Supabase project `kpcuuogvpwdvzvfktivo` to ensure that recovery emails display the verification code rather than a link-only template.

---

## 1. Context: Signup Verification vs. Password Recovery

In Supabase Auth, email flows use separate templates and separate verification types:
- **Confirm Signup**: Used when a user registers. Verified via `supabase.auth.verifyOtp({ email, token, type: 'signup' })`.
- **Reset Password**: Used when a user requests password recovery. Verified via `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`.

Both templates must use `{{ .Token }}` instead of `{{ .ConfirmationURL }}` so that users receive numeric verification codes.

---

## 2. Supabase Dashboard Steps

1. Open your browser and navigate to the Supabase Auth Templates page:  
   [https://supabase.com/dashboard/project/kpcuuogvpwdvzvfktivo/auth/templates](https://supabase.com/dashboard/project/kpcuuogvpwdvzvfktivo/auth/templates)

2. Under the **Email Templates** list, click on **Reset Password**.

3. Set the **Subject** line to:
   ```text
   {{ .Token }} is your Kudumba Vault password recovery code
   ```

4. Replace the existing body content with the HTML from:
   [`supabase/templates/reset_password.html`](file:///c:/Users/athil/Downloads/pocket/supabase/templates/reset_password.html)

5. Click **Save Changes**.

---

## 3. Frontend Adaptive Code Support

The Kudumba Vault frontend (`AuthModal.tsx` and `AuthContext.tsx`) supports both 6-digit and 8-digit codes:
- If Supabase emits an 8-digit code (default for new projects), pasting it automatically expands the input to 8 boxes, or the user can click the toggle button.
- If your Supabase Auth settings are configured for 6 digits (`mailer_otp_length = 6`), the default 6 boxes are used.
