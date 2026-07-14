// server.js
// Verve Platform Backend — Main Entry Point

require('dotenv').config();

const express              = require('express');
const cors                 = require('cors');
const helmet               = require('helmet');
const morgan               = require('morgan');
const mongoose             = require('mongoose');
const dns                  = require('dns');
const { randomUUID }       = require('crypto');

dns.setServers(['8.8.8.8', '8.8.4.4']);

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

const { errorHandler } = require('./middleware/errorHandler');

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth');
const bookingRoutes      = require('./routes/booking');
const cancellationRoutes = require('./routes/cancellation');
const guestRoutes        = require('./routes/guest');
const walkinRoutes       = require('./routes/walkin');
const checkinRoutes      = require('./routes/checkin');
const chatbotRoutes      = require('./routes/chatbot');
const webhookRoutes      = require('./routes/webhook');
const pipelineRoutes     = require('./routes/pipeline');
const memberRoutes       = require('./routes/member');
const calendarRoutes     = require('./routes/calendar');
const staffRoutes        = require('./routes/staff');
const managementRoutes   = require('./routes/management');
const eventRoutes        = require('./routes/events');

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway terminates TLS at its edge; trust the first proxy so req.ip
// reflects the real client (needed for rate limiting to be per-user, not per-edge).
app.set('trust proxy', 1);

// ── Request correlation ID ────────────────────────────────────────────────────
morgan.token('id', (req) => req.id);
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ── HTTPS redirect ────────────────────────────────────────────────────────────
// Railway sets x-forwarded-proto; redirect plain HTTP requests to HTTPS.
// /health is exempt so Railway's internal health checks still pass.
app.use((req, res, next) => {
  if (req.path !== '/health' && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// ── Middleware ────────────────────────────────────────────────────────────────
// Pure JSON API — no HTML served, so CSP is unnecessary overhead.
// Cross-origin resources must be allowed since the frontend lives on a different domain.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);


app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === 'null') return callback(null, true);
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (/^https:\/\/[^/]+\.wibiz\.ai$/.test(origin)) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Rejected origin: ${origin}`);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan(':id :method :url :status :response-time ms'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Verve Backend is running.',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',              authRoutes);
app.use('/api/booking',           bookingRoutes);
app.use('/api/cancellation',      cancellationRoutes);
app.use('/api/guest-registration', guestRoutes);
app.use('/api/walkin',            walkinRoutes);
app.use('/api/checkin',           checkinRoutes);
app.use('/api/chatbot',           chatbotRoutes);
app.use('/api/webhooks',          webhookRoutes);
app.use('/api/pipelines',         pipelineRoutes);
app.use('/api/member',            memberRoutes);
app.use('/api/calendars',         calendarRoutes);
app.use('/api/staff',             staffRoutes);
app.use('/api/management',        managementRoutes);
app.use('/api/events',            eventRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Verve Backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  // ── Check for expired facility blocks every 5 minutes ────────────────────
  const { processExpiredBlocks } = require('./controllers/managementController');
  const BLOCK_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Run once on startup, then every 5 minutes
  processExpiredBlocks();
  setInterval(processExpiredBlocks, BLOCK_CHECK_INTERVAL_MS);

  // ── Auto-transition stale bookings every 5 minutes ───────────────────────
  // 1. Confirmed bookings still active 15+ min past their start time → No Show
  // 2. Checked In bookings whose end time has passed                  → Completed
  const bookingStore = require('./models/bookingStore');
  const ghlService   = require('./models/ghlService');

  const syncStatusToGhl = async (references, status) => {
    for (const ref of references) {
      try {
        await ghlService.moveOpportunityToStatus(ref, status);
      } catch (err) {
        console.warn(`[Booking Expiry] GHL pipeline sync failed for ${ref} → ${status}: ${err.message}`);
      }
    }
  };

  const processExpiredBookings = async () => {
    try {
      const now     = new Date();
      const nowDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
      const nowTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false });

      // First: no-show sweep (Confirmed → No Show after 15-min grace)
      const noShow = await bookingStore.markStaleConfirmedAsNoShow(nowDate, nowTime);
      if (noShow.count) {
        console.log(`[Booking Expiry] Marked ${noShow.count} stale Confirmed booking(s) as No Show: ${noShow.references.join(', ')}`);
        await syncStatusToGhl(noShow.references, 'No Show');
      }

      // Then: completion sweep (Checked In → Completed after end time)
      const completed = await bookingStore.markPastConfirmedCompleted(nowDate, nowTime);
      if (completed.count) {
        console.log(`[Booking Expiry] Marked ${completed.count} Checked In booking(s) as Completed: ${completed.references.join(', ')}`);
        await syncStatusToGhl(completed.references, 'Completed');
      }
    } catch (err) {
      console.error('[Booking Expiry] Error:', err.message);
    }
  };
  processExpiredBookings();
  setInterval(processExpiredBookings, BLOCK_CHECK_INTERVAL_MS);
});

module.exports = app;
