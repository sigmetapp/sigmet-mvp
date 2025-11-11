import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';
import sharp from 'sharp';

const FAVICON_SIZE = 32;
const CACHE_DURATION = 60 * 60 * 24; // 24 hours

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const admin = supabaseAdmin();
    const { data: settings } = await admin
      .from('site_settings')
      .select('logo_url')
      .eq('id', 1)
      .maybeSingle();

    if (!settings?.logo_url) {
      // Return a default transparent 32x32 PNG if no logo
      const defaultFavicon = await sharp({
        create: {
          width: FAVICON_SIZE,
          height: FAVICON_SIZE,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .png()
        .toBuffer();
      
      res.setHeader('Cache-Control', `public, max-age=300`);
      res.setHeader('Content-Type', 'image/png');
      return res.send(defaultFavicon);
    }

    // Fetch the logo image
    const logoResponse = await fetch(settings.logo_url);
    if (!logoResponse.ok) {
      // Return a default transparent 32x32 PNG if logo fetch fails
      const defaultFavicon = await sharp({
        create: {
          width: FAVICON_SIZE,
          height: FAVICON_SIZE,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .png()
        .toBuffer();
      
      res.setHeader('Cache-Control', `public, max-age=300`);
      res.setHeader('Content-Type', 'image/png');
      return res.send(defaultFavicon);
    }

    const imageBuffer = Buffer.from(await logoResponse.arrayBuffer());

    // Resize and convert to PNG favicon (closed version - darker/muted)
    const favicon = await sharp(imageBuffer)
      .resize(FAVICON_SIZE, FAVICON_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .modulate({
        brightness: 0.6, // Darker
        saturation: 0.7 // Less saturated
      })
      .png()
      .toBuffer();

    // Set cache headers
    res.setHeader('Cache-Control', `public, max-age=${CACHE_DURATION}, immutable`);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', favicon.length);

    return res.send(favicon);
  } catch (error: any) {
    console.error('Favicon-closed generation error:', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
