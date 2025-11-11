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

  // Фон - более светлый градиент для лучшей читаемости
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.5, '#1e293b');
  gradient.addColorStop(1, '#334155');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Компактная компоновка - уменьшаем отступы
  const padding = width * 0.04;
  const avatarSize = Math.min(width * 0.3, height * 0.5);
  const avatarX = padding;
  const avatarY = padding + (height - avatarSize - padding * 2) / 2; // Центрируем по вертикали

  // Загружаем аватарку через sharp для лучшей обработки
  let avatarImage: any = null;
  if (profile.avatar_url) {
    try {
      let avatarUrl = profile.avatar_url;
      if (!avatarUrl.startsWith('http')) {
        avatarUrl = `https://${avatarUrl.replace(/^https?:\/\//, '')}`;
      }
      
      const avatarResponse = await fetch(avatarUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (avatarResponse.ok) {
        const avatarBuffer = await avatarResponse.arrayBuffer();
        try {
          // Обрабатываем через sharp для гарантированной загрузки и конвертации
          const processedAvatar = await sharp(Buffer.from(avatarBuffer))
            .resize(Math.ceil(avatarSize * 2), Math.ceil(avatarSize * 2), {
              fit: 'cover',
              position: 'center',
            })
            .png()
            .toBuffer();
          avatarImage = await loadImage(processedAvatar);
        } catch (sharpError) {
          // Если sharp не смог обработать, пробуем напрямую
          console.error('Sharp error, trying direct load:', sharpError);
          try {
            avatarImage = await loadImage(Buffer.from(avatarBuffer));
          } catch (directError) {
            console.error('Direct load also failed:', directError);
          }
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

  // Рисуем рамку для SW уровня (внешняя, более толстая)
  if (swRating !== null) {
    const swLevel = getSWLevel(swRating);
    ctx.strokeStyle = swLevel.color;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius + 6, 0, Math.PI * 2);
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
    // Placeholder с инициалами - более контрастный
    ctx.fillStyle = '#475569';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(avatarSize * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = (profile.full_name || profile.username || 'U').substring(0, 2).toUpperCase();
    ctx.fillText(initials, avatarCenterX, avatarCenterY);
  }
  ctx.restore();

  // Компактная компоновка справа от аватарки
  const contentX = avatarX + avatarSize + padding;
  const contentY = avatarY;
  const contentWidth = width - contentX - padding;

  // Имя пользователя - более крупное и контрастное
  const nameY = contentY + avatarSize * 0.15;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.05)}px sans-serif`;
  ctx.textAlign = 'left';
  const displayName = (profile.full_name || profile.username || 'User').substring(0, 30);
  ctx.fillText(displayName, contentX, nameY);

  // Username - более заметный
  const usernameY = nameY + Math.floor(width * 0.04);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.floor(width * 0.032)}px sans-serif`;
  ctx.fillText(`@${profile.username || profile.user_id.slice(0, 12)}`, contentX, usernameY);

  // SW рейтинг - компактно под username
  const swY = usernameY + Math.floor(width * 0.055);
  if (swRating !== null) {
    const swLevel = getSWLevel(swRating);
    const swColor = SW_LEVEL_COLORS[swLevel.name];
    const swBoxHeight = Math.floor(width * 0.09);
    const swBoxY = swY - swBoxHeight / 2;
    const swBoxWidth = Math.min(contentWidth * 0.7, width * 0.4);
    const borderRadius = 15;
    
    // Более яркий фон для SW
    ctx.fillStyle = swColor.bg;
    roundRect(ctx, contentX, swBoxY, swBoxWidth, swBoxHeight, borderRadius);
    ctx.fill();
    
    // Белая рамка для контраста
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    roundRect(ctx, contentX, swBoxY, swBoxWidth, swBoxHeight, borderRadius);
    ctx.stroke();
    
    // Текст SW - белый, жирный
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.038)}px sans-serif`;
    ctx.fillText('SW', contentX + Math.floor(width * 0.02), swY + Math.floor(width * 0.018));
    
    // Значение SW - крупное
    ctx.fillText(swRating.toLocaleString(), contentX + Math.floor(width * 0.12), swY + Math.floor(width * 0.018));
    
    // Уровень SW справа
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.026)}px sans-serif`;
    const levelText = swLevel.name;
    const levelTextWidth = ctx.measureText(levelText).width;
    ctx.fillText(levelText, contentX + swBoxWidth - levelTextWidth - Math.floor(width * 0.02), swY + Math.floor(width * 0.018));
  }

  // TF рейтинг - компактно под SW
  const tfY = swY + Math.floor(width * 0.08);
  const tfColor = tfRating >= 100 ? '#c084fc' : tfRating >= 60 ? '#7affc0' : '#ff6677';
  const tfBoxHeight = Math.floor(width * 0.09);
  const tfBoxY = tfY - tfBoxHeight / 2;
  const tfBoxWidth = Math.min(contentWidth * 0.7, width * 0.4);
  const borderRadius = 15;
  
  // Яркий фон для TF
  ctx.fillStyle = tfColor;
  roundRect(ctx, contentX, tfBoxY, tfBoxWidth, tfBoxHeight, borderRadius);
  ctx.fill();
  
  // Белая рамка для контраста
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  roundRect(ctx, contentX, tfBoxY, tfBoxWidth, tfBoxHeight, borderRadius);
  ctx.stroke();
  
  // Текст TF - белый, жирный
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(width * 0.038)}px sans-serif`;
  ctx.fillText('TF', contentX + Math.floor(width * 0.02), tfY + Math.floor(width * 0.018));
  
  // Значение TF - крупное
  ctx.fillText(`${tfRating}%`, contentX + Math.floor(width * 0.12), tfY + Math.floor(width * 0.018));

  // QR код - справа внизу, компактно
  try {
    const qrSize = Math.floor(Math.min(width * 0.2, height * 0.25));
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
    const qrY = height - qrSize - padding - Math.floor(width * 0.04);
    
    // Белый фон с тенью для QR кода
    const qrPadding = 12;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qrX - qrPadding, qrY - qrPadding, qrSize + qrPadding * 2, qrSize + qrPadding * 2, 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    
    // Текст под QR кодом - более контрастный
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(width * 0.022)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Scan QR', qrX + qrSize / 2, qrY + qrSize + Math.floor(width * 0.025));
    ctx.font = `${Math.floor(width * 0.016)}px sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('View Profile', qrX + qrSize / 2, qrY + qrSize + Math.floor(width * 0.045));
  } catch (err) {
    console.error('Error generating QR code:', err);
  }

  // Логотип/текст Sigmet.app - слева внизу, компактно
  const logoY = height - padding - Math.floor(width * 0.03);
  ctx.fillStyle = '#60a5fa';
  ctx.font = `bold ${Math.floor(width * 0.045)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('Sigmet.app', contentX, logoY);
  
  // Подзаголовок - более заметный
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.floor(width * 0.022)}px sans-serif`;
  ctx.fillText('Social Network', contentX, logoY + Math.floor(width * 0.035));

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
