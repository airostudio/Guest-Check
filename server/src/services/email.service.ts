import config from '../config/config';
import logger from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Email delivery via Resend's HTTPS API.
//
// Deliberately HTTP rather than SMTP: this runs on Vercel functions, where
// outbound SMTP is unreliable/blocked and where the previous nodemailer setup
// silently failed whenever credentials were absent. Same reasoning as the
// Supabase HTTPS data layer in lib/supabase.ts — plain fetch, no TCP, no SDK.
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(config.resend.apiKey && config.resend.fromEmail);
}

let warnedUnconfigured = false;

function fromHeader(): string {
  // Resend requires the From domain to be verified in the account.
  return config.resend.fromName
    ? `${config.resend.fromName} <${config.resend.fromEmail}>`
    : config.resend.fromEmail;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one email through Resend.
 *
 * Retries on 429 and 5xx. Resend's free tier allows 2 requests/second, and the
 * waitlist path sends two emails back to back, so a burst can legitimately trip
 * the limit — that must not lose the message.
 */
async function send(options: SendOptions, attempt = 1): Promise<void> {
  if (!isEmailConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.error(
        'EMAIL NOT SENT — Resend is not configured. Set RESEND_API_KEY and ' +
        'FROM_EMAIL (the From domain must be verified in your Resend account). ' +
        'No email of any kind will be delivered until these are set.'
      );
    }
    throw new Error('Email is not configured on this server (RESEND_API_KEY / FROM_EMAIL are not set)');
  }

  const MAX_ATTEMPTS = 3;

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader(),
        to: [options.to],
        subject: options.subject,
        html: options.html,
        ...(options.replyTo || config.resend.replyTo
          ? { reply_to: options.replyTo || config.resend.replyTo }
          : {}),
      }),
    });
  } catch (err) {
    // Network-level failure — worth one retry before giving up.
    if (attempt < MAX_ATTEMPTS) {
      await sleep(attempt * 500);
      return send(options, attempt + 1);
    }
    throw new Error(`Resend request failed: ${(err as Error).message}`);
  }

  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (res.ok) {
    logger.info(`Email sent to ${options.to}: ${options.subject}`, { id: body.id });
    return;
  }

  // 429 = rate limited, 5xx = transient upstream problem.
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
    const wait = res.status === 429 ? 1100 * attempt : 400 * attempt;
    logger.warn(`Resend ${res.status} for ${options.to}; retrying in ${wait}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
    await sleep(wait);
    return send(options, attempt + 1);
  }

  const message = (body.message as string) || (body.name as string) || text || `HTTP ${res.status}`;
  throw new Error(`Resend ${res.status}: ${message}`);
}

/** Connectivity check for the admin diagnostics endpoint. */
export async function verifyEmailTransport(): Promise<{ ok: boolean; message: string }> {
  if (!isEmailConfigured()) {
    const missing = [
      !config.resend.apiKey && 'RESEND_API_KEY',
      !config.resend.fromEmail && 'FROM_EMAIL',
    ].filter(Boolean);
    return { ok: false, message: `Resend is not configured. Missing: ${missing.join(', ')}` };
  }

  try {
    // Any authenticated endpoint proves the key works; /domains also lets the
    // caller confirm the From domain is actually verified.
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${config.resend.apiKey}` },
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'RESEND_API_KEY was rejected by Resend (401/403). Check the key.' };
    }
    if (!res.ok) {
      return { ok: false, message: `Resend returned HTTP ${res.status}` };
    }

    const data = (await res.json()) as { data?: { name: string; status: string }[] };
    const domains = data.data ?? [];
    const fromDomain = config.resend.fromEmail.split('@')[1]?.toLowerCase() ?? '';
    const match = domains.find((d) => d.name.toLowerCase() === fromDomain);

    if (!match) {
      return {
        ok: false,
        message:
          `API key is valid, but "${fromDomain}" is not a domain in this Resend account. ` +
          `Verified domains: ${domains.map((d) => d.name).join(', ') || 'none'}. ` +
          `Sends will be rejected until FROM_EMAIL uses a verified domain.`,
      };
    }
    if (match.status !== 'verified') {
      return { ok: false, message: `Domain "${fromDomain}" is present but its status is "${match.status}", not "verified".` };
    }

    return { ok: true, message: `Resend ready — sending as ${fromHeader()} via verified domain ${fromDomain}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

const baseUrl = config.clientUrl;

/**
 * Escape untrusted text before interpolating it into email HTML.
 * Registration and waitlist bodies are unauthenticated, so without this an
 * attacker can inject markup — including links — into the very email an admin
 * reads to decide whether to approve their application.
 */
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s) URLs into href attributes — blocks javascript:/data: URIs. */
function safeUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return esc(parsed.toString());
  } catch {
    return null;
  }
}

export const emailService = {
  async sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
    const link = `${baseUrl}/verify-email/${encodeURIComponent(token)}`;
    await send({
      to,
      subject: 'Verify your GuestCheck account',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1d4ed8;">Welcome to GuestCheck, ${esc(firstName)}!</h1>
          <p>Thank you for registering. Please verify your email address to activate your account.</p>
          <p>Your property listing will be reviewed by our team within 24 hours after verification.</p>
          <a href="${link}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            Verify Email Address
          </a>
          <p>This link expires in 24 hours.</p>
          <p style="color:#6b7280;font-size:14px;">If you didn't create this account, you can ignore this email.</p>
        </div>
      `,
    });
  },

  async sendPasswordResetEmail(to: string, firstName: string, token: string): Promise<void> {
    const link = `${baseUrl}/reset-password/${encodeURIComponent(token)}`;
    await send({
      to,
      subject: 'Reset your GuestCheck password',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1d4ed8;">Password Reset Request</h1>
          <p>Hi ${esc(firstName)}, we received a request to reset your password.</p>
          <a href="${link}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            Reset Password
          </a>
          <p>This link expires in 1 hour.</p>
          <p style="color:#6b7280;font-size:14px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
  },

  async sendPropertyApprovedEmail(to: string, firstName: string, propertyName: string): Promise<void> {
    await send({
      to,
      subject: 'Your GuestCheck property has been approved!',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Congratulations, ${esc(firstName)}!</h1>
          <p><strong>${esc(propertyName)}</strong> has been verified and approved on GuestCheck.</p>
          <p>You can now:</p>
          <ul>
            <li>Leave reviews for your guests</li>
            <li>Look up arriving guests' review history</li>
            <li>Set up booking system integrations</li>
            <li>Enable caller ID guest lookup at reception</li>
          </ul>
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:#10b981;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            Go to Dashboard
          </a>
        </div>
      `,
    });
  },

  async sendPropertyRejectedEmail(
    to: string, firstName: string, propertyName: string, reason: string
  ): Promise<void> {
    await send({
      to,
      subject: 'GuestCheck property verification update',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">Verification Update</h1>
          <p>Hi ${esc(firstName)}, unfortunately we were unable to verify <strong>${esc(propertyName)}</strong>.</p>
          <p><strong>Reason:</strong> ${esc(reason)}</p>
          <p>If you believe this is an error, please contact our support team.</p>
        </div>
      `,
    });
  },

  async sendHighRiskAlert(
    to: string, propertyName: string, guestName: string,
    rating: number, riskLevel: 'HIGH_RISK' | 'POOR' = 'HIGH_RISK'
  ): Promise<void> {
    const isHigh = riskLevel === 'HIGH_RISK';
    await send({
      to,
      subject: `GuestCheck ${isHigh ? '⚠️ High-Risk' : 'Caution: Below-Average'} Guest — ${propertyName.replace(/[\r\n]+/g, ' ')}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:${isHigh ? '#fef2f2;border:1px solid #fca5a5' : '#fffbeb;border:1px solid #fcd34d'};border-radius:8px;padding:16px;margin-bottom:16px;">
            <h1 style="color:${isHigh ? '#dc2626' : '#b45309'};margin:0;">${isHigh ? '⚠️ High-Risk Guest Alert' : '⚡ Below-Average Guest Alert'}</h1>
          </div>
          <p>${isHigh ? 'A guest with a <strong>very poor</strong> review history' : 'A guest with a <strong>below-average</strong> review history'} has an upcoming booking at <strong>${esc(propertyName)}</strong>.</p>
          <p><strong>Guest:</strong> ${esc(guestName)}</p>
          <p><strong>Average Rating:</strong> ${rating > 0 ? `${rating.toFixed(1)}/6` : 'No rating yet'}</p>
          <p>${isHigh ? 'We strongly recommend reviewing their full profile before check-in.' : 'Please review their profile and take appropriate precautions.'}</p>
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:${isHigh ? '#dc2626' : '#d97706'};color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            View Guest Profile
          </a>
        </div>
      `,
    });
  },

  async sendReviewNudgeEmail(
    to: string,
    firstName: string,
    propertyName: string,
    checkouts: Array<{ guestName: string; bookingId: string }>
  ): Promise<void> {
    const rows = checkouts
      .map(
        (c) =>
          `<li style="margin-bottom:8px;"><strong>${esc(c.guestName)}</strong> — <a href="${baseUrl}/reviews/new?bookingId=${encodeURIComponent(c.bookingId)}" style="color:#476832;">Leave review →</a></li>`
      )
      .join('');

    await send({
      to,
      subject: `Reminder: ${checkouts.length} guest${checkouts.length > 1 ? 's' : ''} checked out yesterday — leave a review`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color:#385128;">Don't forget to review your guests, ${firstName}!</h1>
          <p>The following guest${checkouts.length > 1 ? 's' : ''} checked out from <strong>${esc(propertyName)}</strong> yesterday and ${checkouts.length > 1 ? 'haven\'t' : 'hasn\'t'} been reviewed yet:</p>
          <ul style="padding-left:20px;line-height:1.8;">${rows}</ul>
          <p>Your reviews help the whole GuestCheck community — and they improve your own guest intelligence over time.</p>
          <a href="${baseUrl}/reviews/new" style="display:inline-block;background:#385128;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            Go to Reviews
          </a>
          <p style="color:#6b7280;font-size:13px;">You're receiving this because you manage <strong>${esc(propertyName)}</strong> on GuestCheck.</p>
        </div>
      `,
    });
  },

  async sendWaitlistNotification(signupEmail: string): Promise<void> {
    await send({
      to: config.waitlistNotifyEmail,
      subject: `New GuestCheck waitlist signup: ${signupEmail.replace(/[\r\n]+/g, ' ')}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #385128;">New waitlist signup</h2>
          <p style="font-size: 18px;"><strong>${esc(signupEmail)}</strong> just joined the GuestCheck waitlist.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 13px;">Sent automatically from your GuestCheck coming soon page.</p>
        </div>
      `,
    });
  },

  /** Confirmation to the person who joined the waitlist. */
  async sendWaitlistConfirmation(to: string): Promise<void> {
    await send({
      to,
      subject: "You're on the GuestCheck waitlist",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#1e2b16;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#a4bd80;margin:0;font-size:20px;">You're on the list</h1>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p>Thanks for your interest in GuestCheck.</p>
            <p>
              GuestCheck is the verified guest review platform built for accommodation
              owners and managers — look up an arriving guest's review history from every
              verified property before they check in.
            </p>
            <p>We'll email you as soon as we open for registrations. Early members get an extended free trial.</p>
            <p style="color:#6b7280;font-size:13px;margin-top:24px;">
              You received this because this address was entered on guestcheck.site.
              If that wasn't you, simply ignore this email — you won't hear from us again.
            </p>
          </div>
        </div>
      `,
    });
  },

  async sendNewApplicationAlert(details: {
    applicantName: string; applicantEmail: string; applicantPhone: string; jobTitle: string;
    propertyName: string; propertyType: string; propertyAddress: string;
    propertyCity: string; propertyCountry: string; numberOfRooms: string;
    legalBusinessName: string; businessRegNumber: string; vatNumber: string;
    countryOfIncorporation: string; yearsInOperation: string;
    propertyWebsite: string; propertyPhone: string;
    bookingPlatforms: string[]; listingUrlBookingCom: string;
    listingUrlAirbnb: string; listingUrlOther: string;
    industryMemberships: string; howHeard: string;
  }): Promise<void> {
    // Every value below originates from the UNAUTHENTICATED registration body,
    // so all of it is escaped and URLs are protocol-checked before rendering.
    const row = (label: string, value: string) =>
      value
        ? `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;width:200px;vertical-align:top">${esc(label)}</td><td style="padding:6px 12px;color:#111827">${value}</td></tr>`
        : '';

    const linkRow = (label: string, url: string) => {
      const href = safeUrl(url);
      return href
        ? row(label, `<a href="${href}" rel="noopener noreferrer">${href}</a>`)
        : row(label, esc(url));
    };

    await send({
      to: config.waitlistNotifyEmail,
      subject: `New GuestCheck application: ${details.propertyName} — ${details.propertyCity}, ${details.propertyCountry}`
        .replace(/[\r\n]+/g, ' '),
      html: `
        <div style="font-family: sans-serif; max-width: 680px; margin: 0 auto;">
          <div style="background:#1e2b16;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#a4bd80;margin:0;font-size:20px;">New Property Application</h1>
            <p style="color:#6b8f4e;margin:4px 0 0;font-size:14px;">Review and verify before activating</p>
          </div>

          <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
            <div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0;font-weight:700;color:#111827;font-size:16px;">${esc(details.propertyName)}</p>
              <p style="margin:2px 0 0;color:#6b7280;font-size:13px;">${esc(details.propertyCity)}, ${esc(details.propertyCountry)}</p>
            </div>

            <table style="width:100%;border-collapse:collapse;">
              <tr style="background:#f0f4ea;"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#385128;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Applicant</td></tr>
              ${row('Name', esc(details.applicantName))}
              ${row('Email', `<a href="mailto:${encodeURIComponent(details.applicantEmail)}">${esc(details.applicantEmail)}</a>`)}
              ${row('Phone', esc(details.applicantPhone))}
              ${row('Role', esc(details.jobTitle))}

              <tr style="background:#f0f4ea;"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#385128;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Property</td></tr>
              ${row('Property type', esc(details.propertyType))}
              ${row('Number of rooms', esc(details.numberOfRooms))}
              ${row('Address', `${esc(details.propertyAddress)}, ${esc(details.propertyCity)}, ${esc(details.propertyCountry)}`)}
              ${row('Property phone', esc(details.propertyPhone))}
              ${linkRow('Website', details.propertyWebsite)}

              <tr style="background:#f0f4ea;"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#385128;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Business Identity</td></tr>
              ${row('Legal business name', esc(details.legalBusinessName || details.propertyName))}
              ${row('Business reg number', esc(details.businessRegNumber))}
              ${row('VAT / GST number', esc(details.vatNumber))}
              ${row('Country of incorporation', esc(details.countryOfIncorporation))}
              ${row('Years in operation', esc(details.yearsInOperation))}

              <tr style="background:#f0f4ea;"><td colspan="2" style="padding:8px 12px;font-weight:700;color:#385128;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Online Presence</td></tr>
              ${row('Platforms', esc(details.bookingPlatforms.join(', ')))}
              ${linkRow('Booking.com URL', details.listingUrlBookingCom)}
              ${linkRow('Airbnb URL', details.listingUrlAirbnb)}
              ${linkRow('Other listing URL', details.listingUrlOther)}
              ${row('Industry memberships', esc(details.industryMemberships))}
              ${row('How they heard', esc(details.howHeard))}
            </table>

            <div style="padding:16px;background:#fef9c3;border-top:1px solid #fde68a;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                <strong>Action required:</strong> Log in to the GuestCheck admin panel to approve or reject this application.
              </p>
            </div>
          </div>
        </div>
      `,
    });
  },

  async sendApplicationReceived(to: string, firstName: string, propertyName: string): Promise<void> {
    await send({
      to,
      subject: `Your GuestCheck application has been received — ${propertyName.replace(/[\r\n]+/g, ' ')}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#1e2b16;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h1 style="color:#a4bd80;margin:0;font-size:20px;">Application Received</h1>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p>Hi ${esc(firstName)},</p>
            <p>Thank you for applying to join GuestCheck with <strong>${esc(propertyName)}</strong>.</p>
            <p>Your application is now being reviewed by our team. Here's what happens next:</p>
            <ol style="line-height:2;">
              <li>We review your application details (usually within 24 hours)</li>
              <li>We may contact you on your provided phone number to verify your details</li>
              <li>Once approved, you'll receive a confirmation email with your login details</li>
            </ol>
            <p style="color:#6b7280;font-size:13px;margin-top:24px;">
              If you have any questions in the meantime, please reply to this email.<br/>
              <strong>Do not attempt to log in until you receive your approval email</strong> — your account will not be active until verification is complete.
            </p>
          </div>
        </div>
      `,
    });
  },
};
