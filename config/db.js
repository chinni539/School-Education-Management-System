// config/db.js
// PostgreSQL connection pool — optimised for Supabase Transaction Pooler
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max:                     10,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 15000,  // 15 seconds (was 5 — too short for Supabase pooler)
  allowExitOnIdle:         true,
});

pool.on('error', (err) => {
  console.error('❌  Unexpected DB pool error:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res   = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`⚡  Query (${Date.now() - start}ms): ${text.slice(0, 80)}`);
  }
  return res;
}

async function getClient() {
  return pool.connect();
}

async function testConnection() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT NOW() AS now');
    console.log(`✅  PostgreSQL connected — ${res.rows[0].now}`);
  } finally {
    client.release();
  }
}

module.exports = { query, getClient, pool, testConnection };
