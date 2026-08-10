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
  [body('email').isEmail().normalizeEmail()],
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

    // Await the notification so it is not dropped when the serverless instance
    // freezes on response. A send failure must not fail the request — the
    // signup is already saved — so it is logged and reconciled via `notified`.
    try {
      await emailService.sendWaitlistNotification(normalized);
      await db.update('Waitlist', { email: normalized }, { notified: true });
    } catch (err) {
      logger.error(`Waitlist notification failed for ${normalized}: ${(err as Error).message}`);
    }

    res.json({ success: true });
  })
);

export default router;
