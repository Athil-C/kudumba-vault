/**
 * Safely masks an email address for public display without exposing the complete local part.
 * Preserves initial characters and ending character of the local part to help users recognize
 * their destination address, while replacing sensitive characters with asterisks.
 *
 * Example:
 *   "dropboxuser@example.com" -> "dro**********r@example.com"
 *   "user@domain.com"        -> "u******r@domain.com"
 *   "ab@domain.com"          -> "a*****@domain.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  const clean = email.trim().toLowerCase();
  const atIndex = clean.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === clean.length - 1) {
    return '***@***';
  }

  const local = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex + 1);

  let maskedLocal = '';
  if (local.length === 1) {
    maskedLocal = '*';
  } else if (local.length === 2) {
    maskedLocal = `${local[0]}*****`;
  } else if (local.length === 3) {
    maskedLocal = `${local[0]}*****${local[2]}`;
  } else if (local.length === 4) {
    maskedLocal = `${local[0]}******${local[3]}`;
  } else if (local.length === 5) {
    maskedLocal = `${local.slice(0, 2)}******${local[4]}`;
  } else {
    // local.length >= 6: preserve first 3 characters, mask middle with 10 asterisks, preserve last character
    const prefix = local.slice(0, 3);
    const suffix = local.slice(-1);
    maskedLocal = `${prefix}**********${suffix}`;
  }

  return `${maskedLocal}@${domain}`;
}
