import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, limit = '20', offset = '0' } = req.query;
    const admin = supabaseAdmin();

    let query = admin
      .from('blog_posts')
      .select(`
        id,
        title,
        slug,
        excerpt,
        type,
        published_at,
        created_at,
        updated_at,
        author_id
      `);

    // Only show published posts (published_at is not null)
    // Filter out null published_at values - use isNotNull() for better compatibility
    query = query.not('published_at', 'is', null);

    if (type && (type === 'guideline' || type === 'changelog')) {
      query = query.eq('type', type);
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    
    query = query
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error } = await query;
    
    console.log('Blog posts query result:', { 
      dataLength: data?.length, 
      error: error ? JSON.stringify(error, null, 2) : null,
      samplePost: data?.[0] ? { id: data[0].id, title: data[0].title, published_at: data[0].published_at } : null
    });

    if (error) {
      console.error('Error fetching blog posts:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Check if table doesn't exist
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Blog table not found. Please run migration 183_blog_system.sql',
          details: error.message
        });
      }
      
      return res.status(500).json({ 
        error: `Failed to fetch blog posts: ${error.message || 'Unknown error'}`,
        details: error
      });
    }

    // Return posts without profiles for list view (profiles can be fetched on detail page)
    return res.status(200).json({ posts: data || [] });
  } catch (error: any) {
    console.error('Error in blog posts list API:', error);
    console.error('Error stack:', error?.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error?.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
}
