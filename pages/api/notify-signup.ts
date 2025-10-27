import type { NextApiRequest, NextApiResponse } from 'next';
import * as nodemailer from 'nodemailer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { email, fullName } = req.body || {};
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SIGNUP_NOTIFY_TO,
    SIGNUP_NOTIFY_FROM
  } = process.env as Record<string, string | undefined>;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SIGNUP_NOTIFY_TO) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: SIGNUP_NOTIFY_FROM || SMTP_USER,
      to: SIGNUP_NOTIFY_TO,
      subject: 'New Sigmet signup',
      text: `New user signed up.
Email: ${email}
Name: ${fullName || '(empty)'}
Time: ${new Date().toISOString()}`
    });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('notify-signup error:', e?.message);
    return res.status(200).json({ ok: true, skipped: true });
  }
}
