// routes/management.js
const express = require('express');
const router  = express.Router();
const { managementAuthenticate } = require('../middleware/managementAuth');
const mgmt = require('../controllers/managementController');

// All routes require management authentication
router.use(managementAuthenticate);

// Dashboard KPIs
router.get('/dashboard',               mgmt.getDashboard);
router.get('/schedule',                 mgmt.getSchedule);

// Live Occupancy
router.get('/occupancy',               mgmt.getOccupancy);

// Booking Analytics
router.get('/analytics',               mgmt.getAnalytics);

// No-Show Tracker
router.get('/no-shows',                mgmt.getNoShows);
router.post('/flag-member',            mgmt.flagMember);

// Guest Record Audit
router.get('/guests',                  mgmt.getGuests);
router.put('/adjust-quota',            mgmt.adjustQuota);

// Late Cancellation Fees
router.get('/fees',                    mgmt.getFees);
router.put('/mark-paid',              mgmt.markPaid);
router.put('/waive-fee',              mgmt.waiveFee);

// Facility Blocks
router.get('/blocks',                  mgmt.getBlocks);
router.post('/blocks',                 mgmt.createBlock);
router.put('/blocks/:booking_reference',    mgmt.updateBlock);
router.delete('/blocks/:booking_reference', mgmt.removeBlock);

// Shared actions (override status, add note, view full record)
router.put('/override-status',         mgmt.overrideStatus);
router.post('/add-note',              mgmt.addNote);
router.get('/contact/:booking_reference', mgmt.getFullRecord);

// Audit log
router.get('/audit', mgmt.getAuditLog);

module.exports = router;
