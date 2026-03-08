import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import scanRoutes from './routes/scanRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

/**
 * CSRF mitigation for state-changing requests that use cookie-based auth.
 *
 * Our auth cookies are already set with `sameSite: 'strict'` (which prevents
 * browsers from attaching them to cross-site requests), but we add an explicit
 * Origin-header check as a defence-in-depth measure for non-GET requests to
 * /api/auth/* routes.
 *
 * Requests from the configured CLIENT_ORIGIN, same-origin requests, and
 * non-auth routes are always allowed.
 */
const allowedOrigins = new Set(
  [
    process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    `http://localhost:${process.env.PORT || 5000}`,
  ].filter(Boolean)
);

app.use('/api/auth', (req, res, next) => {
  // Only enforce on state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.headers.origin;
  // Same-origin requests may not send an Origin header — allow them
  if (!origin) return next();

  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'CSRF check failed: origin not allowed.' });
  }
  next();
});

// Configured for Phase 2: file upload endpoints will use this middleware
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use('/api/auth',  authRoutes);
app.use('/api/scans', scanRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`SecureFlow server running on port ${PORT}`);
  });
});
