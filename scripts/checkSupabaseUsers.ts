import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('Supabase URL:', url ? 'Configured' : 'Missing');
console.log('Service Key:', serviceKey ? 'Configured' : 'Missing');

const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
      console.error('Error listing Supabase users:', error);
      return;
    }
    const users = data?.users || [];
    console.log('Total Supabase Auth users:', users.length);
    users.forEach((u) => {
      console.log(`- ID: ${u.id}, Email: ${u.email}, Created: ${u.created_at}`);
    });
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
