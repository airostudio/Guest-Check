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

// ─────────────────────────────────────────────────────────────────────────────
// Shared email layout
//
// Email clients are not browsers: Outlook renders with Word, Gmail strips most
// <style>, and flex/grid are unsupported. So everything below is table-based
// with inline styles, a 600px max width, and web-safe font stacks (Fraunces and
// Great Vibes from the site won't load, so Georgia carries the display voice).
//
// Palette matches the site — cream + sage green. The emails previously used the
// pre-rebrand blue (#1d4ed8), which no longer appears anywhere in the product.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  ink: '#1e2b16',        // brand-900 — primary text
  inkSoft: '#4a5a3d',    // muted body text
  inkFaint: '#8a9580',   // captions, legal
  sage: '#5d8142',       // brand-500 — accents
  forest: '#385128',     // brand-700 — buttons, header
  forestDeep: '#1e2b16', // brand-900 — header band
  mist: '#a4bd80',       // brand-300 — on-dark accent
  cream: '#fdfaf2',      // page background
  creamSoft: '#f8f1de',  // panel background
  border: '#e6dfcc',     // hairlines
  white: '#ffffff',
  danger: '#b3261e',
  dangerSoft: '#fdf0ef',
  warn: '#8a5a00',
  warnSoft: '#fdf6e6',
} as const;

const FONT_BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const FONT_DISPLAY = "Georgia,'Times New Roman',serif";

type Tone = 'brand' | 'danger' | 'warning';

const TONES: Record<Tone, { bar: string; band: string; onBand: string }> = {
  brand:   { bar: C.sage,   band: C.forestDeep, onBand: C.mist },
  danger:  { bar: C.danger, band: '#3a1512',    onBand: '#f7b4ae' },
  warning: { bar: '#c98a00', band: '#3d2c05',   onBand: '#f5cd72' },
};

/** Hidden preview line shown in the inbox list beside the subject. */
function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.cream};opacity:0;">${esc(text)}</div>`;
}

/** Table-based CTA — an <a> with padding collapses in Outlook. */
export function button(label: string, url: string, tone: Tone = 'brand'): string {
  const href = safeUrl(url) ?? '#';
  const bg = tone === 'danger' ? C.danger : tone === 'warning' ? '#8a5a00' : C.forest;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border-radius:8px;">
        <a href="${href}"
           style="display:inline-block;padding:14px 30px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:${C.white};text-decoration:none;border-radius:8px;letter-spacing:.01em;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Key/value rows for structured detail blocks. */
export function detailRows(rows: Array<[string, string] | null>): string {
  const cells = rows
    .filter((r): r is [string, string] => Array.isArray(r) && Boolean(r[1]))
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:9px 0;font-family:${FONT_BODY};font-size:13px;color:${C.inkFaint};width:42%;vertical-align:top;border-bottom:1px solid ${C.border};">${esc(label)}</td>
        <td style="padding:9px 0;font-family:${FONT_BODY};font-size:14px;color:${C.ink};vertical-align:top;border-bottom:1px solid ${C.border};">${value}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">${cells}</table>`;
}

/** Callout panel for warnings and highlights. */
export function panel(body: string, tone: Tone = 'brand'): string {
  const bg = tone === 'danger' ? C.dangerSoft : tone === 'warning' ? C.warnSoft : C.creamSoft;
  const edge = tone === 'danger' ? C.danger : tone === 'warning' ? '#c98a00' : C.sage;
  const fg = tone === 'danger' ? C.danger : tone === 'warning' ? C.warn : C.ink;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background:${bg};border-left:3px solid ${edge};border-radius:6px;padding:16px 18px;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${fg};">
        ${body}
      </td>
    </tr>
  </table>`;
}

/** Turn an enum value like BOUTIQUE_HOTEL into "Boutique Hotel". */
export function humanise(value: string): string {
  if (!value) return '';
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .replace(/\bAnd\b/g, '&')
    .replace(/\bBed & Breakfast\b/, 'Bed & Breakfast');
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${C.inkSoft};">${html}</p>`;
}

interface LayoutOptions {
  preview: string;
  eyebrow?: string;
  heading: string;
  tone?: Tone;
  content: string;
  footerNote?: string;
}

/** Wraps content in the branded shell. All callers go through this. */
function layout({ preview, eyebrow, heading, tone = 'brand', content, footerNote }: LayoutOptions): string {
  const t = TONES[tone];
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};-webkit-font-smoothing:antialiased;">
${preheader(preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <!-- Wordmark -->
        <tr>
          <td style="padding:0 4px 18px;">
            <span style="font-family:${FONT_DISPLAY};font-size:19px;font-weight:bold;color:${C.forest};letter-spacing:-.01em;">Guest Check</span>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:${C.white};border:1px solid ${C.border};border-radius:14px;overflow:hidden;">

            <!-- Accent rule -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:4px;background:${t.bar};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <!-- Header band -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${t.band};padding:30px 36px;">
                  ${eyebrow ? `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:${t.onBand};margin-bottom:9px;">${esc(eyebrow)}</div>` : ''}
                  <h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:26px;line-height:1.25;font-weight:normal;color:${C.white};">${esc(heading)}</h1>
                </td>
              </tr>
            </table>

            <!-- Body -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:32px 36px 34px;">${content}</td></tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:22px 8px 8px;">
            ${footerNote ? `<p style="margin:0 0 12px;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${C.inkFaint};">${footerNote}</p>` : ''}
            <p style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${C.inkFaint};">
              Guest Check · The verified guest review platform for accommodation businesses<br />
              <span style="color:#b0b8a5;">&copy; ${new Date().getFullYear()} GuestCheck Ltd. All rights reserved.</span>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}


export const emailService = {
  async sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
    const link = `${baseUrl}/verify-email/${encodeURIComponent(token)}`;
    await send({
      to,
      subject: 'Verify your Guest Check account',
      html: layout({
        preview: 'Confirm your email address to activate your Guest Check account.',
        eyebrow: 'Welcome',
        heading: `Welcome to Guest Check, ${esc(firstName)}`,
        content: `
          ${paragraph('Thanks for registering. Confirm your email address to activate your account.')}
          ${button('Verify email address', link)}
          ${paragraph(`This link expires in 24 hours. Once verified, our team reviews your property listing &mdash; usually within 24 hours.`)}
        `,
        footerNote: `If you didn't create this account, you can safely ignore this email.`,
      }),
    });
  },

  async sendPasswordResetEmail(to: string, firstName: string, token: string): Promise<void> {
    const link = `${baseUrl}/reset-password/${encodeURIComponent(token)}`;
    await send({
      to,
      subject: 'Reset your Guest Check password',
      html: layout({
        preview: 'A link to set a new password. Expires in one hour.',
        eyebrow: 'Account security',
        heading: 'Reset your password',
        content: `
          ${paragraph(`Hi ${esc(firstName)}, we received a request to reset the password on your Guest Check account.`)}
          ${button('Choose a new password', link)}
          ${paragraph('This link expires in <strong>one hour</strong> and can only be used once.')}
        `,
        footerNote: `If you didn't request this, no action is needed &mdash; your password stays as it is.`,
      }),
    });
  },

  async sendPropertyApprovedEmail(to: string, firstName: string, propertyName: string): Promise<void> {
    await send({
      to,
      subject: `${propertyName.replace(/[\r\n]+/g, ' ')} is verified and live on Guest Check`,
      html: layout({
        preview: `${propertyName} has been approved. Your account is now active.`,
        eyebrow: 'Verification complete',
        heading: 'Your property is approved',
        content: `
          ${paragraph(`Good news, ${esc(firstName)} &mdash; <strong style="color:${C.ink};">${esc(propertyName)}</strong> has been verified and is now live on Guest Check.`)}
          ${paragraph('Your account is active and you can start straight away:')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
            ${[
              ['Look up arriving guests', 'Search by name, email or phone and see verified review history from every property.'],
              ['Leave guest reviews', 'Rate guests 0&ndash;6 across cleanliness, communication, rule adherence and property respect.'],
              ['Connect your booking systems', 'Sync reservations automatically from Booking.com and Airbnb.'],
              ['Turn on caller ID', 'See a guest&rsquo;s profile the moment they call reception.'],
            ].map(([t, d]) => `
            <tr>
              <td style="padding:11px 0;border-bottom:1px solid ${C.border};">
                <div style="font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${C.ink};margin-bottom:3px;">${t}</div>
                <div style="font-family:${FONT_BODY};font-size:13px;line-height:1.55;color:${C.inkFaint};">${d}</div>
              </td>
            </tr>`).join('')}
          </table>
          ${button('Go to your dashboard', `${baseUrl}/dashboard`)}
        `,
      }),
    });
  },

  async sendPropertyRejectedEmail(
    to: string, firstName: string, propertyName: string, reason: string
  ): Promise<void> {
    await send({
      to,
      subject: 'Update on your Guest Check application',
      html: layout({
        preview: `We were unable to verify ${propertyName}.`,
        eyebrow: 'Application update',
        heading: 'We couldn’t verify your property',
        tone: 'warning',
        content: `
          ${paragraph(`Hi ${esc(firstName)}, thanks for applying. Unfortunately we weren't able to verify <strong style="color:${C.ink};">${esc(propertyName)}</strong> at this time.`)}
          ${panel(`<strong style="display:block;margin-bottom:4px;">Reason given</strong>${esc(reason)}`, 'warning')}
          ${paragraph('If you think this was decided in error, or you can supply further documentation, just reply to this email and a member of our team will take another look.')}
        `,
      }),
    });
  },

  async sendHighRiskAlert(
    to: string, propertyName: string, guestName: string,
    rating: number, riskLevel: 'HIGH_RISK' | 'POOR' = 'HIGH_RISK'
  ): Promise<void> {
    const isHigh = riskLevel === 'HIGH_RISK';
    await send({
      to,
      subject: `${isHigh ? 'High-risk' : 'Caution'}: ${guestName.replace(/[\r\n]+/g, ' ')} has booked at ${propertyName.replace(/[\r\n]+/g, ' ')}`,
      html: layout({
        preview: `${guestName} has a ${isHigh ? 'very poor' : 'below-average'} review history across the network.`,
        eyebrow: isHigh ? 'High-risk guest' : 'Caution advised',
        heading: isHigh ? 'A high-risk guest has booked' : 'A below-average guest has booked',
        tone: isHigh ? 'danger' : 'warning',
        content: `
          ${paragraph(`A guest with a <strong style="color:${C.ink};">${isHigh ? 'very poor' : 'below-average'}</strong> review history has an upcoming booking at <strong style="color:${C.ink};">${esc(propertyName)}</strong>.`)}
          ${detailRows([
            ['Guest', `<strong>${esc(guestName)}</strong>`],
            ['Network rating', rating > 0 ? `${rating.toFixed(1)} / 6` : 'Not yet rated'],
            ['Risk level', isHigh ? 'High risk' : 'Below average'],
          ])}
          ${panel(
            isHigh
              ? 'We strongly recommend reviewing this guest&rsquo;s full history before check-in, and briefing the team on arrival.'
              : 'Worth reviewing their profile and taking sensible precautions at check-in.',
            isHigh ? 'danger' : 'warning'
          )}
          ${button('View guest profile', `${baseUrl}/dashboard`, isHigh ? 'danger' : 'warning')}
        `,
        footerNote: `You receive these because you are an administrator of ${esc(propertyName)}.`,
      }),
    });
  },

  async sendReviewNudgeEmail(
    to: string,
    firstName: string,
    propertyName: string,
    checkouts: Array<{ guestName: string; bookingId: string }>
  ): Promise<void> {
    const plural = checkouts.length > 1;
    const rows = checkouts
      .map(
        (c) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${C.border};font-family:${FONT_BODY};font-size:15px;color:${C.ink};">
          ${esc(c.guestName)}
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid ${C.border};">
          <a href="${baseUrl}/reviews/new?bookingId=${encodeURIComponent(c.bookingId)}"
             style="font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${C.sage};text-decoration:none;">Review &rarr;</a>
        </td>
      </tr>`
      )
      .join('');

    await send({
      to,
      subject: `${checkouts.length} guest${plural ? 's' : ''} checked out yesterday — leave a review`,
      html: layout({
        preview: `${checkouts.length} recent checkout${plural ? 's are' : ' is'} waiting for your review.`,
        eyebrow: 'Reminder',
        heading: plural ? 'You have guests to review' : 'You have a guest to review',
        content: `
          ${paragraph(`Hi ${esc(firstName)} &mdash; ${plural ? 'these guests' : 'this guest'} checked out of <strong style="color:${C.ink};">${esc(propertyName)}</strong> yesterday and ${plural ? "haven't" : "hasn't"} been reviewed yet.`)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">${rows}</table>
          ${paragraph('Reviews take under a minute, and they&rsquo;re what makes every other property&rsquo;s risk data &mdash; and yours &mdash; accurate.')}
          ${button('Leave your reviews', `${baseUrl}/reviews/new`)}
        `,
        footerNote: `You receive these because you manage ${esc(propertyName)} on Guest Check.`,
      }),
    });
  },

  async sendWaitlistNotification(signupEmail: string): Promise<void> {
    await send({
      to: config.waitlistNotifyEmail,
      subject: `New waitlist signup: ${signupEmail.replace(/[\r\n]+/g, ' ')}`,
      html: layout({
        preview: `${signupEmail} joined the Guest Check waitlist.`,
        eyebrow: 'Waitlist',
        heading: 'New waitlist signup',
        content: `
          ${detailRows([
            ['Email', `<a href="mailto:${encodeURIComponent(signupEmail)}" style="color:${C.sage};text-decoration:none;">${esc(signupEmail)}</a>`],
            ['Source', 'Coming soon page'],
          ])}
          ${paragraph('The full list is available in the admin area.')}
        `,
        footerNote: 'Sent automatically from guestcheck.site.',
      }),
    });
  },

  /** Confirmation to the person who joined the waitlist. */
  async sendWaitlistConfirmation(to: string): Promise<void> {
    await send({
      to,
      subject: "You're on the Guest Check waitlist",
      html: layout({
        preview: "You're on the list. We'll email you the moment we open for registrations.",
        eyebrow: 'Launching soon',
        heading: "You're on the list",
        content: `
          ${paragraph('Thanks for your interest in Guest Check.')}
          ${paragraph('Guest Check is the verified guest review platform built for accommodation owners and managers &mdash; look up an arriving guest&rsquo;s review history from every verified property, before you hand over the key.')}
          ${panel(`<strong style="display:block;margin-bottom:4px;color:${C.ink};">Early members get an extended free trial</strong>We&rsquo;ll email you as soon as registrations open.`)}
        `,
        footerNote: `You received this because this address was entered on guestcheck.site. If that wasn't you, simply ignore this email &mdash; you won't hear from us again.`,
      }),
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
    // Every value here originates from the UNAUTHENTICATED registration body,
    // so all of it is escaped and URLs are protocol-checked before rendering.
    const link = (url: string) => {
      const href = safeUrl(url);
      return href ? `<a href="${href}" rel="noopener noreferrer" style="color:${C.sage};">${href}</a>` : esc(url);
    };

    const section = (title: string, rows: Array<[string, string] | null>) => `
      <div style="font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.sage};margin:26px 0 2px;">${esc(title)}</div>
      ${detailRows(rows)}`;

    await send({
      to: config.waitlistNotifyEmail,
      replyTo: details.applicantEmail,
      subject: `New application: ${details.propertyName} (${details.propertyCity}, ${details.propertyCountry})`.replace(/[\r\n]+/g, ' '),
      html: layout({
        preview: `${details.propertyName} in ${details.propertyCity} has applied to join. Review before activating.`,
        eyebrow: 'Action required',
        heading: 'New property application',
        content: `
          ${paragraph(`<strong style="color:${C.ink};font-size:17px;">${esc(details.propertyName)}</strong><br /><span style="color:${C.inkFaint};">${esc(details.propertyCity)}, ${esc(details.propertyCountry)}</span>`)}

          ${section('Applicant', [
            ['Name', esc(details.applicantName)],
            ['Email', `<a href="mailto:${encodeURIComponent(details.applicantEmail)}" style="color:${C.sage};">${esc(details.applicantEmail)}</a>`],
            ['Phone', esc(details.applicantPhone)],
            ['Role', esc(details.jobTitle)],
          ])}

          ${section('Property', [
            ['Type', esc(humanise(details.propertyType))],
            ['Rooms / units', esc(details.numberOfRooms)],
            ['Address', `${esc(details.propertyAddress)}, ${esc(details.propertyCity)}, ${esc(details.propertyCountry)}`],
            ['Phone', esc(details.propertyPhone)],
            ['Website', details.propertyWebsite ? link(details.propertyWebsite) : ''],
          ])}

          ${section('Business identity', [
            ['Legal name', esc(details.legalBusinessName || details.propertyName)],
            ['Registration no.', `<strong>${esc(details.businessRegNumber)}</strong>`],
            ['VAT / GST', esc(details.vatNumber)],
            ['Incorporated in', esc(details.countryOfIncorporation)],
            ['Years operating', esc(details.yearsInOperation)],
          ])}

          ${section('Online presence', [
            ['Platforms', esc(details.bookingPlatforms.join(', '))],
            ['Booking.com', details.listingUrlBookingCom ? link(details.listingUrlBookingCom) : ''],
            ['Airbnb', details.listingUrlAirbnb ? link(details.listingUrlAirbnb) : ''],
            ['Other listing', details.listingUrlOther ? link(details.listingUrlOther) : ''],
            ['Memberships', esc(details.industryMemberships)],
            ['Heard via', esc(details.howHeard)],
          ])}

          ${panel('<strong>Verify before approving.</strong> Approving activates every user on this property and grants access to the full guest review network.', 'warning')}
          ${button('Open admin dashboard', `${baseUrl}/admin`)}
        `,
        footerNote: 'Reply to this email to contact the applicant directly.',
      }),
    });
  },

  async sendApplicationReceived(to: string, firstName: string, propertyName: string): Promise<void> {
    const steps: Array<[string, string]> = [
      ['We review your application', 'Usually within 24 hours.'],
      ['We may call to verify', 'On the direct number you provided.'],
      ['You receive your decision', "Once approved, you'll get a confirmation email and can sign in."],
    ];

    await send({
      to,
      subject: `We've received your application for ${propertyName.replace(/[\r\n]+/g, ' ')}`,
      html: layout({
        preview: 'Your application is with our verification team. Here’s what happens next.',
        eyebrow: 'Application received',
        heading: 'Thanks — we have your application',
        content: `
          ${paragraph(`Hi ${esc(firstName)}, thanks for applying to join Guest Check with <strong style="color:${C.ink};">${esc(propertyName)}</strong>.`)}
          ${paragraph('Every property is verified by a person before activation &mdash; it&rsquo;s what keeps the review data trustworthy. Here&rsquo;s what happens next:')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">
            ${steps.map(([t, d], i) => `
            <tr>
              <td width="34" valign="top" style="padding:12px 0;">
                <div style="width:24px;height:24px;background:${C.creamSoft};border-radius:12px;text-align:center;font-family:${FONT_BODY};font-size:12px;font-weight:700;color:${C.forest};line-height:24px;">${i + 1}</div>
              </td>
              <td valign="top" style="padding:12px 0;">
                <div style="font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${C.ink};margin-bottom:2px;">${t}</div>
                <div style="font-family:${FONT_BODY};font-size:13px;line-height:1.55;color:${C.inkFaint};">${d}</div>
              </td>
            </tr>`).join('')}
          </table>
          ${panel(`<strong style="display:block;margin-bottom:4px;color:${C.ink};">Please don&rsquo;t try to sign in yet</strong>Your account stays inactive until verification is complete. You&rsquo;ll know the moment it&rsquo;s ready.`)}
        `,
        footerNote: 'Questions in the meantime? Just reply to this email.',
      }),
    });
  },
};
