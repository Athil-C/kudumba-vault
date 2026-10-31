import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import dns from 'dns';
import { sanitizeMongoUri } from './src/config/db';

async function diagnose() {
  const uri = process.env.MONGODB_URI;
  console.log('\n=============================================');
  console.log('🔍 Kudumba Vault — MongoDB Atlas Diagnostics');
  console.log('=============================================');
  console.log('Sanitized URI:', sanitizeMongoUri(uri));

  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env!');
    process.exit(1);
  }

  // 1. DNS SRV Check
  console.log('\n[1/3] Testing DNS SRV lookup...');
  try {
    const srvHost = uri.match(/@([^/?]+)/)?.[1];
    if (srvHost) {
      console.log(`Querying SRV for _mongodb._tcp.${srvHost}...`);
      await new Promise<void>((resolve, reject) => {
        dns.resolveSrv(`_mongodb._tcp.${srvHost}`, (err, addresses) => {
          if (err) {
            console.warn(`⚠️ Local DNS resolution notice: ${err.message}`);
            console.log('Attempting resolution with Google DNS (8.8.8.8)...');
            try {
              dns.setServers(['8.8.8.8', '1.1.1.1']);
              dns.resolveSrv(`_mongodb._tcp.${srvHost}`, (gErr, gAddrs) => {
                if (gErr) {
                  reject(new Error(`DNS SRV lookup failed on both local and Google DNS: ${gErr.message}`));
                } else {
                  console.log('✅ Google DNS successfully resolved replica nodes:', gAddrs.map((a) => a.name));
                  resolve();
                }
              });
            } catch (e: any) {
              reject(e);
            }
          } else {
            console.log('✅ Local DNS resolved replica nodes:', addresses.map((a) => a.name));
            resolve();
          }
        });
      });
    }
  } catch (dnsErr: any) {
    console.error('❌ DNS Check Failed:', dnsErr.message);
  }

  // 2. Mongoose Connection Test
  console.log('\n[2/3] Connecting to MongoDB Atlas (15s timeout)...');
  try {
    const start = Date.now();
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 20000,
      family: 4,
    });
    const elapsed = Date.now() - start;
    console.log(`✅ SUCCESS! Connected to MongoDB Atlas in ${elapsed}ms!`);

    // 3. Ping Check
    console.log('\n[3/3] Sending Ping command to cluster...');
    const adminDb = mongoose.connection.db?.admin();
    const pingRes = await adminDb?.ping();
    console.log('✅ Cluster response:', pingRes);

    const collections = await mongoose.connection.db?.listCollections().toArray();
    console.log('✅ Accessible collections:', collections?.map((c) => c.name).join(', ') || 'none yet');

    console.log('\n🎉 Everything is working properly! Your MongoDB Atlas cluster is active and accepting connections.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (connErr: any) {
    console.error('\n❌ Connection Failed with error:');
    console.error(connErr.message);

    console.log('\n📋 Troubleshooter Recommendations:');
    if (connErr.message.includes('alert number 80') || connErr.message.includes('tlsv1 alert internal error')) {
      console.log('👉 MongoDB Atlas rejected the TLS handshake (SSL alert 80). Steps to resolve:');
      console.log('   1. Whitelist 0.0.0.0/0 (Allow Access from Anywhere) temporarily in MongoDB Atlas Network Access.');
      console.log('   2. If you just added your IP, wait 1-2 minutes for Atlas to finish deploying firewall changes.');
      console.log('   3. Check if your M0 cluster is paused in cloud.mongodb.com and resume it.');
    } else if (connErr.message.includes('Authentication failed') || connErr.message.includes('bad auth')) {
      console.log('👉 Password or username in MONGODB_URI is incorrect. Verify credentials in MongoDB Atlas Database Access.');
    } else if (connErr.message.includes('ETIMEOUT') || connErr.message.includes('querySrv')) {
      console.log('👉 Your local Wi-Fi router DNS does not support SRV records. Change Wi-Fi DNS to 8.8.8.8 (Google DNS) or use standard connection string.');
    } else if (connErr.message.includes('Could not connect to any servers') || connErr.message.includes('ServerSelectionError')) {
      console.log('👉 Atlas Firewall is blocking the IP, or the cluster is paused. Ensure 0.0.0.0/0 is added in Atlas Network Access, and resume the cluster if paused.');
    }
    process.exit(1);
  }
}

diagnose();
