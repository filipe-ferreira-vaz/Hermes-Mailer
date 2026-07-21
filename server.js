require('dotenv').config();

const express = require('express');
const path = require('path');
const { initDatabase } = require('./src/database');
const calendar = require('./src/calendar');
const sheets = require('./src/sheets');
const mailer = require('./src/mailer');
const scheduler = require('./src/scheduler');
const { createRouter } = require('./src/routes');

const PORT = process.env.PORT || 3000;

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, 'public')));

  // Initialize database (async with sql.js)
  const db = await initDatabase();

  // Ensure Google Sheet headers
  try {
    await sheets.ensureHeaders();
    console.log('[Server] Google Sheet headers verified');
  } catch (err) {
    console.error('[Server] Failed to verify Sheet headers:', err.message);
    console.log('[Server] Sheet integration may not work. Check your .env credentials.');
  }

  // Mount API routes
  const router = createRouter({ db, sheets, mailer, scheduler, calendar });
  app.use(router);

  // Fallback: serve index.html for non-API routes (SPA support)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });

  // Start sync intervals
  const SYNC_INTERVAL = (parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5) * 60 * 1000;

  // Calendar sync interval
  setInterval(async () => {
    try {
      const result = await calendar.syncEvents(db, sheets);
      console.log(`[Sync] Calendar sync complete: ${result.synced} events, ${result.newEvents} new, ${result.canceled} canceled`);
    } catch (err) {
      console.error('[Sync] Calendar sync failed:', err.message);
    }
  }, SYNC_INTERVAL);

  // Sheet sent-status sync interval (every 2 minutes)
  setInterval(async () => {
    try {
      await sheets.syncSentStatus(db);
    } catch (err) {
      console.error('[Sync] Sheet status sync failed:', err.message);
    }
  }, 2 * 60 * 1000);

  // Start server
  app.listen(PORT, async () => {
    console.log(`To open the dashboard, press CTRL + this link: http://localhost:${PORT}`);

    // Auto-open browser
    try {
      const open = await import('open');
      open.default(`http://localhost:${PORT}`);
    } catch (err) {
      // open module not critical
    }

    // Run initial sync
    try {
      const result = await calendar.syncEvents(db, sheets);
      console.log(`[Sync] Initial sync complete: ${result.synced} events, ${result.newEvents} new, ${result.canceled} canceled`);
    } catch (err) {
      console.error('[Sync] Initial sync failed:', err.message);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    if (db && db.close) {
      db.close();
      console.log('[Server] Database closed');
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Server] Shutting down...');
    if (db && db.close) {
      db.close();
      console.log('[Server] Database closed');
    }
    process.exit(0);
  });
}

startServer().catch(err => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
