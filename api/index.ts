/**
 * Vercel Serverless Function entry point.
 *
 * Vercel routes every request that matches /api/* (see vercel.json) to this
 * file. Exporting the Express `app` directly works because Express implements
 * the same (req, res) handler signature that Vercel's Node.js runtime expects.
 *
 * All environment variables are injected by Vercel at runtime — no .env file
 * is needed or read in production.
 */
import app from '../server/src/app';

export default app;
