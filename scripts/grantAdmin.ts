import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const email = process.argv[2] || process.env.ADMIN_EMAIL || process.env.GMAIL_USER;

async function main() {
  if (!email) {
    console.error('Error: Admin email must be specified as a command-line argument or via ADMIN_EMAIL / GMAIL_USER in .env');
    console.error('Usage: npm run tsx scripts/grantAdmin.ts <user@example.com>');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB to promote ${email} to ADMIN...`);
  await mongoose.connect(process.env.MONGODB_URI);

  const res = await mongoose.connection.db?.collection('users').updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { role: 'ADMIN', status: 'ACTIVE' } }
  );

  if (res && res.matchedCount > 0) {
    console.log(`Successfully promoted ${email} to ADMIN! (modified: ${res.modifiedCount})`);
  } else {
    console.warn(`User with email "${email}" not found in MongoDB. Creating or verifying after first login.`);
    // List all users currently in database
    const allUsers = await mongoose.connection.db?.collection('users').find({}, { projection: { email: 1, role: 1 } }).toArray();
    console.log('Current users in database:');
    allUsers?.forEach(u => console.log(` - ${u.email} (role: ${u.role})`));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
