// scripts/migrateDoneToCompleted.js
// One-time migration: rename booking_status "Done" → "Completed" on existing
// records. Safe to re-run — no-op once all "Done" rows are converted.
//
// Usage: node scripts/migrateDoneToCompleted.js

require('dotenv').config();
const mongoose = require('mongoose');
const Booking  = require('../models/Booking');

async function run() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('Connected to MongoDB');

  const beforeCount = await Booking.countDocuments({
    booking_status: { $regex: /^done$/i },
  });
  console.log(`Found ${beforeCount} bookings with booking_status = "Done"`);

  if (beforeCount === 0) {
    console.log('Nothing to migrate. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const result = await Booking.updateMany(
    { booking_status: { $regex: /^done$/i } },
    { booking_status: 'Completed' }
  );

  console.log(`Updated ${result.modifiedCount} booking(s) to "Completed"`);

  const remaining = await Booking.countDocuments({
    booking_status: { $regex: /^done$/i },
  });
  console.log(`Remaining "Done" bookings: ${remaining}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
