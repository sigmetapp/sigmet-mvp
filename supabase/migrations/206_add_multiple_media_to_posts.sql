-- Add support for multiple images and videos in posts
-- Add new array columns for multiple media files
alter table if exists public.posts
  add column if not exists image_urls text[] default '{}'::text[],
  add column if not exists video_urls text[] default '{}'::text[];

-- Migrate existing single image_url and video_url to arrays for backward compatibility
-- This ensures old posts with single media still work
update public.posts
set image_urls = case 
  when image_url is not null and image_url != '' then array[image_url]
  else '{}'::text[]
end,
video_urls = case 
  when video_url is not null and video_url != '' then array[video_url]
  else '{}'::text[]
end
where (image_url is not null and image_url != '') or (video_url is not null and video_url != '');

-- Keep image_url and video_url columns for backward compatibility
-- They can be removed in a future migration if needed
