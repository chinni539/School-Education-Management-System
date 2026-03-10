// middleware/errorHandler.js
'use strict';

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = process.env.NODE_ENV !== 'production';
  let status  = err.status || 500;
  let message = err.message || 'Internal Server Error';

  // PostgreSQL error codes → friendly HTTP status
  if (err.code) {
    switch (err.code) {
      case '23505': status = 409; message = 'Duplicate entry — record already exists.'; break;
      case '23502': status = 400; message = `Missing required field: ${err.column || ''}`; break;
      case '23503': status = 400; message = 'Invalid reference — related record not found.'; break;
      case '22P02': status = 400; message = 'Invalid data format.'; break;
      case '42P01': status = 500; message = 'Table not found — run the schema SQL first.'; break;
      case 'ECONNREFUSED':
      case '08006':
      case '08001': status = 503; message = 'Database connection failed.'; break;
      default: break;
    }
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${status}: ${message}`);
  if (isDev && err.stack) console.error(err.stack);

  res.status(status).json({
    success: false,
    error:   message,
    ...(isDev && err.code && { pgCode: err.code }),
  });
}

module.exports = errorHandler;
