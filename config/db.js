// config/db.js
// PostgreSQL connection pool — fixed for Supabase Transaction Pooler on Render
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,  // bypass hostname check
  },
  max:                     5,
  min:                     0,             // start with 0, scale up as needed
  idleTimeoutMillis:       20000,
  connectionTimeoutMillis: 20000,
  allowExitOnIdle:         true,
});

// CRITICAL: handle pool-level errors so they don't crash the process
pool.on('error', (err) => {
  console.error('DB pool error (non-fatal):', err.message);
  // do NOT rethrow — let the pool recover
});

async function query(text, params) {
  const start  = Date.now();
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`⚡ Query (${Date.now() - start}ms): ${text.slice(0, 80)}`);
    }
    return res;
  } finally {
    client.release();   // always release back to pool
  }
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
