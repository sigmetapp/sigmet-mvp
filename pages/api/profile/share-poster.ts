import type { NextApiRequest, NextApiResponse } from 'next';
import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { resolveAvatarUrl } from '@/lib/utils';

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

  // Простой темный фон (без градиента для надежности)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // Компактная компоновка
  const padding = Math.floor(width * 0.04);
  const avatarSize = Math.floor(Math.min(width * 0.28, height * 0.48));
  const avatarX = padding;
  const avatarY = Math.floor((height - avatarSize) / 2);

  // Загружаем аватарку - используем resolveAvatarUrl для правильной нормализации
  let avatarImage: any = null;
  if (profile.avatar_url) {
    try {
      const resolvedUrl = resolveAvatarUrl(profile.avatar_url);
      if (resolvedUrl) {
        console.log('Loading avatar from:', resolvedUrl);
        const avatarResponse = await fetch(resolvedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
        });
        
        if (avatarResponse.ok) {
          const avatarBuffer = await avatarResponse.arrayBuffer();
          const buffer = Buffer.from(avatarBuffer);
          
          // Пробуем обработать через sharp
          try {
            const processed = await sharp(buffer)
              .resize(avatarSize * 2, avatarSize * 2, {
                fit: 'cover',
                position: 'center',
              })
              .toFormat('png')
              .toBuffer();
            avatarImage = await loadImage(processed);
            console.log('Avatar loaded via sharp');
          } catch (sharpErr) {
            // Fallback: пробуем напрямую
            console.log('Sharp failed, trying direct load');
            avatarImage = await loadImage(buffer);
            console.log('Avatar loaded directly');
          }
        } else {
          console.error('Avatar response not OK:', avatarResponse.status);
        }
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
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Рисуем аватарку или placeholder
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
  ctx.clip();
  
  if (avatarImage) {
    try {
      ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
      console.log('Avatar drawn successfully');
    } catch (drawErr) {
      console.error('Error drawing avatar:', drawErr);
      // Fallback to placeholder
      ctx.fillStyle = '#475569';
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
  } else {
    // Placeholder с инициалами
    ctx.fillStyle = '#475569';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = '#ffffff';
    const fontSize = Math.floor(avatarSize * 0.4);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = (profile.full_name || profile.username || 'U').substring(0, 2).toUpperCase();
    ctx.fillText(initials, avatarCenterX, avatarCenterY);
    console.log('Placeholder drawn with initials:', initials);
  }
  ctx.restore();

  // Компактная компоновка справа от аватарки
  const contentX = avatarX + avatarSize + padding;
  const contentY = avatarY;
  const contentWidth = width - contentX - padding;

  // Имя пользователя - белый, жирный, крупный
  const nameY = contentY + Math.floor(avatarSize * 0.2);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.052)}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const displayName = (profile.full_name || profile.username || 'User').substring(0, 25);
  ctx.fillText(displayName, contentX, nameY);
  console.log('Name drawn:', displayName);

  // Username
  const usernameY = nameY + Math.floor(width * 0.045);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `bold ${Math.floor(width * 0.035)}px Arial`;
  const username = `@${profile.username || profile.user_id.slice(0, 12)}`;
  ctx.fillText(username, contentX, usernameY);
  console.log('Username drawn:', username);

  // SW рейтинг - компактно под username
  const swY = usernameY + Math.floor(width * 0.06);
  if (swRating !== null) {
    const swLevel = getSWLevel(swRating);
    const swColor = SW_LEVEL_COLORS[swLevel.name];
    const swBoxHeight = Math.floor(width * 0.095);
    const swBoxY = swY - swBoxHeight / 2;
    const swBoxWidth = Math.min(contentWidth * 0.75, width * 0.42);
    const borderRadius = 16;
    
    // Яркий цветной фон для SW
    ctx.fillStyle = swColor.bg;
    roundRect(ctx, contentX, swBoxY, swBoxWidth, swBoxHeight, borderRadius);
    ctx.fill();
    
    // Белая рамка для контраста
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    roundRect(ctx, contentX, swBoxY, swBoxWidth, swBoxHeight, borderRadius);
    ctx.stroke();
    
    // Текст SW - белый, жирный, крупный
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.042)}px Arial`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SW', contentX + Math.floor(width * 0.025), swY);
    
    // Значение SW - крупное
    const swValue = swRating.toLocaleString();
    ctx.fillText(swValue, contentX + Math.floor(width * 0.13), swY);
    
    // Уровень SW справа
    ctx.font = `bold ${Math.floor(width * 0.028)}px Arial`;
    const levelText = swLevel.name;
    const levelTextWidth = ctx.measureText(levelText).width;
    ctx.fillText(levelText, contentX + swBoxWidth - levelTextWidth - Math.floor(width * 0.025), swY);
    console.log('SW drawn:', swValue, swLevel.name);
  }

  // TF рейтинг - компактно под SW
  const tfY = swY + Math.floor(width * 0.085);
  const tfColor = tfRating >= 100 ? '#c084fc' : tfRating >= 60 ? '#7affc0' : '#ff6677';
  const tfBoxHeight = Math.floor(width * 0.095);
  const tfBoxY = tfY - tfBoxHeight / 2;
  const tfBoxWidth = Math.min(contentWidth * 0.75, width * 0.42);
  const borderRadius = 16;
  
  // Яркий цветной фон для TF
  ctx.fillStyle = tfColor;
  roundRect(ctx, contentX, tfBoxY, tfBoxWidth, tfBoxHeight, borderRadius);
  ctx.fill();
  
  // Белая рамка для контраста
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  roundRect(ctx, contentX, tfBoxY, tfBoxWidth, tfBoxHeight, borderRadius);
  ctx.stroke();
  
  // Текст TF - белый, жирный, крупный
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.042)}px Arial`;
  ctx.textBaseline = 'middle';
  ctx.fillText('TF', contentX + Math.floor(width * 0.025), tfY);
  
  // Значение TF - крупное
  const tfValue = `${tfRating}%`;
  ctx.fillText(tfValue, contentX + Math.floor(width * 0.13), tfY);
  console.log('TF drawn:', tfValue);

  // QR код - справа внизу
  try {
    const qrSize = Math.floor(Math.min(width * 0.22, height * 0.28));
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
    const qrX = width - qrSize - padding;
    const qrY = height - qrSize - padding - Math.floor(width * 0.05);
    
    // Белый фон для QR кода
    const qrPadding = 14;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qrX - qrPadding, qrY - qrPadding, qrSize + qrPadding * 2, qrSize + qrPadding * 2, 16);
    ctx.fill();
    
    // Черная рамка
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    roundRect(ctx, qrX - qrPadding, qrY - qrPadding, qrSize + qrPadding * 2, qrSize + qrPadding * 2, 16);
    ctx.stroke();
    
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    
    // Текст под QR кодом
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.024)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Scan QR', qrX + qrSize / 2, qrY + qrSize + Math.floor(width * 0.028));
    ctx.font = `bold ${Math.floor(width * 0.018)}px Arial`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('View Profile', qrX + qrSize / 2, qrY + qrSize + Math.floor(width * 0.05));
    console.log('QR code drawn');
  } catch (err) {
    console.error('Error generating QR code:', err);
  }

  // Логотип/текст Sigmet.app - слева внизу
  const logoY = height - padding - Math.floor(width * 0.04);
  ctx.fillStyle = '#60a5fa';
  ctx.font = `bold ${Math.floor(width * 0.048)}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Sigmet.app', contentX, logoY);
  
  // Подзаголовок
  ctx.fillStyle = '#94a3b8';
  ctx.font = `bold ${Math.floor(width * 0.024)}px Arial`;
  ctx.fillText('Social Network', contentX, logoY + Math.floor(width * 0.038));
  console.log('Logo drawn');

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
