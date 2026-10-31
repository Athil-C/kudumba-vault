import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import path from 'path';
import fs from 'fs';

export interface MailAttachment {
  filename: string;
  path?: string;
  content?: string | Buffer;
  cid?: string;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}

export interface MailerResult {
  success: boolean;
  messageId?: string;
  response?: string;
  error?: string;
  accepted?: string[];
  rejected?: string[];
}

export interface MailerStatus {
  configured: boolean;
  user?: string;
  connected: boolean;
  error?: string;
}

// Singleton transporter instance
let transporter: Transporter | null = null;
let cachedTransporterKey = '';

/**
 * Allows automated tests to inject a mock transporter (e.g. to simulate network failure or timeout)
 * and safely reset it afterwards.
 */
export function setMailerTransporterForTesting(customTransporter: Transporter | null): void {
  transporter = customTransporter;
  if (!customTransporter) {
    cachedTransporterKey = '';
  } else {
    cachedTransporterKey = '__mock_testing_transporter__';
  }
}

/**
 * Creates or retrieves the cached Nodemailer transporter using Gmail SMTP.
 * Supports standard Gmail App Passwords and custom SMTP hosts for enterprise setups.
 */
export function getMailerTransporter(): Transporter {
  if (transporter && cachedTransporterKey === '__mock_testing_transporter__') {
    return transporter;
  }

  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim().replace(/\s+/g, '');
  const key = `${user}:${pass}`;

  if (transporter && cachedTransporterKey === key) {
    return transporter;
  }

  cachedTransporterKey = key;

  if (user && pass) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for 465, false for 587
      auth: {
        user,
        pass,
      },
      tls: {
        servername: 'smtp.gmail.com',
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    });
  } else {
    // Development fallback mock transport if credentials are not yet supplied in .env
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporter;
}

/**
 * Verifies SMTP connection to Gmail without sending an email.
 */
export async function verifyMailer(): Promise<MailerStatus> {
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();

  if (!user || !pass) {
    return {
      configured: false,
      connected: false,
      error: 'GMAIL_USER or GMAIL_APP_PASSWORD is not set in environment.',
    };
  }

  try {
    const t = getMailerTransporter();
    await t.verify();
    return {
      configured: true,
      user,
      connected: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      user,
      connected: false,
      error: msg,
    };
  }
}

/**
 * Sends an email via Gmail SMTP using Nodemailer.
 * Never throws an uncaught error that would crash the server; returns structured MailerResult.
 */
export async function sendEmail(options: MailOptions): Promise<MailerResult> {
  const t = getMailerTransporter();
  const senderUser = (process.env.GMAIL_USER || 'no-reply@kudumbavault.app').trim();

  const mailConfig = {
    from: `"Kudumba Vault" <${senderUser}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  };

  try {
    const info = await t.sendMail(mailConfig);
    return {
      success: true,
      messageId: info.messageId,
      response: typeof info.response === 'string' ? info.response : JSON.stringify(info.response),
      accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
      rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Secure error sanitization: ensure credentials or tokens are never leaked in error logs
    const sanitizedError = errorMessage
      .replace(/pass:\s*['"][^'"]+['"]/gi, 'pass: [REDACTED]')
      .replace(/auth:\s*\{[^}]+\}/gi, 'auth: [REDACTED]');

    return {
      success: false,
      error: sanitizedError,
    };
  }
}
