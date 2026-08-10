import { Router, Request, Response } from 'express';
import { SubscriptionTier, SubscriptionStatus } from '../types/enums';
import { authenticate, requirePropertyAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import { stripeService } from '../services/stripe.service';
import config from '../config/config';
import logger from '../utils/logger';
import { db } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

interface PropertyRow {
  id: string;
  name: string;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
}

// ─── Plan Definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    tier: SubscriptionTier.BASIC,
    priceMonthly: 29,
    priceAnnual: 290,
    currency: 'USD',
    features: [
      '50 guest reviews per month',
      '100 guest lookups per month',
      'Up to 3 team members',
      'Booking platform webhooks',
      'Email support',
    ],
    limits: config.plans.basic,
  },
  {
    id: 'professional',
    name: 'Professional',
    tier: SubscriptionTier.PROFESSIONAL,
    priceMonthly: 79,
    priceAnnual: 790,
    currency: 'USD',
    popular: true,
    features: [
      '500 guest reviews per month',
      '1,000 guest lookups per month',
      'Up to 10 team members',
      'Full API access',
      'Caller ID phone integration',
      'Booking.com & Airbnb sync',
      'High-risk guest email alerts',
      'Priority support',
    ],
    limits: config.plans.professional,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: SubscriptionTier.ENTERPRISE,
    priceMonthly: 199,
    priceAnnual: 1990,
    currency: 'USD',
    features: [
      'Unlimited reviews & lookups',
      'Unlimited team members',
      'Full API access',
      'Phone integration (Twilio)',
      'All platform integrations',
      'Dedicated account manager',
      'Custom SLA & onboarding',
      '24/7 phone support',
    ],
    limits: config.plans.enterprise,
  },
];

// ─── Get Plans ────────────────────────────────────────────────────────────────

router.get('/plans', (_req: Request, res: Response): void => {
  res.json({ success: true, data: PLANS });
});

// ─── Create Checkout Session ──────────────────────────────────────────────────

router.post(
  '/checkout',
  authenticate,
  requirePropertyAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { tier } = req.body;
    const propertyId = req.user!.propertyId;

    if (!propertyId) {
      res.status(400).json({ success: false, message: 'No property associated' });
      return;
    }

    const property = await db.selectOne<PropertyRow>('Property', { id: propertyId });
    if (!property) {
      res.status(404).json({ success: false, message: 'Property not found' });
      return;
    }

    const priceId = stripeService.getPriceId(tier);
    if (!priceId) {
      res.status(400).json({ success: false, message: 'Invalid subscription tier' });
      return;
    }

    let customerId = property.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(
        property.billingEmail || req.user!.email,
        property.name,
        propertyId
      );
      customerId = customer.id;
      await db.update('Property', { id: propertyId }, {
        stripeCustomerId: customerId,
        updatedAt: new Date().toISOString(),
      });
    }

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      propertyId,
      `${config.clientUrl}/subscription/success`,
      `${config.clientUrl}/subscription`
    );

    res.json({ success: true, data: { url: session.url } });
  })
);

// ─── Customer Portal ──────────────────────────────────────────────────────────

router.post(
  '/portal',
  authenticate,
  requirePropertyAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const propertyId = req.user!.propertyId;
    const property = await db.selectOne<PropertyRow>('Property', { id: propertyId! });

    if (!property?.stripeCustomerId) {
      res.status(400).json({ success: false, message: 'No active subscription found' });
      return;
    }

    const session = await stripeService.createPortalSession(
      property.stripeCustomerId,
      `${config.clientUrl}/subscription`
    );

    res.json({ success: true, data: { url: session.url } });
  })
);

// ─── Stripe Webhook ───────────────────────────────────────────────────────────

router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['stripe-signature'] as string;

    let event;
    try {
      event = stripeService.constructWebhookEvent(
        req.body as Buffer,
        signature
      );
    } catch (err) {
      logger.error('Stripe webhook signature verification failed', err);
      res.status(400).send('Webhook signature verification failed');
      return;
    }

    const tierMap: Record<string, SubscriptionTier> = {
      [config.stripe.prices.basic]: SubscriptionTier.BASIC,
      [config.stripe.prices.professional]: SubscriptionTier.PROFESSIONAL,
      [config.stripe.prices.enterprise]: SubscriptionTier.ENTERPRISE,
    };

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object as import('stripe').Stripe.Subscription;
          const propertyId = sub.metadata?.propertyId;
          if (!propertyId) break;

          const priceId = sub.items.data[0]?.price.id;
          const tier = tierMap[priceId] || SubscriptionTier.BASIC;
          const statusMap: Record<string, SubscriptionStatus> = {
            active: SubscriptionStatus.ACTIVE,
            trialing: SubscriptionStatus.TRIALING,
            past_due: SubscriptionStatus.PAST_DUE,
            canceled: SubscriptionStatus.CANCELLED,
            unpaid: SubscriptionStatus.UNPAID,
            paused: SubscriptionStatus.PAUSED,
          };

          await db.update('Property', { id: propertyId }, {
            stripeSubscriptionId: sub.id,
            subscriptionTier: tier,
            subscriptionStatus: statusMap[sub.status] || SubscriptionStatus.ACTIVE,
            trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            updatedAt: new Date().toISOString(),
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as import('stripe').Stripe.Subscription;
          const propertyId = sub.metadata?.propertyId;
          if (!propertyId) break;

          await db.update('Property', { id: propertyId }, {
            subscriptionTier: SubscriptionTier.FREE_TRIAL,
            subscriptionStatus: SubscriptionStatus.CANCELLED,
            stripeSubscriptionId: null,
            updatedAt: new Date().toISOString(),
          });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as import('stripe').Stripe.Invoice;
          const customerId = invoice.customer as string;
          if (customerId) {
            await db.update('Property', { stripeCustomerId: customerId }, {
              subscriptionStatus: SubscriptionStatus.PAST_DUE,
              updatedAt: new Date().toISOString(),
            });
          }
          break;
        }
      }
    } catch (err) {
      logger.error('Stripe webhook handler error', err);
    }

    res.json({ received: true });
  })
);

// ─── Get Current Subscription ─────────────────────────────────────────────────

router.get(
  '/current',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const propertyId = req.user!.propertyId;
    if (!propertyId) {
      res.json({ success: true, data: null });
      return;
    }

    const property = await db.selectOne<PropertyRow>(
      'Property',
      { id: propertyId },
      { select: 'subscriptionTier,subscriptionStatus,trialEndsAt,stripeSubscriptionId' }
    );

    const plan = PLANS.find((p) => p.tier === property?.subscriptionTier);

    res.json({
      success: true,
      data: {
        ...property,
        plan,
        isActive: ['ACTIVE', 'TRIALING'].includes(property?.subscriptionStatus || ''),
      },
    });
  })
);

export default router;
