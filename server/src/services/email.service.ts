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
    to: string, propertyName: string, guestName: string, rating: number
  ): Promise<void> {
    await transporter.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to,
      subject: `GuestCheck Alert: High-risk guest incoming at ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:16px;">
            <h1 style="color:#dc2626;margin:0;">⚠️ High-Risk Guest Alert</h1>
          </div>
          <p>A guest with a very poor review history has an upcoming booking at <strong>${propertyName}</strong>.</p>
          <p><strong>Guest:</strong> ${guestName}</p>
          <p><strong>Average Rating:</strong> ${rating}/6</p>
          <p>We recommend reviewing their full profile and taking appropriate precautions.</p>
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">
            View Guest Profile
          </a>
        </div>
      `,
    });
  },
};
