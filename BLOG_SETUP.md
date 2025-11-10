# Blog System Setup

## Database Migration

Before using the blog system, you need to run the SQL migration:

1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Run the migration file: `supabase/migrations/183_blog_system.sql`

Or run it via CLI:
```bash
supabase migration up
```

## Features

- **Two post types**: Guidelines and Change Log
- **Admin-only editing**: Only `seosasha@gmail.com` can create/edit posts
- **Comments**: Authenticated users can comment on posts
- **Media support**: Add media URLs to posts
- **Publishing**: Posts can be published immediately or saved as drafts

## API Endpoints

- `GET /api/blog/posts.list` - List published posts
- `GET /api/blog/posts.get?slug=...` - Get post by slug
- `GET /api/blog/posts.get?id=...` - Get post by ID (admin only)
- `POST /api/blog/posts.create` - Create post (admin only)
- `PUT /api/blog/posts.update?id=...` - Update post (admin only)
- `DELETE /api/blog/posts.delete?id=...` - Delete post (admin only)
- `GET /api/blog/comments.list?post_id=...` - List comments
- `POST /api/blog/comments.create` - Create comment
- `PUT /api/blog/comments.update?id=...` - Update comment
- `DELETE /api/blog/comments.delete?id=...` - Delete comment

## Pages

- `/blog` - Blog listing page
- `/blog/[slug]` - Individual post page
- `/blog/admin/create` - Create new post (admin only)
- `/blog/admin/edit/[id]` - Edit post (admin only)
