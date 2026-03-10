// server.js  —  EduCore Backend v2 (PostgreSQL / Supabase)
'use strict';

require('dotenv').config();
const express            = require('express');
const cors               = require('cors');
const { testConnection } = require('./config/db');
const errorHandler       = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : '*',
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// ── Health check ──────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const { query } = require('./config/db');
  try {
    const r = await query('SELECT NOW() AS db_time');
    res.json({
      status: 'ok', db: 'connected',
      db_time: r.rows[0].db_time,
      service: 'EduCore API v2 (PostgreSQL)'
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/students',       require('./routes/students'));
app.use('/api/fees',           require('./routes/fees'));
app.use('/api/fee-structure',  require('./routes/fee-structure'));   // ← NEW
app.use('/api/attendance',     require('./routes/attendance'));
app.use('/api/exams',          require('./routes/exams'));
app.use('/api/teachers',       require('./routes/teachers'));
app.use('/api/salaries',       require('./routes/salaries'));
app.use('/api/promotions',     require('./routes/promotions'));

// 404
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// Central error handler
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
async function start() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      console.log(`\n🚀  EduCore API v2  →  http://localhost:${PORT}`);
      console.log(`🗄️   Database        →  PostgreSQL (Supabase)`);
      console.log(`❤️   Health           →  http://localhost:${PORT}/health\n`);
      console.log('  Routes ready:');
      [
        'GET  /api/dashboard',
        'GET  /api/students',          'POST /api/students',
        'GET  /api/fees',              'POST /api/fees',
        'GET  /api/fee-structure',     'POST /api/fee-structure',   // NEW
        'GET  /api/fee-structure/lookup',                           // NEW
        'GET  /api/attendance',        'POST /api/attendance/bulk',
        'GET  /api/exams',             'POST /api/exams/:id/marks',
        'GET  /api/teachers',          'POST /api/teachers',
        'GET  /api/salaries',          'POST /api/salaries',
        'GET  /api/promotions/eligible','POST /api/promotions/bulk',
      ].forEach(r => console.log(`  ${r}`));
      console.log('');
    });
  } catch (err) {
    console.error('❌  Failed to start — DB connection error:', err.message);
    console.error('    Check your DATABASE_URL in .env');
    process.exit(1);
  }
}

process.on('SIGINT',  () => { console.log('\n👋  Shutting down...'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

start();
