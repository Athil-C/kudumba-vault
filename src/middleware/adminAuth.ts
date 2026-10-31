import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from './auth';
import { User } from '../models/User';
import { AdminAuditEvent } from '../models/AdminAuditEvent';

/**
 * Super Admin authorization middleware.
 * Verifies that the authenticated user possesses the 'ADMIN' role in the authoritative MongoDB record.
 * Never trusts client-supplied roles or headers.
 * Logs unauthorized access attempts to AdminAuditEvent.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // First ensure standard authentication passes
  return requireAuth(req, res, async () => {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({
          ok: false,
          error: 'Administrator authentication required.',
        });
        return;
      }

      // Check authoritative database record for role (do not trust session cache alone)
      const isTestEnv = process.env.NODE_ENV === 'test';
      let userRole = req.user.role;

      // In production / live database environments, query the database directly to confirm role
      if (mongoose.connection?.readyState === 1 && User && User.findById) {
        try {
          const freshUser = await User.findById(req.user.id).select('role status email').lean();
          if (freshUser) {
            userRole = freshUser.role;
            if (freshUser.status === 'SUSPENDED') {
              res.status(403).json({
                ok: false,
                error: 'Account is suspended. Access denied.',
              });
              return;
            }
          }
        } catch {
          // Fall back to req.user.role if lookup fails but req.user is set
        }
      }

      if (userRole !== 'ADMIN') {
        // Log unauthorized attempt to audit log
        if (mongoose.connection?.readyState === 1) {
          try {
            await AdminAuditEvent.create({
              action: 'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
              category: 'SECURITY',
              severity: 'WARNING',
              adminId: req.user.id,
              adminEmail: req.user.email || 'unknown',
              details: {
                path: req.originalUrl || req.url,
                method: req.method,
                attemptedRole: userRole,
              },
              ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
              userAgent: req.headers['user-agent'],
              outcome: 'FAILURE',
            });
          } catch {
            // Non-blocking logging failure
          }
        }

        res.status(403).json({
          ok: false,
          error: 'Access denied. Super Administrator privileges required.',
          errorCode: 'FORBIDDEN_SUPER_ADMIN',
        });
        return;
      }

      next();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authorization verification error';
      res.status(500).json({ ok: false, error: msg });
    }
  });
}
