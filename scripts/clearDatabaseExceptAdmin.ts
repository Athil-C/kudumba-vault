import dotenv from 'dotenv';
dotenv.config();
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

// Configure reliable DNS servers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Could not set custom DNS servers:', e);
}

async function connectToMongo(maxRetries = 5) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Attempt ${attempt}/${maxRetries}] Connecting to MongoDB Atlas...`);
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 25000,
        connectTimeoutMS: 20000,
        family: 4,
      });
      console.log('✅ Connected to MongoDB Atlas:', mongoose.connection.name);
      return;
    } catch (err: any) {
      console.warn(`Attempt ${attempt} connection failed: ${err.message}`);
      await mongoose.disconnect().catch(() => {});
      if (attempt === maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function clearDataExceptAdmin() {
  await connectToMongo();

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database instance not found.');
  }

  console.log('\n======================================================');
  console.log('   CLEARING ALL DATABASE DATA EXCEPT ADMIN ACCOUNT    ');
  console.log('======================================================\n');

  // 1. Locate all ADMIN users
  const adminUsers = await db.collection('users').find({ role: 'ADMIN' }).toArray();
  if (adminUsers.length === 0) {
    throw new Error('ABORTED: No admin user found in database! Will not proceed to prevent lockout.');
  }

  console.log(`Found ${adminUsers.length} ADMIN user(s) to PRESERVE:`);
  const adminIds = adminUsers.map((u) => u._id);
  const adminIdStrings = adminUsers.map((u) => u._id.toString());
  adminUsers.forEach((u) => {
    console.log(`  ⭐ Preserving Admin: ${u.name} (${u.email}) [ID: ${u._id}]`);
  });

  const deletionResults: Record<string, number> = {};

  // 2. Remove non-admin users
  const nonAdminDeleteResult = await db.collection('users').deleteMany({
    _id: { $nin: adminIds },
  });
  deletionResults['users (non-admin)'] = nonAdminDeleteResult.deletedCount;

  // 3. Clear user data collections
  const collectionsToClearEntirely = [
    'documents',
    'householdmembers',
    'paymentrequests',
    'paymenthistories',
    'transactions',
    'notificationlogs',
    'sharepacks',
    'workerrecords',
    'doblockouts',
    'ratelimitrecords',
    'consumedresettokens',
    'trialconsumptions',
    'razorpaywebhookevents',
    'processedwebhookevents',
    'systemmetricsamples',
    'systemalerts',
  ];

  for (const colName of collectionsToClearEntirely) {
    try {
      const res = await db.collection(colName).deleteMany({});
      deletionResults[colName] = res.deletedCount;
    } catch (e: any) {
      console.warn(`Could not clear collection ${colName}:`, e.message);
    }
  }

  // 4. Subscriptions & UserSettings: Keep only for admin(s)
  try {
    const subRes = await db.collection('subscriptions').deleteMany({
      $and: [
        { userId: { $nin: adminIdStrings } },
        { userId: { $nin: adminIds } },
      ],
    });
    deletionResults['subscriptions (non-admin)'] = subRes.deletedCount;
  } catch (e: any) {
    console.warn('Error clearing subscriptions:', e.message);
  }

  try {
    const settingsRes = await db.collection('usersettings').deleteMany({
      $and: [
        { userId: { $nin: adminIdStrings } },
        { userId: { $nin: adminIds } },
      ],
    });
    deletionResults['usersettings (non-admin)'] = settingsRes.deletedCount;
  } catch (e: any) {
    console.warn('Error clearing usersettings:', e.message);
  }

  // 5. Admin Audit Events: Clear old events or log cleanup
  try {
    const auditRes = await db.collection('adminauditevents').deleteMany({});
    deletionResults['adminauditevents'] = auditRes.deletedCount;
  } catch (e: any) {
    console.warn('Error clearing admin audit events:', e.message);
  }

  // 6. Clean local proof uploads if any
  const uploadsDir = path.resolve('uploads', 'payment-proofs');
  let deletedUploadsCount = 0;
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      if (f !== '.gitkeep') {
        try {
          fs.unlinkSync(path.join(uploadsDir, f));
          deletedUploadsCount++;
        } catch {}
      }
    }
  }
  deletionResults['local uploads/payment-proofs files'] = deletedUploadsCount;

  // 7. Summary
  console.log('\n--- DELETION SUMMARY ---');
  for (const [entity, count] of Object.entries(deletionResults)) {
    console.log(`  - Deleted ${count} record(s) from ${entity}`);
  }

  console.log('\n--- PRESERVED COLLECTIONS & ACCOUNTS ---');
  const remainingUsers = await db.collection('users').find({}).toArray();
  console.log(`Users remaining (${remainingUsers.length}):`);
  remainingUsers.forEach((u) => {
    console.log(`  - ${u.name} (${u.email}) [Role: ${u.role}]`);
  });

  const remainingAdminSettings = await db.collection('adminsettings').countDocuments();
  console.log(`Admin settings preserved: ${remainingAdminSettings}`);

  const remainingUpiConfigs = await db.collection('upiconfigs').countDocuments();
  console.log(`UPI configs preserved: ${remainingUpiConfigs}`);

  console.log('\n✅ Database reset completed successfully! All data removed except Admin.');

  await mongoose.disconnect();
  process.exit(0);
}

clearDataExceptAdmin().catch((err) => {
  console.error('\n❌ Deletion failed with error:', err.message);
  process.exit(1);
});
