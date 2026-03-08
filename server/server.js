import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import scanRoutes from './routes/scanRoutes.js';
import authRoutes from './routes/authRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import externalApiRoutes from './routes/externalApiRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(helmet());
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Webhook routes — must receive the raw (unparsed) body for HMAC verification.
// Mount BEFORE the global express.json() middleware so the body stream is
// not consumed before we can verify the signature.
// ---------------------------------------------------------------------------
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json({ limit: '5mb' }));

/**
 * CSRF mitigation for state-changing requests that use cookie-based auth.
 *
 * Our auth cookies are already set with `sameSite: 'strict'` (which prevents
 * browsers from attaching them to cross-site requests), but we add an explicit
 * Origin-header check as a defence-in-depth measure for non-GET requests to
 * routes that read from the accessToken cookie.
 *
 * Requests from the configured CLIENT_ORIGIN, same-origin requests, and
 * non-cookie routes are always allowed.
 */
const allowedOrigins = new Set(
  [
    process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    `http://localhost:${process.env.PORT || 5000}`,
  ].filter(Boolean)
);

function csrfCheck(req, res, next) {
  // Only enforce on state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.headers.origin;
  // Same-origin requests may not send an Origin header — allow them
  if (!origin) return next();

  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'CSRF check failed: origin not allowed.' });
  }
  next();
}

app.use('/api/auth',     csrfCheck);
app.use('/api/api-keys', csrfCheck);

// Configured for Phase 2: file upload endpoints will use this middleware
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use('/api/auth',  authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/v1', externalApiRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`SecureFlow server running on port ${PORT}`);
  });
});
