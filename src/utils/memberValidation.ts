/**
 * Kudumba Vault — Browser-Safe Member Profile Constants and Validation Utilities
 *
 * This module contains pure client-safe and backend-safe validation helpers
 * and UI option constants for household member profiles.
 * It has ZERO dependencies on Mongoose, Node.js built-ins, or database models.
 */

export const RELATION_OPTIONS_EN = [
  'Self',
  'Spouse',
  'Son',
  'Daughter',
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Grandfather',
  'Grandmother',
  'Other',
] as const;

export const RELATION_MAP_ML: Record<string, string> = {
  Self: 'താൻ',
  Spouse: 'ഭാര്യ / ഭർത്താവ്',
  Son: 'മകൻ',
  Daughter: 'മകൾ',
  Father: 'അച്ഛൻ',
  Mother: 'അമ്മ',
  Brother: 'സഹോദരൻ',
  Sister: 'സഹോദരി',
  Grandfather: 'മുത്തശ്ശൻ',
  Grandmother: 'മുത്തശ്ശി',
  Other: 'മറ്റുള്ളവർ',
};

export const RESIDENCY_STATUS_OPTIONS = [
  'Resident (Kerala)',
  'Resident (India)',
  'NRI (Gulf / GCC)',
  'NRI (US / Europe / Other)',
  'Student (Abroad)',
  'OCI / Foreign Citizen',
] as const;

export function validateWhatsAppNumber(phone?: string): { valid: boolean; error?: string } {
  if (!phone || !phone.trim()) return { valid: true };
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  const hasPlus = trimmed.startsWith('+');
  if (!hasPlus) {
    return {
      valid: false,
      error: 'WhatsApp number must include an international country code starting with + (e.g. +91 98765 43210 or +971 50 123 4567).',
    };
  }
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return {
      valid: false,
      error: 'WhatsApp number must contain between 8 and 15 digits including country code.',
    };
  }
  return { valid: true };
}

export function validateHomePhone(phone?: string): { valid: boolean; error?: string } {
  if (!phone || !phone.trim()) return { valid: true };
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 6 || digitsOnly.length > 15) {
    return {
      valid: false,
      error: 'Home line number must be a valid phone number containing 6 to 15 digits.',
    };
  }
  return { valid: true };
}

export function validateEmailFormat(email?: string): { valid: boolean; error?: string } {
  if (!email || !email.trim()) return { valid: true };
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Please provide a valid email address (e.g. user@example.com).',
    };
  }
  return { valid: true };
}
