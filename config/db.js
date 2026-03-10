// config/db.js
// PostgreSQL connection pool using the 'pg' library
// Works with Supabase, Neon, Railway, or any PostgreSQL instance
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

// Build config — prefer DATABASE_URL, fall back to individual env vars
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Required for Supabase/hosted Postgres
    }
  : {
      host:     process.env.DB_HOST,
      port:     Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'postgres',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

// Connection pool — shared across all routes
const pool = new Pool({
  ...poolConfig,
  max:             10,   // max simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Log successful connections in development
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔗  New DB client connected');
  }
});

pool.on('error', (err) => {
  console.error('❌  Unexpected DB pool error:', err.message);
});

/**
 * Run a query against the pool.
 * @param {string} text   — SQL string with $1, $2 placeholders
 * @param {Array}  params — parameter values
 */
async function query(text, params) {
  const start = Date.now();
  const res   = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`⚡  Query (${Date.now() - start}ms): ${text.slice(0, 80)}`);
  }
  return res;
}

/**
 * Borrow a dedicated client for transactions (BEGIN / COMMIT / ROLLBACK).
 * Always call client.release() in a finally block.
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Test the connection — called at startup.
 */
async function testConnection() {
  const res = await query('SELECT NOW() AS now, version() AS version');
  console.log(`✅  PostgreSQL connected — ${res.rows[0].now}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`    ${res.rows[0].version.split(',')[0]}`);
  }
}

module.exports = { query, getClient, pool, testConnection };
