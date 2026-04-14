import Stripe from 'stripe';
import config from '../config/config';
import logger from '../utils/logger';

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

export const PLAN_PRICES: Record<string, string> = {
  basic: config.stripe.prices.basic,
  professional: config.stripe.prices.professional,
  enterprise: config.stripe.prices.enterprise,
};

export const stripeService = {
  async createCustomer(email: string, name: string, propertyId: string) {
    return stripe.customers.create({
      email,
      name,
      metadata: { propertyId },
    });
  },

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    propertyId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    return stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { propertyId },
      subscription_data: {
        metadata: { propertyId },
        trial_period_days: 14,
      },
    });
  },

  async createPortalSession(customerId: string, returnUrl: string) {
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  },

  async getSubscription(subscriptionId: string) {
    return stripe.subscriptions.retrieve(subscriptionId);
  },

  async cancelSubscription(subscriptionId: string) {
    return stripe.subscriptions.cancel(subscriptionId);
  },

  constructWebhookEvent(payload: Buffer, signature: string) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  },

  getPriceId(tier: string): string {
    return PLAN_PRICES[tier.toLowerCase()] || '';
  },
};

export { stripe };
