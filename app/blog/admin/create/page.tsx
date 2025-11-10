'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/Button';
import { ArrowLeft, Save, Image as ImageIcon } from 'lucide-react';

const ADMIN_EMAILS = new Set<string>(['seosasha@gmail.com']);

export default function BlogCreatePage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [type, setType] = useState<'guideline' | 'changelog'>('guideline');
  const [publishedAt, setPublishedAt] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');

  useEffect(() => {
    checkAuth();
    // Set default published_at to now
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setPublishedAt(`${year}-${month}-${day}T${hours}:${minutes}`);
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email && ADMIN_EMAILS.has(user.email)) {
      setIsAdmin(true);
    } else {
      router.push('/blog');
    }
    setLoading(false);
  };

  const handleAddMediaUrl = () => {
    if (newMediaUrl.trim()) {
      setMediaUrls([...mediaUrls, newMediaUrl.trim()]);
      setNewMediaUrl('');
    }
  };

  const handleRemoveMediaUrl = (index: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/blog/posts.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          excerpt: excerpt.trim() || null,
          type,
          media_urls: mediaUrls,
          published_at: publishedAt || null,
        }),
      });

      const data = await response.json();
      console.log('Response status:', response.status);
      console.log('Response data:', data);
      
      if (response.ok && data.post) {
        // If post is published, redirect to post page, otherwise redirect to edit page
        if (data.post.published_at) {
          router.push(`/blog/${data.post.slug}`);
        } else {
          router.push(`/blog/admin/edit/${data.post.id}`);
        }
      } else {
        console.error('Error creating post:', data);
        const errorMessage = data.error || data.details?.message || data.message || 'Failed to create post';
        const errorDetails = data.details ? JSON.stringify(data.details, null, 2) : '';
        alert(`Error (${response.status}): ${errorMessage}\n\n${errorDetails ? `Details:\n${errorDetails}\n\n` : ''}Please check:\n1. Database migration is run (183_blog_system.sql)\n2. You are logged in as admin (seosasha@gmail.com)\n3. Check browser console for details`);
      }
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Failed to create post');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className={`${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'} p-6 rounded-xl border`}>
          <div className={`h-8 w-3/4 mb-4 rounded ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <button
        onClick={() => router.back()}
        className={`inline-flex items-center gap-2 mb-6 ${isLight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'} transition`}
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <form onSubmit={handleSubmit} className={`${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'} p-6 md:p-8 rounded-xl border`}>
        <h1 className={`text-2xl md:text-3xl font-semibold mb-6 ${isLight ? 'text-black' : 'text-white'}`}>
          Create Blog Post
        </h1>

        <div className="space-y-6">
          <div>
            <label className={`block mb-2 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
              Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="guideline"
                  checked={type === 'guideline'}
                  onChange={(e) => setType(e.target.value as 'guideline')}
                  className="cursor-pointer"
                />
                <span className={isLight ? 'text-black' : 'text-white'}>Guideline</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="changelog"
                  checked={type === 'changelog'}
                  onChange={(e) => setType(e.target.value as 'changelog')}
                  className="cursor-pointer"
                />
                <span className={isLight ? 'text-black' : 'text-white'}>Change Log</span>
              </label>
            </div>
          </div>

          <div>
            <label className={`block mb-2 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={`w-full p-3 rounded-lg border ${
                isLight
                  ? 'bg-white border-black/10 text-black placeholder-black/40 focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20'
                  : 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-primary-blue-light focus:ring-2 focus:ring-primary-blue-light/20'
              }`}
              placeholder="Enter post title"
            />
          </div>

          <div>
            <label className={`block mb-2 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
              Excerpt
            </label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className={`w-full p-3 rounded-lg border resize-none ${
                isLight
                  ? 'bg-white border-black/10 text-black placeholder-black/40 focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20'
                  : 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-primary-blue-light focus:ring-2 focus:ring-primary-blue-light/20'
              }`}
              placeholder="Brief excerpt (optional)"
            />
          </div>

          <div>
            <label className={`block mb-2 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
              Content *
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={15}
              className={`w-full p-3 rounded-lg border resize-none font-mono text-sm ${
                isLight
                  ? 'bg-white border-black/10 text-black placeholder-black/40 focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20'
                  : 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-primary-blue-light focus:ring-2 focus:ring-primary-blue-light/20'
              }`}
              placeholder="Enter post content (HTML supported)"
            />
            <p className={`mt-2 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
              You can use HTML tags for formatting
            </p>
          </div>

          <div>
            <label className={`block mb-2 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
              Published Date
            </label>
            <input
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              className={`w-full p-3 rounded-lg border ${
                isLight
                  ? 'bg-white border-black/10 text-black focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20'
                  : 'bg-white/5 border-white/10 text-white focus:border-primary-blue-light focus:ring-2 focus:ring-primary-blue-light/20'
              }`}
            />
            <p className={`mt-2 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
              Leave empty to save as draft
            </p>
          </div>

          <div>
            <label className={`block mb-2 font-medium ${isLight ? 'text-black' : 'text-white'}`}>
              Media URLs
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="url"
                value={newMediaUrl}
                onChange={(e) => setNewMediaUrl(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMediaUrl();
                  }
                }}
                className={`flex-1 p-3 rounded-lg border ${
                  isLight
                    ? 'bg-white border-black/10 text-black placeholder-black/40 focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20'
                    : 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-primary-blue-light focus:ring-2 focus:ring-primary-blue-light/20'
                }`}
                placeholder="Enter media URL"
              />
              <Button
                type="button"
                onClick={handleAddMediaUrl}
                className={isLight ? 'bg-primary-blue text-white' : 'bg-primary-blue-light text-white'}
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
            </div>
            {mediaUrls.length > 0 && (
              <div className="space-y-2">
                {mediaUrls.map((url, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded border">
                    <img src={url} alt={`Media ${index + 1}`} className="w-16 h-16 object-cover rounded" />
                    <span className={`flex-1 text-sm truncate ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                      {url}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMediaUrl(index)}
                      className={isLight ? 'text-red-600' : 'text-red-400'}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              className={isLight ? 'text-black/60' : 'text-white/60'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !title.trim() || !content.trim()}
              className={isLight ? 'bg-primary-blue text-white' : 'bg-primary-blue-light text-white'}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Publish'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
