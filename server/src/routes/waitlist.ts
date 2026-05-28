import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';

const router = Router();

router.post(
  '/',
  [body('email').isEmail().normalizeEmail()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Please provide a valid email address' });
      return;
    }

    const { email } = req.body as { email: string };

    emailService.sendWaitlistNotification(email).catch((err: unknown) => {
      logger.error(`Waitlist notification failed for ${email}: ${(err as Error).message}`);
    });

    res.json({ success: true });
  }
);

export default router;
