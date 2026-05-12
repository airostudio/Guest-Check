import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config/config';
import { errorHandler, notFound } from './middleware/errorHandler';
import logger from './utils/logger';

// Routes
import authRoutes from './routes/auth';
import guestRoutes from './routes/guests';
import reviewRoutes from './routes/reviews';
import bookingRoutes from './routes/bookings';
import propertyRoutes from './routes/properties';
import subscriptionRoutes from './routes/subscriptions';
import integrationRoutes from './routes/integrations';
import phoneRoutes from './routes/phone';
import adminRoutes from './routes/admin';

const app = express();

// Trust the first proxy hop (required on Vercel / any reverse-proxy host so
// express-rate-limit can read the real client IP from X-Forwarded-For).
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const phoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many requests, please try again later' },
});

app.use(globalLimiter);

// ─── Stripe webhook needs raw body ───────────────────────────────────────────

app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

// ─── Body Parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────────────────────

if (config.env !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/guests', guestLimiter, guestRoutes);
app.use('/api/reviews', reviewLimiter, reviewRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/phone', phoneLimiter, phoneRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);

// ─── 404 + Error Handlers ─────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

export default app;
