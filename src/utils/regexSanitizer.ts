/**
 * Sanitizes user-supplied search queries for safe inclusion in MongoDB $regex queries.
 * Escapes regex metacharacters: .*+?^${}()|[]\
 * Enforces a strict maximum character length to prevent algorithmic complexity attacks.
 */
export function sanitizeSearchRegex(input: unknown, maxLength = 100): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim().slice(0, maxLength);
  if (!trimmed) return '';
  // Escape regex metacharacters
  return trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
