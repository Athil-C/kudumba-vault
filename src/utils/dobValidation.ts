/**
 * Kudumba Vault — Date of Birth Validation & Normalization
 *
 * Requirements:
 * - Make date of birth validation robust across frontend and backend.
 * - Normalize date format as 'YYYY-MM-DD' string to avoid timezone-induced date shifts.
 * - Reject invalid calendar dates (e.g., Feb 30, invalid months).
 * - Reject future dates.
 * - Reject dates prior to 1900.
 * - Do not invent an artificial minimum age restriction unless specified.
 */

export interface DobValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates and normalizes a date of birth input.
 * Accepts YYYY-MM-DD format (or string/Date that can be parsed safely).
 */
export function validateDateOfBirth(input?: string | null): DobValidationResult {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Date of birth is required.' };
  }

  const trimmed = input.trim();
  // Regex check for strict YYYY-MM-DD format
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { valid: false, error: 'Date of birth must be in YYYY-MM-DD format.' };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 1900) {
    return { valid: false, error: 'Year of birth must be 1900 or later.' };
  }

  if (month < 1 || month > 12) {
    return { valid: false, error: 'Month must be between 01 and 12.' };
  }

  // Days in month validation (accounting for leap years)
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonths = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDays = daysInMonths[month - 1];

  if (day < 1 || day > maxDays) {
    return {
      valid: false,
      error: `Invalid day ${day} for month ${month} in year ${year}.`,
    };
  }

  // Check future date with a 36-hour timezone grace window to prevent false rejections
  // for users registering in timezones ahead of UTC (up to UTC+14) on their local calendar date.
  const maxAllowedTimestamp = Date.now() + 36 * 60 * 60 * 1000;
  const inputDateUtc = Date.UTC(year, month - 1, day);

  if (inputDateUtc > maxAllowedTimestamp) {
    return { valid: false, error: 'Date of birth cannot be in the future.' };
  }

  // Normalized YYYY-MM-DD string
  const normalized = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return { valid: true, normalized };
}
