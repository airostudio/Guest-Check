import nodemailer from 'nodemailer';
import config from '../config/config';
import logger from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

const baseUrl = config.clientUrl;

export const emailService = {
  async sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
    const link = `${baseUrl}/verify-email/${token}`;
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: 'Verify your GuestCheck account',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1d4ed8;">Welcome to GuestCheck, ${firstName}!</h1>
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
    const link = `${baseUrl}/reset-password/${token}`;
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: 'Reset your GuestCheck password',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1d4ed8;">Password Reset Request</h1>
          <p>Hi ${firstName}, we received a request to reset your password.</p>
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
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: 'Your GuestCheck property has been approved!',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Congratulations, ${firstName}!</h1>
          <p><strong>${propertyName}</strong> has been verified and approved on GuestCheck.</p>
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
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: 'GuestCheck property verification update',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">Verification Update</h1>
          <p>Hi ${firstName}, unfortunately we were unable to verify <strong>${propertyName}</strong>.</p>
          <p><strong>Reason:</strong> ${reason}</p>
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
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: `GuestCheck ${isHigh ? '⚠️ High-Risk' : 'Caution: Below-Average'} Guest — ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:${isHigh ? '#fef2f2;border:1px solid #fca5a5' : '#fffbeb;border:1px solid #fcd34d'};border-radius:8px;padding:16px;margin-bottom:16px;">
            <h1 style="color:${isHigh ? '#dc2626' : '#b45309'};margin:0;">${isHigh ? '⚠️ High-Risk Guest Alert' : '⚡ Below-Average Guest Alert'}</h1>
          </div>
          <p>${isHigh ? 'A guest with a <strong>very poor</strong> review history' : 'A guest with a <strong>below-average</strong> review history'} has an upcoming booking at <strong>${propertyName}</strong>.</p>
          <p><strong>Guest:</strong> ${guestName}</p>
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
          `<li style="margin-bottom:8px;"><strong>${c.guestName}</strong> — <a href="${baseUrl}/reviews/new?bookingId=${c.bookingId}" style="color:#476832;">Leave review →</a></li>`
      )
      .join('');

    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: `Reminder: ${checkouts.length} guest${checkouts.length > 1 ? 's' : ''} checked out yesterday — leave a review`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color:#385128;">Don't forget to review your guests, ${firstName}!</h1>
          <p>The following guest${checkouts.length > 1 ? 's' : ''} checked out from <strong>${propertyName}</strong> yesterday and ${checkouts.length > 1 ? 'haven\'t' : 'hasn\'t'} been reviewed yet:</p>
          <ul style="padding-left:20px;line-height:1.8;">${rows}</ul>
          <p>Your reviews help the whole GuestCheck community — and they improve your own guest intelligence over time.</p>
          <a href="${baseUrl}/reviews/new" style="display:inline-block;background:#385128;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            Go to Reviews
          </a>
          <p style="color:#6b7280;font-size:13px;">You're receiving this because you manage <strong>${propertyName}</strong> on GuestCheck.</p>
        </div>
      `,
    });
  },

  async sendWaitlistNotification(signupEmail: string): Promise<void> {
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to: config.waitlistNotifyEmail,
      subject: `New GuestCheck waitlist signup: ${signupEmail}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #385128;">New waitlist signup</h2>
          <p style="font-size: 18px;"><strong>${signupEmail}</strong> just joined the GuestCheck waitlist.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 13px;">Sent automatically from your GuestCheck coming soon page.</p>
        </div>
      `,
    });
  },
};
