import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase, sanitizeMongoUri } from '../src/config/db';

async function clearDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('⚠️ MONGODB_URI is not set in .env. Nothing to clear in MongoDB.');
    process.exit(0);
  }

  console.log(`Connecting to database at ${sanitizeMongoUri(uri)}...`);
  const status = await connectDatabase();
  if (!status.connected) {
    console.error(`❌ Failed to connect to database: ${status.error}`);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ No active database handle found.');
    process.exit(1);
  }

  console.log(`Target database: "${db.databaseName}"`);
  const collections = await db.collections();
  console.log(`Found ${collections.length} collections.`);

  for (const collection of collections) {
    const name = collection.collectionName;
    if (name.startsWith('system.')) continue;
    try {
      const count = await collection.countDocuments();
      const result = await collection.deleteMany({});
      console.log(`- Cleared collection "${name}": removed ${result.deletedCount} of ${count} documents.`);
    } catch (e: any) {
      console.warn(`- Failed to clear collection "${name}":`, e.message);
    }
  }

  console.log('✅ All data removed successfully from database!');
  await mongoose.disconnect();
  process.exit(0);
}

clearDatabase().catch((err) => {
  console.error('❌ Error clearing database:', err);
  process.exit(1);
});
