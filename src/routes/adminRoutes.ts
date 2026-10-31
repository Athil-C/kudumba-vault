import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { requireSuperAdmin } from '../middleware/adminAuth';
import { User } from '../models/User';
import { Document } from '../models/Document';
import { HouseholdMember } from '../models/HouseholdMember';
import { WorkerRecordModel } from '../models/WorkerRecord';
import { SharePackModel } from '../models/SharePack';
import { NotificationLog } from '../models/NotificationLog';
import { ConsumedResetToken } from '../models/ConsumedResetToken';
import { DobLockout } from '../models/DobLockout';
import { Subscription } from '../models/Subscription';
import { Transaction } from '../models/Transaction';
import { SystemAlert } from '../models/SystemAlert';
import { AdminAuditEvent } from '../models/AdminAuditEvent';
import { AdminSettings } from '../models/AdminSettings';
import { SystemMetricSample } from '../models/SystemMetricSample';
import { collectCurrentMetrics, createSystemAlert } from '../services/monitoringService';
import { getSupabaseStorageClient, deleteDocumentFromStorage, getStorageBucketName } from '../services/supabaseStorage';
import { verifyMailer } from '../services/mailer';
import fs from 'fs';
import path from 'path';
import {
  getAdminPaymentRequests,
  approvePaymentRequest,
  rejectPaymentRequest,
  getUpiPaymentConfig,
  PAYMENT_PROOFS_DIR,
} from '../services/paymentService';
import { adminCancelSubscription } from '../services/subscriptionService';
import { PaymentRequest } from '../models/PaymentRequest';
import { UpiConfig, setMockUpiConfig } from '../models/UpiConfig';
import { sanitizeSearchRegex } from '../utils/regexSanitizer';
import {
  searchRateLimiter,
  adminReconcileConcurrencyLimiter,
  generalApiRateLimiter,
} from '../middleware/rateLimiter';

export const adminRouter = Router();

// Enforce requireSuperAdmin on EVERY route in this router
adminRouter.use(requireSuperAdmin);

// Helper for audit logging
async function logAdminAction(
  req: Request,
  action: string,
  category: any,
  severity: any,
  targetId?: string,
  targetType?: string,
  details?: any,
  outcome: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
) {
  try {
    await AdminAuditEvent.create({
      action,
      category,
      severity,
      adminId: req.user!.id,
      adminEmail: req.user!.email,
      targetId,
      targetType,
      details,
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
      userAgent: req.headers['user-agent'],
      outcome,
    });
  } catch (err) {
    console.error('[AdminAudit] Failed to record admin audit event:', err);
  }
}

/* ==========================================================================
   1. OVERVIEW (/api/admin/overview)
   ========================================================================== */
adminRouter.get('/overview', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalFamilies,
      totalDocuments,
      activeSubscriptions,
      criticalAlertsCount,
      recentAlerts,
      recentAuditLogs,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'ACTIVE' }),
      User.countDocuments({ status: 'SUSPENDED' }),
      HouseholdMember.distinct('ownerId').then((ids) => ids.length),
      Document.countDocuments({ deletedAt: { $exists: false } }),
      Subscription.countDocuments({ status: 'active' } as any),
      SystemAlert.countDocuments({ status: 'ACTIVE', severity: 'CRITICAL' }),
      SystemAlert.find({ status: 'ACTIVE' }).sort({ timestamp: -1 }).limit(5).lean(),
      AdminAuditEvent.find().sort({ timestamp: -1 }).limit(5).lean(),
    ]);

    // Financial calculations from verified transactions
    const paymentAgg = await Transaction.aggregate([
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amountInr' },
          count: { $sum: 1 },
        },
      },
    ]);

    let successfulPayments = 0;
    let failedPayments = 0;
    let refundedPayments = 0;
    for (const item of paymentAgg) {
      if (item._id === 'SUCCESS') successfulPayments = item.totalAmount;
      if (item._id === 'FAILED') failedPayments = item.totalAmount;
      if (item._id === 'REFUNDED') refundedPayments = item.totalAmount;
    }

    // Live health snapshot
    const metrics = await collectCurrentMetrics();

    // Reconcile unprovisioned Supabase Auth users count
    let unprovisionedUsersCount = 0;
    try {
      const supabaseAdmin = getSupabaseStorageClient();
      if (supabaseAdmin?.auth?.admin?.listUsers) {
        const { data: sbList, error: sbListErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (!sbListErr && sbList?.users) {
          const existingMongoUsers = await User.find({}, { supabaseUserId: 1, email: 1 }).lean();
          const existingSbIds = new Set(existingMongoUsers.map((u) => u.supabaseUserId).filter(Boolean));
          const existingEmails = new Set(existingMongoUsers.map((u) => u.email?.toLowerCase()).filter(Boolean));
          for (const sbUser of sbList.users) {
            const sbEmail = sbUser.email?.toLowerCase();
            const isLinked = existingSbIds.has(sbUser.id) || (sbEmail && existingEmails.has(sbEmail));
            if (!isLinked) {
              unprovisionedUsersCount++;
            }
          }
        }
      }
    } catch (sbErr) {
      console.warn('[AdminOverview] Notice checking unprovisioned Supabase users:', sbErr);
    }

    res.json({
      ok: true,
      data: {
        users: {
          total: totalUsers + unprovisionedUsersCount,
          active: activeUsers,
          suspended: suspendedUsers,
          unprovisioned: unprovisionedUsersCount,
        },
        families: {
          total: totalFamilies,
        },
        documents: {
          total: totalDocuments,
        },
        subscriptions: {
          activeCount: activeSubscriptions,
          verifiedGrossRevenueInr: successfulPayments,
          failedPaymentsInr: failedPayments,
          refundedPaymentsInr: refundedPayments,
        },
        systemHealth: {
          mongoConnected: metrics.database.mongoConnected,
          mongoPingMs: metrics.database.mongoPingMs,
          supabaseConnected: metrics.storage.supabaseConnected,
          supabasePingMs: metrics.storage.pingMs,
          processCpuPercent: metrics.cpu.processPercent,
          memoryRssBytes: metrics.memory.rssBytes,
          memoryLimitBytes: metrics.memory.verifiedRenderFreeLimitBytes,
          criticalAlertsCount,
        },
        recentAlerts,
        recentAuditLogs,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve admin overview';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   2. USERS (/api/admin/users)
   ========================================================================== */
adminRouter.get('/users', searchRateLimiter, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const search = (req.query.search as string || '').trim().slice(0, 100);
    const status = (req.query.status as string || '').trim();
    const role = (req.query.role as string || '').trim();

    const query: any = {};
    if (status && status !== 'UNPROVISIONED') query.status = status;
    if (role) query.role = role;
    if (search) {
      const safeSearch = sanitizeSearchRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { fullName: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    // 1. Query MongoDB users (skip if specifically requesting UNPROVISIONED)
    let total = 0;
    let users: any[] = [];
    if (status !== 'UNPROVISIONED') {
      [total, users] = await Promise.all([
        User.countDocuments(query),
        User.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select('-passwordHash')
          .lean(),
      ]);
    }

    // 2. Fetch Supabase Auth users to detect unprovisioned/orphaned accounts
    const unprovisionedUsers: any[] = [];
    if (!status || status === 'UNPROVISIONED') {
      try {
        const supabaseAdmin = getSupabaseStorageClient();
        if (supabaseAdmin?.auth?.admin?.listUsers) {
          const { data: sbData, error: sbError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (!sbError && sbData?.users) {
            const existingMongoUsers = await User.find({}, { supabaseUserId: 1, email: 1 }).lean();
            const existingSbIds = new Set(existingMongoUsers.map((u) => u.supabaseUserId).filter(Boolean));
            const existingEmails = new Set(existingMongoUsers.map((u) => u.email?.toLowerCase()).filter(Boolean));

            for (const sbUser of sbData.users) {
              const sbEmail = sbUser.email?.toLowerCase();
              const isLinked = existingSbIds.has(sbUser.id) || (sbEmail && existingEmails.has(sbEmail));
              if (!isLinked) {
                const name =
                  sbUser.user_metadata?.full_name ||
                  sbUser.user_metadata?.fullName ||
                  sbUser.email?.split('@')[0] ||
                  'Unprovisioned User';
                const matchesSearch =
                  !search ||
                  name.toLowerCase().includes(search.toLowerCase()) ||
                  (sbEmail && sbEmail.includes(search.toLowerCase()));
                const matchesRole = !role || role === 'USER';

                if (matchesSearch && matchesRole) {
                  unprovisionedUsers.push({
                    _id: `unprov_${sbUser.id}`,
                    id: `unprov_${sbUser.id}`,
                    supabaseUserId: sbUser.id,
                    name,
                    fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.fullName || name,
                    familyName: sbUser.user_metadata?.family_name || sbUser.user_metadata?.familyName,
                    email: sbUser.email,
                    role: 'USER',
                    status: 'UNPROVISIONED',
                    isUnprovisioned: true,
                    isEmailVerified: Boolean(sbUser.email_confirmed_at || (sbUser as any).confirmed_at),
                    documentCount: 0,
                    familyMemberCount: 0,
                    lastActivityAt: sbUser.last_sign_in_at || null,
                    createdAt: sbUser.created_at || new Date(),
                    updatedAt: sbUser.updated_at || new Date(),
                    dateOfBirth: sbUser.user_metadata?.date_of_birth || sbUser.user_metadata?.dateOfBirth,
                  });
                }
              }
            }
          }
        }
      } catch (sbErr) {
        console.warn('[AdminUsers] Notice querying Supabase Auth users:', sbErr);
      }
    }

    // Attach document count and family member count for each user
    const userIds = users.map((u) => u._id).filter((id) => mongoose.Types.ObjectId.isValid(id));
    const [docCounts, memberCounts] = await Promise.all([
      Document.aggregate([
        { $match: { ownerId: { $in: userIds }, deletedAt: { $exists: false } } },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      ]),
      HouseholdMember.aggregate([
        { $match: { ownerId: { $in: userIds }, deletedAt: { $exists: false } } },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      ]),
    ]);

    const docMap = new Map(docCounts.map((d) => [d._id.toString(), d.count]));
    const memberMap = new Map(memberCounts.map((m) => [m._id.toString(), m.count]));

    const enrichedMongoUsers = users.map((u) => ({
      ...u,
      documentCount: docMap.get(u._id.toString()) || 0,
      familyMemberCount: memberMap.get(u._id.toString()) || 0,
    }));

    const allUsers = status === 'UNPROVISIONED'
      ? unprovisionedUsers
      : [...enrichedMongoUsers, ...unprovisionedUsers];
    const combinedTotal = total + unprovisionedUsers.length;

    res.json({
      ok: true,
      data: {
        users: allUsers,
        pagination: {
          total: combinedTotal,
          page,
          limit,
          totalPages: Math.ceil(combinedTotal / limit) || 1,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query users';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   2.1 USER RECONCILIATION (/api/admin/users/reconcile & reconcile-all)
   ========================================================================== */
adminRouter.post('/users/reconcile', async (req, res) => {
  const { supabaseUserId, email } = req.body || {};
  if (!supabaseUserId && !email) {
    res.status(400).json({ ok: false, error: 'supabaseUserId or email is required for reconciliation.' });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseStorageClient();
    if (!supabaseAdmin?.auth?.admin?.getUserById) {
      res.status(503).json({ ok: false, error: 'Supabase Admin service is currently unavailable.' });
      return;
    }

    let sbUser: any = null;
    if (supabaseUserId) {
      const cleanId = supabaseUserId.replace(/^unprov_/, '');
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(cleanId);
      if (!error && data?.user) {
        sbUser = data.user;
      }
    }
    if (!sbUser && email) {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      sbUser = data?.users?.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
    }

    if (!sbUser) {
      res.status(404).json({ ok: false, error: 'User not found in Supabase Auth.' });
      return;
    }

    const isConfirmed = Boolean(sbUser.email_confirmed_at || (sbUser as any).confirmed_at);
    const dob = sbUser.user_metadata?.date_of_birth || sbUser.user_metadata?.dateOfBirth;

    const mongoUser = await User.findOrCreateBySupabaseUser({
      supabaseUserId: sbUser.id,
      email: sbUser.email,
      fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.fullName,
      familyName: sbUser.user_metadata?.family_name || sbUser.user_metadata?.familyName,
      dateOfBirth: dob,
      preferredLang: sbUser.user_metadata?.preferredLang || 'ml',
      isEmailVerified: isConfirmed,
      lastSignInAt: sbUser.last_sign_in_at,
    });

    await logAdminAction(
      req,
      'RECONCILE_USER_PROFILE',
      'USER_MANAGEMENT',
      'MEDIUM',
      mongoUser._id.toString(),
      'User',
      {
        supabaseUserId: sbUser.id,
        email: sbUser.email,
        description: `Reconciled orphaned Supabase Auth account ${sbUser.email} into MongoDB profile`,
      },
      'SUCCESS'
    );

    res.json({
      ok: true,
      message: `Successfully provisioned MongoDB profile for ${sbUser.email}`,
      user: mongoUser.toSafeObject ? mongoUser.toSafeObject() : mongoUser,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reconcile user profile';
    res.status(500).json({ ok: false, error: msg });
  }
});

adminRouter.post('/users/reconcile-all', adminReconcileConcurrencyLimiter, async (req, res) => {
  try {
    const supabaseAdmin = getSupabaseStorageClient();
    if (!supabaseAdmin?.auth?.admin?.listUsers) {
      res.status(503).json({ ok: false, error: 'Supabase Admin service is currently unavailable.' });
      return;
    }

    const { data: sbData, error: sbError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (sbError || !sbData?.users) {
      res.status(500).json({ ok: false, error: sbError?.message || 'Failed to list Supabase users' });
      return;
    }

    const existingMongoUsers = await User.find({}, { supabaseUserId: 1, email: 1 }).lean();
    const existingSbIds = new Set(existingMongoUsers.map((u) => u.supabaseUserId).filter(Boolean));
    const existingEmails = new Set(existingMongoUsers.map((u) => u.email?.toLowerCase()).filter(Boolean));

    const reconciled: string[] = [];
    const failed: Array<{ email?: string; error: string }> = [];

    for (const sbUser of sbData.users) {
      const sbEmail = sbUser.email?.toLowerCase();
      const isLinked = existingSbIds.has(sbUser.id) || (sbEmail && existingEmails.has(sbEmail));
      if (!isLinked && sbUser.email) {
        try {
          const isConfirmed = Boolean(sbUser.email_confirmed_at || (sbUser as any).confirmed_at);
          const dob = sbUser.user_metadata?.date_of_birth || sbUser.user_metadata?.dateOfBirth;

          await User.findOrCreateBySupabaseUser({
            supabaseUserId: sbUser.id,
            email: sbUser.email,
            fullName: sbUser.user_metadata?.full_name || sbUser.user_metadata?.fullName,
            familyName: sbUser.user_metadata?.family_name || sbUser.user_metadata?.familyName,
            dateOfBirth: dob,
            preferredLang: sbUser.user_metadata?.preferredLang || 'ml',
            isEmailVerified: isConfirmed,
            lastSignInAt: sbUser.last_sign_in_at,
          });
          reconciled.push(sbUser.email);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ email: sbUser.email, error: msg });
        }
      }
    }

    if (reconciled.length > 0) {
      await logAdminAction(
        req,
        'RECONCILE_ALL_USERS',
        'USER_MANAGEMENT',
        'HIGH',
        undefined,
        'User',
        {
          reconciledCount: reconciled.length,
          reconciled,
          failedCount: failed.length,
          failed,
          description: `Bulk reconciled ${reconciled.length} orphaned Supabase accounts into MongoDB`,
        },
        'SUCCESS'
      );
    }

    res.json({
      ok: true,
      message: `Reconciliation complete: ${reconciled.length} user(s) provisioned, ${failed.length} failed.`,
      reconciled,
      failed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bulk reconciliation failed';
    res.status(500).json({ ok: false, error: msg });
  }
});

adminRouter.post('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      res.status(400).json({ ok: false, error: 'Invalid status. Must be ACTIVE or SUSPENDED.' });
      return;
    }

    // Safety: prevent super admin from suspending their own account
    if (id === req.user!.id && status === 'SUSPENDED') {
      res.status(400).json({ ok: false, error: 'Administrators cannot suspend their own account.' });
      return;
    }

    const updated = await User.findByIdAndUpdate(id, { status }, { new: true }).select('-passwordHash');
    if (!updated) {
      res.status(404).json({ ok: false, error: 'User not found.' });
      return;
    }

    await logAdminAction(
      req,
      status === 'SUSPENDED' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
      'USER_MANAGEMENT',
      'WARNING',
      id,
      'User',
      { previousStatus: updated.status, newStatus: status, reason }
    );

    res.json({ ok: true, user: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update user status';
    res.status(500).json({ ok: false, error: msg });
  }
});

adminRouter.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Safety: prevent super admin from deleting their own account
    if (id === req.user!.id) {
      res.status(400).json({ ok: false, error: 'Administrators cannot delete their own account.' });
      return;
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      res.status(404).json({ ok: false, error: 'User not found.' });
      return;
    }

    const targetOwnerId = targetUser._id;
    const supabaseUserId = targetUser.supabaseUserId;

    // 1. Delete associated physical files from Supabase Storage
    try {
      const userDocs = await Document.find({ ownerId: targetOwnerId }).select('storagePath');
      for (const doc of userDocs) {
        if (doc.storagePath) {
          await deleteDocumentFromStorage(doc.storagePath).catch((err) => {
            console.warn('[AdminDelete] Failed to delete storage file:', doc.storagePath, err);
          });
        }
      }
    } catch (storageErr) {
      console.warn('[AdminDelete] Error cleaning up user storage files:', storageErr);
    }

    // 2. Cascade delete all associated user data across all MongoDB collections
    const [deletedDocs, deletedMembers, deletedWorkers, deletedSharePacks, deletedLogs] = await Promise.all([
      Document.deleteMany({ ownerId: targetOwnerId }),
      HouseholdMember.deleteMany({ ownerId: targetOwnerId }),
      WorkerRecordModel.deleteMany({ ownerId: targetOwnerId }),
      SharePackModel.deleteMany({ ownerId: targetOwnerId }),
      NotificationLog.deleteMany({ ownerId: targetOwnerId }),
      Subscription.deleteMany({ userId: targetOwnerId }).catch(() => {}),
      Transaction.deleteMany({ userId: targetOwnerId }).catch(() => {}),
      supabaseUserId ? ConsumedResetToken.deleteMany({ supabaseUserId }).catch(() => {}) : Promise.resolve(),
      DobLockout.deleteMany({ accountKey: { $regex: String(targetOwnerId) } }).catch(() => {}),
      supabaseUserId ? DobLockout.deleteMany({ accountKey: { $regex: supabaseUserId } }).catch(() => {}) : Promise.resolve(),
    ]);

    // 3. Delete user account record from User collection
    await User.findByIdAndDelete(id);

    // 4. If linked to Supabase Auth, delete the user from Supabase Auth as well
    if (supabaseUserId) {
      try {
        const supabaseAdmin = getSupabaseStorageClient();
        if (supabaseAdmin?.auth?.admin?.deleteUser) {
          const { error: sbDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
          if (sbDeleteErr) {
            console.warn('[AdminDelete] Supabase Auth deleteUser warning:', sbDeleteErr.message);
          }
        }
      } catch (sbErr) {
        console.warn('[AdminDelete] Failed to delete user from Supabase Auth:', sbErr);
      }
    }

    await logAdminAction(
      req,
      'DELETE_USER',
      'USER_MANAGEMENT',
      'CRITICAL',
      id,
      'User',
      {
        email: targetUser.email,
        name: targetUser.name,
        documentsDeleted: (deletedDocs as any)?.deletedCount || 0,
        membersDeleted: (deletedMembers as any)?.deletedCount || 0,
        workersDeleted: (deletedWorkers as any)?.deletedCount || 0,
        sharePacksDeleted: (deletedSharePacks as any)?.deletedCount || 0,
        notificationsDeleted: (deletedLogs as any)?.deletedCount || 0,
      }
    );

    res.json({
      ok: true,
      message: `User ${targetUser.email} and all associated data were permanently deleted.`,
      deletedUserId: id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete user and user data';
    res.status(500).json({ ok: false, error: msg });
  }
});

// Also support POST /users/:id/delete for clients or environments with restrictive HTTP methods
adminRouter.post('/users/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      res.status(400).json({ ok: false, error: 'Administrators cannot delete their own account.' });
      return;
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      res.status(404).json({ ok: false, error: 'User not found.' });
      return;
    }

    const targetOwnerId = targetUser._id;
    const supabaseUserId = targetUser.supabaseUserId;

    // 1. Delete associated physical files from Supabase Storage
    try {
      const userDocs = await Document.find({ ownerId: targetOwnerId }).select('storagePath');
      for (const doc of userDocs) {
        if (doc.storagePath) {
          await deleteDocumentFromStorage(doc.storagePath).catch((err) => {
            console.warn('[AdminDelete] Failed to delete storage file:', doc.storagePath, err);
          });
        }
      }
    } catch (storageErr) {
      console.warn('[AdminDelete] Error cleaning up user storage files:', storageErr);
    }

    // 2. Cascade delete all associated user data across all MongoDB collections
    const [deletedDocs, deletedMembers, deletedWorkers, deletedSharePacks, deletedLogs] = await Promise.all([
      Document.deleteMany({ ownerId: targetOwnerId }),
      HouseholdMember.deleteMany({ ownerId: targetOwnerId }),
      WorkerRecordModel.deleteMany({ ownerId: targetOwnerId }),
      SharePackModel.deleteMany({ ownerId: targetOwnerId }),
      NotificationLog.deleteMany({ ownerId: targetOwnerId }),
      Subscription.deleteMany({ userId: targetOwnerId }).catch(() => {}),
      Transaction.deleteMany({ userId: targetOwnerId }).catch(() => {}),
      supabaseUserId ? ConsumedResetToken.deleteMany({ supabaseUserId }).catch(() => {}) : Promise.resolve(),
      DobLockout.deleteMany({ accountKey: { $regex: String(targetOwnerId) } }).catch(() => {}),
      supabaseUserId ? DobLockout.deleteMany({ accountKey: { $regex: supabaseUserId } }).catch(() => {}) : Promise.resolve(),
    ]);

    // 3. Delete user account record from User collection
    await User.findByIdAndDelete(id);

    // 4. If linked to Supabase Auth, delete the user from Supabase Auth as well
    if (supabaseUserId) {
      try {
        const supabaseAdmin = getSupabaseStorageClient();
        if (supabaseAdmin?.auth?.admin?.deleteUser) {
          const { error: sbDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
          if (sbDeleteErr) {
            console.warn('[AdminDelete] Supabase Auth deleteUser warning:', sbDeleteErr.message);
          }
        }
      } catch (sbErr) {
        console.warn('[AdminDelete] Failed to delete user from Supabase Auth:', sbErr);
      }
    }

    await logAdminAction(
      req,
      'DELETE_USER',
      'USER_MANAGEMENT',
      'CRITICAL',
      id,
      'User',
      {
        email: targetUser.email,
        name: targetUser.name,
        documentsDeleted: (deletedDocs as any)?.deletedCount || 0,
        membersDeleted: (deletedMembers as any)?.deletedCount || 0,
        workersDeleted: (deletedWorkers as any)?.deletedCount || 0,
        sharePacksDeleted: (deletedSharePacks as any)?.deletedCount || 0,
        notificationsDeleted: (deletedLogs as any)?.deletedCount || 0,
      }
    );

    res.json({
      ok: true,
      message: `User ${targetUser.email} and all associated data were permanently deleted.`,
      deletedUserId: id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete user and user data';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   3. FAMILIES (/api/admin/families)
   ========================================================================== */
adminRouter.get('/families', searchRateLimiter, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const search = (req.query.search as string || '').trim().slice(0, 100);

    // Group household members by ownerId to discover families
    const distinctOwners = await HouseholdMember.distinct('ownerId');

    const userQuery: any = { _id: { $in: distinctOwners } };
    if (search) {
      const safeSearch = sanitizeSearchRegex(search);
      userQuery.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { familyName: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(userQuery);
    const owners = await User.find(userQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-passwordHash')
      .lean();

    const ownerIds = owners.map((o) => o._id);

    const [members, documents] = await Promise.all([
      HouseholdMember.find({ ownerId: { $in: ownerIds }, deletedAt: { $exists: false } }).lean(),
      Document.find({ ownerId: { $in: ownerIds }, deletedAt: { $exists: false } }).select('ownerId category fileSize').lean(),
    ]);

    const familyList = owners.map((owner) => {
      const familyMembers = members.filter((m) => m.ownerId.toString() === owner._id.toString());
      const familyDocs = documents.filter((d) => d.ownerId.toString() === owner._id.toString());
      const totalSizeBytes = familyDocs.reduce((acc, d) => acc + (d.fileSize || 0), 0);

      return {
        owner: {
          id: owner._id,
          name: owner.name,
          fullName: owner.fullName,
          familyName: owner.familyName,
          email: owner.email,
          createdAt: owner.createdAt,
        },
        members: familyMembers.map((m) => ({
          id: m._id,
          nameEn: m.nameEn,
          nameMl: m.nameMl,
          relationEn: m.relationEn,
          relationMl: m.relationMl,
          role: m.role,
        })),
        memberCount: familyMembers.length,
        documentCount: familyDocs.length,
        totalSizeBytes,
      };
    });

    res.json({
      ok: true,
      data: {
        families: familyList,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query families';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   4. PLANS & SUBSCRIPTIONS (/api/admin/plans & /api/admin/subscriptions)
   ========================================================================== */
adminRouter.get('/plans', async (req, res) => {
  // Static plan configurations verified against MarketingPages.tsx
  const plans = [
    {
      id: 'founding-free',
      nameEn: 'Founding Household (V1 Active)',
      nameMl: 'ഫൗണ്ടിംഗ് ഫാമിലി പ്ലാൻ (V1 സൗജന്യം)',
      priceInr: 0,
      cadence: 'FREE',
      features: [
        'Up to 5 household family members',
        '18+ Kerala & Gulf document types',
        'Email & SMS expiry alerts',
        'Workers Book & Kerala Ledgers',
        'Automatic Aadhaar 8-digit masking',
      ],
      activeUsers: await User.countDocuments({ status: 'ACTIVE' }),
    },
    {
      id: 'nri-plus',
      nameEn: 'NRI Family Plus (Upcoming V2)',
      nameMl: 'എൻ.ആർ.ഐ ഫാമിലി പ്ലസ് (V2)',
      priceInr: 249,
      cadence: 'MONTHLY',
      features: [
        'Unlimited documents & high-res PDF vault',
        'Remote WhatsApp links for parents',
        'GCC + India SMS alerts',
        'Watermarked expiring Share Packs',
      ],
      activeUsers: 0,
    },
    {
      id: 'partner-pro',
      nameEn: 'Partners: CAs & Societies (Upcoming V2)',
      nameMl: 'പാർട്ണർ പ്ലാൻ: CA & ഹൗസിംഗ് സൊസൈറ്റികൾ',
      priceInr: 999,
      cadence: 'MONTHLY',
      features: [
        'Multi-tenant Partner Portal',
        'Bulk CSV client & policy expiry import',
        'Automated compliance & tax reminders',
        'GST tax invoices',
      ],
      activeUsers: 0,
    },
  ];

  res.json({ ok: true, data: { plans } });
});

adminRouter.get('/subscriptions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const status = (req.query.status as string || '').trim();

    const query: any = {};
    if (status) query.status = status;

    const [total, subs, statusCounts] = await Promise.all([
      Subscription.countDocuments(query),
      Subscription.find(query)
        .populate('userId', 'name email familyName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Subscription.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
    ]);

    const breakdown: Record<string, number> = {
      trialing: 0,
      active: 0,
      expired: 0,
      canceled: 0,
      past_due: 0,
      pending_payment: 0,
    };
    for (const item of statusCounts) {
      if (item._id) breakdown[item._id] = item.count;
    }

    res.json({
      ok: true,
      data: {
        subscriptions: subs,
        statusBreakdown: breakdown,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query subscriptions';
    res.status(500).json({ ok: false, error: msg });
  }
});

// Admin Cancel Customer Subscription (Option A: Period End, Option B: Immediate)
adminRouter.post('/subscriptions/:id/cancel', async (req, res) => {
  try {
    const { mode, reason } = req.body || {};
    const subscriptionId = req.params.id;

    const result = await adminCancelSubscription(
      subscriptionId,
      { mode, reason },
      {
        adminId: req.user!.id,
        adminEmail: req.user!.email,
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({
      ok: true,
      message: result.message,
      subscription: result.subscription,
      entitlement: result.entitlement,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   5. BILLING & FINANCIAL REPORTING (/api/admin/billing)
   ========================================================================== */
adminRouter.get('/billing', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const [total, transactions, summaryAgg] = await Promise.all([
      Transaction.countDocuments(),
      Transaction.find()
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Transaction.aggregate([
        {
          $group: {
            _id: '$status',
            totalAmount: { $sum: '$amountInr' },
            totalFees: { $sum: '$gatewayFeeInr' },
            totalTax: { $sum: '$taxInr' },
            totalNet: { $sum: '$netAmountInr' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      grossCollectionsInr: 0,
      netCollectionsInr: 0,
      totalGatewayFeesInr: 0,
      totalTaxesInr: 0,
      totalRefundsInr: 0,
      totalSuccessCount: 0,
      totalFailedCount: 0,
      totalRefundedCount: 0,
      gatewayIntegration: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        status: process.env.STRIPE_SECRET_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      },
    };

    for (const item of summaryAgg) {
      if (item._id === 'SUCCESS') {
        summary.grossCollectionsInr = item.totalAmount;
        summary.totalGatewayFeesInr = item.totalFees;
        summary.totalTaxesInr = item.totalTax;
        summary.netCollectionsInr = item.totalNet;
        summary.totalSuccessCount = item.count;
      } else if (item._id === 'REFUNDED') {
        summary.totalRefundsInr = item.totalAmount;
        summary.totalRefundedCount = item.count;
      } else if (item._id === 'FAILED') {
        summary.totalFailedCount = item.count;
      }
    }

    res.json({
      ok: true,
      data: {
        summary,
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve billing records';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   6. DOCUMENT MANAGEMENT (/api/admin/documents)
   ========================================================================== */
adminRouter.get('/documents', searchRateLimiter, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const category = (req.query.category as string || '').trim();
    const search = (req.query.search as string || '').trim().slice(0, 100);

    const query: any = { deletedAt: { $exists: false } };
    if (category) query.category = category;
    if (search) {
      const safeSearch = sanitizeSearchRegex(search);
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { fileName: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [total, documents, categoryDistribution] = await Promise.all([
      Document.countDocuments(query),
      Document.find(query)
        .populate('ownerId', 'name email familyName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-storagePath') // NEVER leak private storage path or signed URLs in bulk list
        .lean(),
      Document.aggregate([
        { $match: { deletedAt: { $exists: false } } },
        { $group: { _id: '$category', count: { $sum: 1 }, totalBytes: { $sum: '$fileSize' } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      ok: true,
      data: {
        documents,
        categoryDistribution,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query documents';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   7. STORAGE MONITORING (/api/admin/storage)
   ========================================================================== */
adminRouter.get('/storage', async (req, res) => {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'kudumba-vault-documents';
    const supabase = getSupabaseStorageClient();

    let storagePingMs = 0;
    let bucketInfo: any = null;
    let actualObjectsCount = 0;
    let actualObjectsSizeBytes = 0;
    let storageError: string | null = null;

    try {
      const pingStart = Date.now();
      if (!supabase) {
        storageError = 'Supabase storage client is not configured';
      } else {
        const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
        storagePingMs = Date.now() - pingStart;

        if (bucketErr) {
          storageError = bucketErr.message;
        } else {
          const found = buckets?.find((b) => b.name === bucketName);
          bucketInfo = found ? { name: found.name, isPublic: found.public, createdAt: found.created_at } : null;

          // Count objects in bucket (root level / users folder)
          const { data: objects, error: listErr } = await supabase.storage.from(bucketName).list('users', { limit: 100 });
          if (!listErr && objects) {
            actualObjectsCount = objects.length;
            actualObjectsSizeBytes = objects.reduce((acc, o) => acc + (o.metadata?.size || 0), 0);
          }
        }
      }
    } catch (err: any) {
      storageError = err.message;
    }

    // Compare with application-level MongoDB Document metadata
    const [metaCount, metaSizeAgg] = await Promise.all([
      Document.countDocuments({ deletedAt: { $exists: false } }),
      Document.aggregate([
        { $match: { deletedAt: { $exists: false } } },
        { $group: { _id: null, totalBytes: { $sum: '$fileSize' } } },
      ]),
    ]);

    const metadataTotalSizeBytes = metaSizeAgg[0]?.totalBytes || 0;

    res.json({
      ok: true,
      data: {
        configuredBucket: bucketName,
        bucketInfo,
        connectivity: {
          connected: !storageError,
          pingMs: storagePingMs,
          error: storageError,
        },
        measurements: {
          metadataDocumentCount: metaCount,
          metadataTotalSizeBytes,
          providerEnumeratedObjectCount: actualObjectsCount,
          providerEnumeratedSizeBytes: actualObjectsSizeBytes,
          discrepancyBytes: Math.abs(metadataTotalSizeBytes - actualObjectsSizeBytes),
          note: 'Provider storage quota limits are enforced at Supabase project tier (1 GB free storage on Supabase Free Tier).',
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve storage monitoring';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   8. SYSTEM DIAGNOSTICS & PERFORMANCE (/api/admin/system-diagnostics)
   ========================================================================== */
adminRouter.get('/system-diagnostics', async (req, res) => {
  try {
    const liveMetrics = await collectCurrentMetrics();

    // Query historical metric samples (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const history = await SystemMetricSample.find({ timestamp: { $gte: twentyFourHoursAgo } })
      .sort({ timestamp: 1 })
      .limit(144) // Sample every 10 min = ~144 points
      .lean();

    // Active bottlenecks & alerts
    const activeAlerts = await SystemAlert.find({ status: 'ACTIVE' }).sort({ severity: 1, timestamp: -1 }).lean();

    res.json({
      ok: true,
      data: {
        live: liveMetrics,
        history,
        bottlenecks: activeAlerts,
        infrastructure: {
          platform: 'Render Free Tier',
          containerCpuLimits: 'Shared CPU (Process metrics measured directly via Node.js process.cpuUsage)',
          containerMemoryLimitBytes: 512 * 1024 * 1024,
          hostCpuMetricsAvailable: false,
          hostCpuNote: 'Host-level CPU utilization is unavailable on Render Free monitoring source.',
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query system diagnostics';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   9. DATABASE MONITORING (/api/admin/database-monitoring)
   ========================================================================== */
adminRouter.get('/database-monitoring', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1;
    let pingMs = 0;
    let dbStats: any = null;

    if (mongoStatus && mongoose.connection.db) {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      pingMs = Date.now() - start;

      try {
        dbStats = await mongoose.connection.db.stats();
      } catch {
        // Limited Atlas M0 privilege
      }
    }

    const supabasePing = await collectCurrentMetrics();

    res.json({
      ok: true,
      data: {
        mongodbAtlas: {
          connected: mongoStatus,
          pingMs,
          tier: 'Atlas M0 Free Tier (Shared Cluster)',
          dataSize: dbStats?.dataSize || 0,
          storageSize: dbStats?.storageSize || 0,
          collectionsCount: dbStats?.collections || 0,
          objectsCount: dbStats?.objects || 0,
          providerMetricsAvailable: false,
          providerNote: 'Detailed hardware I/O and disk write metrics require Atlas M10+ or Atlas Administration API API Key.',
        },
        supabaseStorage: {
          connected: supabasePing.storage.supabaseConnected,
          pingMs: supabasePing.storage.pingMs,
          bucket: process.env.SUPABASE_STORAGE_BUCKET || 'kudumba-vault-documents',
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query database monitoring';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   10. SECURITY CENTRE (/api/admin/security)
   ========================================================================== */
adminRouter.get('/security', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const status = (req.query.status as string || '').trim();

    const query: any = {};
    if (status) query.status = status;

    const [totalAlerts, alerts, unresolvedCritical] = await Promise.all([
      SystemAlert.countDocuments(query),
      SystemAlert.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SystemAlert.countDocuments({ status: 'ACTIVE', severity: 'CRITICAL' }),
    ]);

    res.json({
      ok: true,
      data: {
        unresolvedCritical,
        alerts,
        pagination: {
          total: totalAlerts,
          page,
          limit,
          totalPages: Math.ceil(totalAlerts / limit),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query security events';
    res.status(500).json({ ok: false, error: msg });
  }
});

adminRouter.post('/security/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await SystemAlert.findByIdAndUpdate(
      id,
      {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: req.user!.email,
        acknowledgedAt: new Date(),
      },
      { new: true }
    );

    if (!alert) {
      res.status(404).json({ ok: false, error: 'Alert not found.' });
      return;
    }

    await logAdminAction(req, 'ACKNOWLEDGE_ALERT', 'SECURITY', 'INFO', id, 'SystemAlert', { title: alert.title });

    res.json({ ok: true, alert });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to acknowledge alert';
    res.status(500).json({ ok: false, error: msg });
  }
});

adminRouter.post('/security/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const alert = await SystemAlert.findByIdAndUpdate(
      id,
      {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        notes,
      },
      { new: true }
    );

    if (!alert) {
      res.status(404).json({ ok: false, error: 'Alert not found.' });
      return;
    }

    await logAdminAction(req, 'RESOLVE_ALERT', 'SECURITY', 'INFO', id, 'SystemAlert', { title: alert.title, notes });

    res.json({ ok: true, alert });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to resolve alert';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   11. AUDIT LOGS (/api/admin/audit-logs)
   ========================================================================== */
adminRouter.get('/audit-logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const category = (req.query.category as string || '').trim();

    const query: any = {};
    if (category) query.category = category;

    const [total, logs] = await Promise.all([
      AdminAuditEvent.countDocuments(query),
      AdminAuditEvent.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);

    res.json({
      ok: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query audit logs';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   12. SERVER & INTEGRATION HEALTH (/api/admin/server-health)
   ========================================================================== */
adminRouter.get('/server-health', async (req, res) => {
  try {
    const mailerStatus = await verifyMailer();
    const metrics = await collectCurrentMetrics();

    res.json({
      ok: true,
      data: {
        server: {
          status: 'HEALTHY',
          uptimeSeconds: Math.round(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          timestamp: new Date().toISOString(),
        },
        integrations: {
          mongodbAtlas: {
            status: metrics.database.mongoConnected ? 'HEALTHY' : 'DOWN',
            pingMs: metrics.database.mongoPingMs,
          },
          supabaseStorage: {
            status: metrics.storage.supabaseConnected ? 'HEALTHY' : 'DOWN',
            pingMs: metrics.storage.pingMs,
          },
          gmailSmtp: {
            status: mailerStatus.connected ? 'HEALTHY' : mailerStatus.configured ? 'AUTH_FAILED' : 'NOT_CONFIGURED',
            configured: mailerStatus.configured,
            user: mailerStatus.user,
          },
          paymentGateway: {
            status: process.env.STRIPE_SECRET_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
            provider: process.env.STRIPE_SECRET_KEY ? 'Stripe' : 'None',
          },
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query server health';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   13. ADMIN SETTINGS (/api/admin/settings)
   ========================================================================== */
adminRouter.get('/settings', async (req, res) => {
  try {
    let settings = await AdminSettings.findOne({ key: 'global' });
    if (!settings) {
      settings = await AdminSettings.create({
        key: 'global',
        notifications: {
          adminEmails: [req.user!.email],
        },
      });
    }

    res.json({ ok: true, data: { settings } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve settings';
    res.status(500).json({ ok: false, error: msg });
  }
});

adminRouter.put('/settings', async (req, res) => {
  try {
    const { alertThresholds, monitoring, notifications, security } = req.body;

    const updated = await AdminSettings.findOneAndUpdate(
      { key: 'global' },
      {
        ...(alertThresholds && { alertThresholds }),
        ...(monitoring && { monitoring }),
        ...(notifications && { notifications }),
        ...(security && { security }),
        updatedBy: req.user!.email,
      },
      { new: true, upsert: true }
    );

    await logAdminAction(req, 'UPDATE_SETTINGS', 'SETTINGS', 'WARNING', 'global', 'AdminSettings', {
      alertThresholds,
      monitoring,
      notifications,
      security,
    });

    res.json({ ok: true, data: { settings: updated } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update settings';
    res.status(500).json({ ok: false, error: msg });
  }
});

/* ==========================================================================
   14. MANUAL UPI PAYMENTS VERIFICATION & SETTINGS
   ========================================================================== */

// List payment requests filtered by status
adminRouter.get('/payments', async (req, res) => {
  try {
    const status = req.query.status as any;
    const requests = await getAdminPaymentRequests(status);
    res.json({ ok: true, count: requests.length, requests });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// Securely view payment proof screenshot
adminRouter.get('/payments/:id/proof', async (req, res) => {
  try {
    const requestId = req.params.id;
    if (
      !requestId ||
      typeof requestId !== 'string' ||
      requestId.length > 100 ||
      requestId.includes('..') ||
      requestId.includes('/') ||
      requestId.includes('\\')
    ) {
      res.status(400).json({ ok: false, error: 'Valid payment request ID is required.' });
      return;
    }

    let request: any = null;

    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(requestId)) {
      request = await PaymentRequest.findById(requestId);
    } else {
      const { getMockPaymentRequests } = await import('../models/PaymentRequest');
      request = getMockPaymentRequests().get(requestId);
    }

    if (!request || !request.proofFilePath) {
      res.status(404).json({ ok: false, error: 'Payment screenshot not found.' });
      return;
    }

    const filePath = path.isAbsolute(request.proofFilePath)
      ? path.normalize(request.proofFilePath)
      : path.resolve(process.cwd(), request.proofFilePath);

    // Prevent directory traversal: verify filePath is strictly within cwd or PAYMENT_PROOFS_DIR
    const allowedBase = path.resolve(process.cwd());
    if (!filePath.startsWith(allowedBase) && !filePath.startsWith(PAYMENT_PROOFS_DIR)) {
      res.status(403).json({ ok: false, error: 'Access denied: invalid file path.' });
      return;
    }

    // Determine safe, validated MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    let mime = request.proofMimeType;
    if (!mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      mime = mimeMap[ext] || 'image/png';
    }

    const safeFilename = (request.proofOriginalName || 'proof.png')
      .replace(/[\r\n]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);

    // 1. Check if file exists locally on disk
    if (fs.existsSync(filePath)) {
      const fileStream = fs.createReadStream(filePath);
      fileStream.on('error', (err) => {
        console.warn('[AdminProof] Stream read error:', err);
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: 'Failed to read payment proof file.' });
        }
      });
      fileStream.pipe(res);
      return;
    }

    // 2. Check if file is stored in durable Supabase storage (e.g. across Render container restarts)
    try {
      const client = getSupabaseStorageClient();
      if (client) {
        const bucket = getStorageBucketName();
        const filename = path.basename(filePath);
        const cloudPath = `payment-proofs/${requestId}/${filename}`;
        const { data, error } = await client.storage.from(bucket).download(cloudPath);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          res.send(Buffer.from(arrayBuffer));
          return;
        }
      }
    } catch {
      // Non-blocking fallback to test mock
    }

    // 3. Fallback for test/mock environment if mock.png is requested
    if (
      (request.proofFilePath.includes('mock') || request.proofOriginalName?.includes('mock')) &&
      !fs.existsSync(filePath)
    ) {
      const mockPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      );
      try {
        if (!fs.existsSync(path.dirname(filePath))) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        fs.writeFileSync(filePath, mockPng);
      } catch {}
      res.send(mockPng);
      return;
    }

    // 4. File genuinely missing
    res.status(404).json({ ok: false, error: 'Screenshot file not found on storage server.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// Admin Approve Payment Request & Activate Subscription
adminRouter.post('/payments/:id/approve', async (req, res) => {
  try {
    const result = await approvePaymentRequest(req.user!.id, req.user!.email, req.params.id);
    await logAdminAction(
      req,
      'APPROVE_PAYMENT',
      'FINANCIAL',
      'HIGH',
      req.params.id,
      'PaymentRequest',
      {
        utrNumber: result.request.utrNumber,
        amount: result.request.payableAmount,
        planId: result.request.subscriptionPlanId,
      }
    );
    res.json({
      ok: true,
      message: 'Payment verified and approved successfully. Subscription activated.',
      request: result.request,
      subscription: result.subscription,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: msg });
  }
});

// Admin Reject Payment Request
adminRouter.post('/payments/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        ok: false,
        error: 'A detailed rejection reason (at least 5 characters) is required.',
      });
      return;
    }
    const updated = await rejectPaymentRequest(
      req.user!.id,
      req.user!.email,
      req.params.id,
      reason.trim()
    );
    await logAdminAction(
      req,
      'REJECT_PAYMENT',
      'FINANCIAL',
      'MEDIUM',
      req.params.id,
      'PaymentRequest',
      {
        reason: reason.trim(),
        utrNumber: updated.utrNumber,
      }
    );
    res.json({
      ok: true,
      message: 'Payment request rejected.',
      request: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: msg });
  }
});

// Admin Cancel Active Subscription associated with an Approved Payment
adminRouter.post('/payments/:id/cancel-subscription', async (req, res) => {
  try {
    const { mode, reason } = req.body || {};
    const paymentId = req.params.id;
    let targetUserId: string | null = null;
    let targetEmail: string | undefined = undefined;

    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(paymentId)) {
      const paymentReq = await PaymentRequest.findById(paymentId).populate('userId', 'email').lean();
      if (!paymentReq) {
        res.status(404).json({ ok: false, error: 'Payment request not found.' });
        return;
      }
      targetUserId = (paymentReq.userId?._id || paymentReq.userId)?.toString();
      targetEmail = (paymentReq.userId as any)?.email;
    } else {
      const { getMockPaymentRequests } = await import('../models/PaymentRequest');
      const mockReq = getMockPaymentRequests().get(paymentId);
      if (!mockReq) {
        res.status(404).json({ ok: false, error: 'Payment request not found.' });
        return;
      }
      targetUserId = mockReq.userId?.toString();
    }

    if (!targetUserId) {
      res.status(404).json({ ok: false, error: 'Associated user could not be determined from payment request.' });
      return;
    }

    const result = await adminCancelSubscription(
      targetUserId,
      { mode, reason },
      {
        adminId: req.user!.id,
        adminEmail: req.user!.email,
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
        targetUserEmail: targetEmail,
      }
    );

    res.json({
      ok: true,
      message: result.message,
      subscription: result.subscription,
      entitlement: result.entitlement,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: msg });
  }
});

// Admin Get UPI Configuration
adminRouter.get('/upi-settings', async (_req, res) => {
  try {
    const config = await getUpiPaymentConfig();
    res.json({ ok: true, config });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// Admin Update UPI Configuration
adminRouter.patch('/upi-settings', async (req, res) => {
  try {
    const { upiId, merchantName, qrImageUrl, whatsappNumber, instructionsEn, instructionsMl, isEnabled } =
      req.body || {};

    if (upiId && (!upiId.includes('@') || upiId.trim().length < 5)) {
      res.status(400).json({ ok: false, error: 'Invalid UPI ID format (must contain @).' });
      return;
    }

    if (mongoose.connection.readyState === 1) {
      const updated = await UpiConfig.findOneAndUpdate(
        { key: 'global_upi' },
        {
          $set: {
            ...(upiId && { upiId: upiId.trim() }),
            ...(merchantName && { merchantName: merchantName.trim() }),
            ...(qrImageUrl !== undefined && { qrImageUrl: qrImageUrl ? qrImageUrl.trim() : '' }),
            ...(whatsappNumber && { whatsappNumber: whatsappNumber.trim() }),
            ...(instructionsEn && { instructionsEn: instructionsEn.trim() }),
            ...(instructionsMl && { instructionsMl: instructionsMl.trim() }),
            ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
            updatedBy: req.user!.email,
          },
        },
        { new: true, upsert: true }
      );
      await logAdminAction(req, 'UPDATE_UPI_CONFIG', 'SETTINGS', 'HIGH', 'global_upi', 'UpiConfig', {
        upiId,
        merchantName,
      });
      res.json({ ok: true, config: updated });
    } else {
      setMockUpiConfig({
        ...(upiId && { upiId: upiId.trim() }),
        ...(merchantName && { merchantName: merchantName.trim() }),
        ...(qrImageUrl !== undefined && { qrImageUrl }),
        ...(whatsappNumber && { whatsappNumber: whatsappNumber.trim() }),
        ...(instructionsEn && { instructionsEn: instructionsEn.trim() }),
        ...(instructionsMl && { instructionsMl: instructionsMl.trim() }),
        ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
      });
      res.json({ ok: true, config: await getUpiPaymentConfig() });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});
