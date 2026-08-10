import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { db } from '../lib/supabase';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

interface WaitlistRow {
  id: string;
  email: string;
  notified: boolean;
}

router.post(
  '/',
  [
    // trim() must come first — a pasted address with a trailing space failed
    // isEmail() and the signup was rejected. Subaddress/dot stripping is
    // disabled so we email exactly the address the person entered.
    body('email')
      .trim()
      .isEmail()
      .normalizeEmail({
        gmail_remove_dots: false,
        gmail_remove_subaddress: false,
        outlookdotcom_remove_subaddress: false,
        yahoo_remove_subaddress: false,
        icloud_remove_subaddress: false,
      }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Please provide a valid email address' });
      return;
    }

    const { email } = req.body as { email: string };
    const normalized = email.toLowerCase().trim();

    // Persist FIRST. The notification email is a convenience; the row is the
    // record. Previously the signup existed only as a fire-and-forget email,
    // so a dropped promise or an SMTP failure lost the lead with no trace.
    let alreadyOnList = false;
    try {
      await db.insert<WaitlistRow>('Waitlist', {
        id: crypto.randomBytes(12).toString('base64url'),
        email: normalized,
        source: 'coming-soon',
        ipAddress: req.ip ?? null,
        notified: false,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = (err as Error).message || '';
      // Unique index on lower(email) — a repeat signup is success, not an error.
      if (msg.includes('duplicate') || msg.includes('23505')) {
        alreadyOnList = true;
      } else {
        throw err;
      }
    }

    if (alreadyOnList) {
      res.json({ success: true, alreadyOnList: true });
      return;
    }

    // Await both sends so they are not dropped when the serverless instance
    // freezes on response. A send failure must not fail the request — the
    // signup is already saved — so it is logged and reconciled via `notified`.
    const [notifyResult, confirmResult] = await Promise.allSettled([
      emailService.sendWaitlistNotification(normalized),
      emailService.sendWaitlistConfirmation(normalized),
    ]);

    if (notifyResult.status === 'fulfilled') {
      await db.update('Waitlist', { email: normalized }, { notified: true }).catch(() => {});
    } else {
      logger.error(
        `Waitlist admin notification FAILED for ${normalized}: ${notifyResult.reason?.message ?? notifyResult.reason}`
      );
    }

    if (confirmResult.status === 'rejected') {
      logger.warn(
        `Waitlist confirmation to subscriber failed for ${normalized}: ${confirmResult.reason?.message ?? confirmResult.reason}`
      );
    }

    // The signup is recorded regardless — email delivery is reported separately
    // so a misconfigured mailer is visible instead of silently losing leads.
    res.json({ success: true, notified: notifyResult.status === 'fulfilled' });
  })
);

export default router;
