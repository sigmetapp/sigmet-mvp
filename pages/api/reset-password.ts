import type { NextApiRequest, NextApiResponse } from 'next';
import * as nodemailer from 'nodemailer';
import { supabaseAdmin } from '@/lib/supabaseServer';

type ApiResponse = { ok: boolean; message?: string; skipped?: boolean };

function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const identifier = (req.body?.identifier as string | undefined)?.trim();
  if (!identifier) {
    return res.status(400).json({ ok: false, message: 'Missing identifier' });
  }

  const admin = supabaseAdmin();

  try {
    // Look up the user either by email or by username via profiles
    let userId: string | undefined;
    let userEmail: string | undefined;
    let userMeta: Record<string, unknown> | undefined;

    if (identifier.includes('@')) {
      const { data, error } = await admin.auth.admin.getUserByEmail(identifier);
      if (error || !data?.user) {
        // Do not reveal whether the user exists
        return res.status(200).json({ ok: true });
      }
      userId = data.user.id;
      userEmail = data.user.email ?? undefined;
      userMeta = (data.user as any).user_metadata ?? {};
    } else {
      const { data: profile } = await admin
        .from('profiles')
        .select('user_id')
        .eq('username', identifier)
        .maybeSingle();

      if (!profile?.user_id) {
        // Do not reveal whether the user exists
        return res.status(200).json({ ok: true });
      }

      const { data, error } = await admin.auth.admin.getUserById(profile.user_id);
      if (error || !data?.user) {
        return res.status(200).json({ ok: true });
      }
      userId = data.user.id;
      userEmail = data.user.email ?? undefined;
      userMeta = (data.user as any).user_metadata ?? {};
    }

    if (!userId || !userEmail) {
      // Do not reveal missing email
      return res.status(200).json({ ok: true });
    }

    const tempPassword = generateTempPassword(12);

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      user_metadata: { ...(userMeta || {}), must_change_password: true },
    });

    if (updateErr) {
      return res.status(500).json({ ok: false, message: updateErr.message });
    }

    // Send the temporary password via SMTP if configured
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      RESET_PASSWORD_FROM,
    } = process.env as Record<string, string | undefined>;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      // If email is not configured, do not fail the API (avoid user enumeration)
      return res.status(200).json({ ok: true, skipped: true });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const fromAddress = RESET_PASSWORD_FROM || SMTP_USER;
    await transporter.sendMail({
      from: fromAddress,
      to: userEmail,
      subject: 'Your temporary password',
      text: `Hello!\n\nYou (or someone) requested a password reset for your Sigmet account.\n\nTemporary password: ${tempPassword}\n\nUse this password to log in. For security, you will be asked to set a new password after logging in.\n\nIf you did not request this, you can ignore this email.\n`,
    });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('reset-password handler error:', e?.message);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
}
