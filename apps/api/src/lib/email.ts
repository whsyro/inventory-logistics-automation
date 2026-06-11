import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../env.js';

let transporterPromise: Promise<{ transporter: Transporter; mode: string }> | null = null;

async function buildTransporter() {
  // 1) Real SMTP if configured.
  if (env.SMTP_HOST) {
    return {
      mode: 'smtp',
      transporter: nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE ?? false,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      }),
    };
  }

  // 2) Preview: Ethereal test inbox (gives a clickable preview URL). Needs internet.
  if (env.MAIL_TRANSPORT === 'ethereal') {
    try {
      const account = await nodemailer.createTestAccount();
      return {
        mode: 'ethereal',
        transporter: nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: account.user, pass: account.pass },
        }),
      };
    } catch {
      console.warn('[email] Could not reach Ethereal; falling back to offline json transport.');
    }
  }

  // 3) Offline: build the message but don't send it (logged to the server console).
  return { mode: 'json', transporter: nodemailer.createTransport({ jsonTransport: true }) };
}

function getTransporter() {
  if (!transporterPromise) transporterPromise = buildTransporter();
  return transporterPromise;
}

export interface SendResult {
  mode: string;
  /** A clickable preview URL when using the Ethereal test inbox; null otherwise. */
  previewUrl: string | null;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const { transporter, mode } = await getTransporter();
  const info = await transporter.sendMail({ from: env.MAIL_FROM, ...opts });

  const previewUrl = mode === 'ethereal' ? (nodemailer.getTestMessageUrl(info) || null) : null;

  if (mode === 'ethereal' && previewUrl) {
    console.log(`[email] Sent "${opts.subject}" to ${opts.to} — preview: ${previewUrl}`);
  } else if (mode === 'json') {
    console.log(`[email] (offline) "${opts.subject}" to ${opts.to}`);
  } else {
    console.log(`[email] Sent "${opts.subject}" to ${opts.to}`);
  }

  return { mode, previewUrl };
}
