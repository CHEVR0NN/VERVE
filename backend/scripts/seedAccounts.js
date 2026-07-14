// scripts/seedAccounts.js
// One-time seed of staff + management credentials into MongoDB with bcrypt hashes.
// Usage: npm run seed
//
// Re-running this script is safe — accounts are upserted by (username, type).
// To rotate a password, edit the entry below and re-run.
// IMPORTANT: change the default admin password before going live.

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const Account  = require('../models/Account');

const BCRYPT_COST = 12;

const STAFF_SEEDS = [
  { username: 'frontdesk1',  password: 'VRV@Desk1', role: 'frontdesk', displayName: 'Front Desk 1' },
  { username: 'frontdesk2',  password: 'VRV@Desk2', role: 'frontdesk', displayName: 'Front Desk 2' },
  { username: 'frontdesk3',  password: 'VRV@Desk3', role: 'frontdesk', displayName: 'Front Desk 3' },
  { username: 'security1',   password: 'VRV@Sec1',  role: 'security',  displayName: 'Security 1' },
  { username: 'fnb_manager', password: 'VRV@FnB1',  role: 'fnb',       displayName: 'F&B Manager' },
];

const MANAGEMENT_SEEDS = [
  { username: 'admin', password: 'admin123', displayName: 'Admin' },
];

async function upsertAccount({ username, password, type, role, displayName }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await Account.updateOne(
    { username, type },
    { $set: { passwordHash, role, displayName, active: true } },
    { upsert: true }
  );
}

async function run() {
  const uri = process.env.MONGO_URL;
  if (!uri) {
    console.error('MONGO_URL is not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  for (const s of STAFF_SEEDS) {
    await upsertAccount({ ...s, type: 'staff' });
    console.log(`  seeded staff: ${s.username} (${s.role})`);
  }

  for (const m of MANAGEMENT_SEEDS) {
    await upsertAccount({ ...m, type: 'management', role: 'management' });
    console.log(`  seeded management: ${m.username}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
