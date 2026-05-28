import dotenv from 'dotenv';
import path from 'path';

// Load .env for local development only.
// On Vercel, env vars are injected directly into process.env — dotenv is a no-op.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'changeme_set_JWT_SECRET_in_vercel',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    prices: {
      basic: process.env.STRIPE_BASIC_PRICE_ID || '',
      professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    },
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@guestcheck.io',
    fromName: process.env.FROM_NAME || 'GuestCheck',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@guestcheck.io',
    secret: process.env.ADMIN_SECRET || '',
  },

  waitlistNotifyEmail: process.env.WAITLIST_NOTIFY_EMAIL || 'caravandave67@gmail.com',

  plans: {
    freeTrial: {
      reviewsPerMonth: 10,
      guestLookups: 20,
      apiAccess: false,
      phoneIntegration: false,
      teamMembers: 1,
    },
    basic: {
      reviewsPerMonth: 50,
      guestLookups: 100,
      apiAccess: false,
      phoneIntegration: false,
      teamMembers: 3,
    },
    professional: {
      reviewsPerMonth: 500,
      guestLookups: 1000,
      apiAccess: true,
      phoneIntegration: true,
      teamMembers: 10,
    },
    enterprise: {
      reviewsPerMonth: -1,  // unlimited
      guestLookups: -1,     // unlimited
      apiAccess: true,
      phoneIntegration: true,
      teamMembers: -1,      // unlimited
    },
  },
};

export default config;
