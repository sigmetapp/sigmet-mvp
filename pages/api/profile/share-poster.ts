import type { NextApiRequest, NextApiResponse } from 'next';
import { createCanvas, loadImage, registerFont } from 'canvas';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseServer';

// Размеры для разных платформ
const PLATFORM_SIZES: Record<string, { width: number; height: number }> = {
  facebook: { width: 1200, height: 630 },
  twitter: { width: 1200, height: 675 },
  instagram: { width: 1080, height: 1080 },
  telegram: { width: 1200, height: 630 },
};

// Цветовые схемы для SW уровней
const SW_LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Beginner': { bg: '#9ca3af', text: '#ffffff', border: '#6b7280' },
  'Growing': { bg: '#60a5fa', text: '#ffffff', border: '#3b82f6' },
  'Advance': { bg: '#a78bfa', text: '#ffffff', border: '#8b5cf6' },
  'Expert': { bg: '#fbbf24', text: '#ffffff', border: '#f59e0b' },
  'Leader': { bg: '#fb923c', text: '#ffffff', border: '#f97316' },
  'Angel': { bg: '#f472b6', text: '#ffffff', border: '#ec4899' },
};

function getSWLevel(sw: number): { name: string; color: string } {
  if (sw >= 50000) return { name: 'Angel', color: SW_LEVEL_COLORS['Angel'].bg };
  if (sw >= 10000) return { name: 'Leader', color: SW_LEVEL_COLORS['Leader'].bg };
  if (sw >= 2000) return { name: 'Expert', color: SW_LEVEL_COLORS['Expert'].bg };
  if (sw >= 500) return { name: 'Advance', color: SW_LEVEL_COLORS['Advance'].bg };
  if (sw >= 100) return { name: 'Growing', color: SW_LEVEL_COLORS['Growing'].bg };
  return { name: 'Beginner', color: SW_LEVEL_COLORS['Beginner'].bg };
}

// Helper function для скругленных прямоугольников
function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

async function generatePoster(
  profile: any,
  swRating: number | null,
  tfRating: number,
  profileUrl: string,
  platform: string
): Promise<Buffer> {
  const size = PLATFORM_SIZES[platform] || PLATFORM_SIZES.facebook;
  const { width, height } = size;

  // Создаем canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Фон - градиент
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Загружаем аватарку
  let avatarImage: any = null;
  const avatarSize = Math.min(width * 0.25, height * 0.4);
  const avatarX = width * 0.1;
  const avatarY = height * 0.15;

  if (profile.avatar_url) {
    try {
      // Пробуем загрузить аватарку
      const avatarUrl = profile.avatar_url.startsWith('http') 
        ? profile.avatar_url 
        : `https://${profile.avatar_url.replace(/^https?:\/\//, '')}`;
      
      const avatarResponse = await fetch(avatarUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });
      
      if (avatarResponse.ok) {
        const avatarBuffer = await avatarResponse.arrayBuffer();
        avatarImage = await loadImage(Buffer.from(avatarBuffer));
      }
    } catch (err) {
      console.error('Error loading avatar:', err);
    }
  }

  // Рисуем круглую аватарку с рамкой
  const avatarCenterX = avatarX + avatarSize / 2;
  const avatarCenterY = avatarY + avatarSize / 2;
  const avatarRadius = avatarSize / 2;

  // Рисуем рамку для SW уровня (внешняя)
  if (swRating !== null) {
    const swLevel = getSWLevel(swRating);
    ctx.strokeStyle = swLevel.color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Рисуем аватарку или placeholder
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
  ctx.clip();
  
  if (avatarImage) {
    ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    // Placeholder с инициалами
    ctx.fillStyle = '#374151';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = '#9ca3af';
    ctx.font = `bold ${Math.floor(avatarSize * 0.3)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = (profile.full_name || profile.username || 'U').substring(0, 2).toUpperCase();
    ctx.fillText(initials, avatarCenterX, avatarCenterY);
  }
  ctx.restore();

  // Имя пользователя
  const nameX = avatarX + avatarSize + width * 0.05;
  const nameY = avatarY + avatarSize * 0.25;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.045)}px Arial`;
  ctx.textAlign = 'left';
  const displayName = profile.full_name || profile.username || 'User';
  ctx.fillText(displayName, nameX, nameY);

  // Username
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${Math.floor(width * 0.028)}px Arial`;
  ctx.fillText(`@${profile.username || profile.user_id.slice(0, 8)}`, nameX, nameY + Math.floor(width * 0.055));

  // SW рейтинг
  const swY = nameY + Math.floor(width * 0.12);
  if (swRating !== null) {
    const swLevel = getSWLevel(swRating);
    const swColor = SW_LEVEL_COLORS[swLevel.name];
    const swBoxHeight = Math.floor(width * 0.08);
    const swBoxY = swY - swBoxHeight / 2;
    
    // Скругленный фон для SW
    const swBoxWidth = width * 0.35;
    const borderRadius = 12;
    ctx.fillStyle = swColor.bg + '60';
    roundRect(ctx, nameX, swBoxY, swBoxWidth, swBoxHeight, borderRadius);
    ctx.fill();
    
    // Рамка
    ctx.strokeStyle = swColor.bg;
    ctx.lineWidth = 3;
    roundRect(ctx, nameX, swBoxY, swBoxWidth, swBoxHeight, borderRadius);
    ctx.stroke();
    
    // Текст SW
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.032)}px Arial`;
    ctx.fillText('SW', nameX + Math.floor(width * 0.015), swY + Math.floor(width * 0.015));
    
    // Значение SW
    ctx.fillText(swRating.toLocaleString(), nameX + Math.floor(width * 0.09), swY + Math.floor(width * 0.015));
    
    // Уровень SW
    ctx.fillStyle = swColor.bg;
    ctx.font = `bold ${Math.floor(width * 0.022)}px Arial`;
    ctx.fillText(swLevel.name, nameX + Math.floor(width * 0.25), swY + Math.floor(width * 0.015));
  }

  // TF рейтинг
  const tfY = swY + Math.floor(width * 0.12);
  const tfColor = tfRating >= 100 ? '#c084fc' : tfRating >= 60 ? '#7affc0' : '#ff6677';
  const tfBoxHeight = Math.floor(width * 0.08);
  const tfBoxY = tfY - tfBoxHeight / 2;
  
    // Скругленный фон для TF
    const tfBoxWidth = width * 0.35;
    const borderRadius = 12;
    ctx.fillStyle = tfColor + '60';
    roundRect(ctx, nameX, tfBoxY, tfBoxWidth, tfBoxHeight, borderRadius);
    ctx.fill();
  
  // Рамка
  ctx.strokeStyle = tfColor;
  ctx.lineWidth = 3;
  roundRect(ctx, nameX, tfBoxY, tfBoxWidth, tfBoxHeight, borderRadius);
  ctx.stroke();
  
  // Текст TF
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.032)}px Arial`;
  ctx.fillText('TF', nameX + Math.floor(width * 0.015), tfY + Math.floor(width * 0.015));
  
  // Значение TF
  ctx.fillText(`${tfRating}%`, nameX + Math.floor(width * 0.09), tfY + Math.floor(width * 0.015));

  // Генерируем QR код
  try {
    const qrSize = Math.floor(width * 0.18);
    const qrCodeDataUrl = await QRCode.toDataURL(profileUrl, {
      width: qrSize,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    
    const qrImage = await loadImage(qrCodeDataUrl);
    const qrX = width - qrSize - width * 0.05;
    const qrY = height - qrSize - width * 0.08;
    
    // Белый фон с тенью для QR кода
    const padding = 15;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    
    // Текст под QR кодом
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.018)}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('Scan QR code', qrX + qrSize / 2, qrY + qrSize + Math.floor(width * 0.03));
    ctx.font = `${Math.floor(width * 0.014)}px Arial`;
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('to view profile', qrX + qrSize / 2, qrY + qrSize + Math.floor(width * 0.05));
  } catch (err) {
    console.error('Error generating QR code:', err);
  }

  // Логотип/текст Sigmet.app
  const logoY = height - width * 0.06;
  ctx.fillStyle = '#60a5fa';
  ctx.font = `bold ${Math.floor(width * 0.04)}px Arial`;
  ctx.textAlign = 'left';
  ctx.fillText('Sigmet.app', nameX, logoY);
  
  // Подзаголовок
  ctx.fillStyle = '#9ca3af';
  ctx.font = `${Math.floor(width * 0.02)}px Arial`;
  ctx.fillText('Social Network Platform', nameX, logoY + Math.floor(width * 0.03));

  // Конвертируем canvas в buffer
  const buffer = canvas.toBuffer('image/png');
  
  // Используем sharp для оптимизации
  return await sharp(buffer)
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = supabaseAdmin();

  // Получаем пользователя из сессии
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let userId: string | undefined;
  let user: any = null;

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    user = authUser;
    userId = (req.query.user_id as string) || user.id;
  } catch (authErr: any) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const platform = (req.query.platform as string) || 'facebook';
  if (!PLATFORM_SIZES[platform]) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    // Загружаем профиль
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError || !profileData) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Получаем SW рейтинг
    let swRating: number | null = null;
    try {
      const swResponse = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/sw/calculate?user_id=${encodeURIComponent(userId)}`, {
        headers: {
          'Authorization': authHeader,
        },
      });
      if (swResponse.ok) {
        const swData = await swResponse.json();
        swRating = swData.totalSW || null;
      }
    } catch (err) {
      console.error('Error fetching SW:', err);
    }

    // Получаем TF рейтинг
    let tfRating = 80; // default
    try {
      const { data: feedbackData } = await supabase
        .from('trust_feedback')
        .select('value')
        .eq('target_user_id', userId);
      
      if (feedbackData) {
        const sum = feedbackData.reduce((acc, r) => acc + (Number(r.value) || 0), 0);
        tfRating = Math.max(0, Math.min(120, 80 + sum * 2));
      }
    } catch (err) {
      console.error('Error fetching TF:', err);
    }

    // Генерируем URL профиля
    const baseUrl = req.headers.origin || 'https://sigmet.app';
    const profileUrl = `${baseUrl}/u/${encodeURIComponent(profileData.username || profileData.user_id)}`;

    // Генерируем постер
    const posterBuffer = await generatePoster(
      profileData,
      swRating,
      tfRating,
      profileUrl,
      platform
    );

    // Отправляем изображение
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="sigmet-profile-${platform}-${Date.now()}.png"`);
    res.send(posterBuffer);
  } catch (error: any) {
    console.error('Error generating poster:', error);
    return res.status(500).json({ error: 'Failed to generate poster', details: error.message });
  }
}
