'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { useTheme } from '@/components/ThemeProvider';

export default function AdminProjectsPage() {
  return (
    <RequireAuth>
      <AdminProjectsInner />
    </RequireAuth>
  );
}

type Project = {
  id?: number;
  title: string;
  description: string;
  author_id?: string;
  author_email?: string;
  author_username?: string;
  status?: 'active' | 'inactive' | 'pending';
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
};

function AdminProjectsInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Project>({
    title: '',
    description: '',
    status: 'active',
    metadata: {},
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || '';
      const allowed = email === 'seosasha@gmail.com';
      setIsAdmin(allowed);
      if (!allowed && typeof window !== 'undefined') {
        window.location.href = '/';
      } else if (allowed) {
        loadProjects();
      }
    })();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/projects.list');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load projects');
      setProjects(json.projects || []);
    } catch (e: any) {
      console.error('Failed to load projects', e);
      alert(e?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      let data: Project | Project[];

      try {
        data = JSON.parse(text);
      } catch (e) {
        alert('Invalid JSON file');
        return;
      }

      const projectsArray = Array.isArray(data) ? data : [data];
      
      const resp = await fetch('/api/admin/projects.upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: projectsArray }),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to upload projects');

      alert(`Successfully uploaded ${projectsArray.length} project(s)`);
      await loadProjects();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (e: any) {
      console.error('Failed to upload projects', e);
      alert(e?.message || 'Failed to upload projects');
    } finally {
      setUploading(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setUploading(true);
    try {
      const resp = await fetch('/api/admin/projects.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to create project');

      alert('Project created successfully!');
      setFormData({ title: '', description: '', status: 'active', metadata: {} });
      setShowForm(false);
      await loadProjects();
    } catch (e: any) {
      console.error('Failed to create project', e);
      alert(e?.message || 'Failed to create project');
    } finally {
      setUploading(false);
    }
  }

  async function deleteProject(projectId: number) {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    
    try {
      const resp = await fetch('/api/admin/projects.delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to delete project');

      alert('Project deleted successfully!');
      await loadProjects();
    } catch (e: any) {
      console.error('Failed to delete project', e);
      alert(e?.message || 'Failed to delete project');
    }
  }

  if (isAdmin === null) {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center ${isLight ? 'text-black/80' : 'text-white/80'}`}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-[60vh]">
      <div className={`max-w-7xl mx-auto px-4 py-6`}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={`text-2xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            Project Management
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(!showForm)}
              className={`px-4 py-2 rounded-xl font-medium transition ${
                isLight
                  ? 'border border-black/20 text-black/70 hover:bg-black/5'
                  : 'border border-white/20 text-white/70 hover:bg-white/5'
              }`}
            >
              {showForm ? 'Cancel' : 'Add Project'}
            </button>
            <button
              onClick={loadProjects}
              disabled={loading}
              className={`px-4 py-2 rounded-xl font-medium transition ${
                isLight
                  ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark'
                  : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark'
              } disabled:opacity-60`}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* File Upload Section */}
        <div className={`mb-6 rounded-xl border p-6 ${
          isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
        } shadow-lg`}>
          <h2 className={`text-lg font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
            Upload Projects from File
          </h2>
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="project-file-input"
            />
            <label
              htmlFor="project-file-input"
              className={`px-4 py-2 rounded-xl font-medium transition cursor-pointer ${
                uploading
                  ? 'opacity-60 cursor-not-allowed'
                  : isLight
                  ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark'
                  : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark'
              }`}
            >
              {uploading ? 'Uploading...' : 'Choose JSON File'}
            </label>
            <span className={`text-sm ${isLight ? 'text-black/60' : 'text-white/60'}`}>
              Upload a JSON file with project data (single object or array of objects)
            </span>
          </div>
        </div>

        {/* Form Section */}
        {showForm && (
          <div className={`mb-6 rounded-xl border p-6 ${
            isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
          } shadow-lg`}>
            <h2 className={`text-lg font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>
              Create New Project
            </h2>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-black/80' : 'text-white/80'
                }`}>
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className={`w-full rounded-xl border px-4 py-2 outline-none transition ${
                    isLight
                      ? 'border-black/10 bg-white text-black focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                      : 'border-white/10 bg-white/5 text-white focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                  }`}
                  placeholder="Project title"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-black/80' : 'text-white/80'
                }`}>
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={4}
                  className={`w-full rounded-xl border px-4 py-2 outline-none transition resize-none ${
                    isLight
                      ? 'border-black/10 bg-white text-black placeholder-black/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                      : 'border-white/10 bg-white/5 text-white placeholder-white/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                  }`}
                  placeholder="Project description"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-black/80' : 'text-white/80'
                }`}>
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                  className={`w-full rounded-xl border px-4 py-2 outline-none transition ${
                    isLight
                      ? 'border-black/10 bg-white text-black focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                      : 'border-white/10 bg-white/5 text-white focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                  }`}
                  style={isLight ? {} : { colorScheme: 'dark' }}
                >
                  <option value="active" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>Active</option>
                  <option value="inactive" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>Inactive</option>
                  <option value="pending" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>Pending</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={uploading}
                  className={`px-6 py-2.5 rounded-xl font-medium transition ${
                    isLight
                      ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                      : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]'
                  } disabled:opacity-60`}
                >
                  {uploading ? 'Creating...' : 'Create Project'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ title: '', description: '', status: 'active', metadata: {} });
                  }}
                  className={`px-6 py-2.5 rounded-xl font-medium border transition ${
                    isLight
                      ? 'border-black/20 text-black/70 hover:bg-black/5'
                      : 'border-white/20 text-white/70 hover:bg-white/5'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Projects List */}
        {loading ? (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            No projects found. Upload a file or create a new project.
          </div>
        ) : (
          <div className={`rounded-xl border ${
            isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
          } overflow-hidden shadow-lg`}>
            <div className="divide-y divide-white/10">
              {projects.map((project) => (
                <div key={project.id} className={`p-6 ${
                  isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                } transition`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className={`text-lg font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
                          {project.title}
                        </h3>
                        {project.status && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            project.status === 'active'
                              ? isLight ? 'bg-green-100 text-green-800' : 'bg-green-500/20 text-green-300'
                              : project.status === 'pending'
                              ? isLight ? 'bg-yellow-100 text-yellow-800' : 'bg-yellow-500/20 text-yellow-300'
                              : isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-500/20 text-gray-300'
                          }`}>
                            {project.status}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm mb-3 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                        {project.description}
                      </p>
                      <div className={`flex items-center gap-4 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                        {project.author_username && (
                          <span>Author: {project.author_username}</span>
                        )}
                        {project.author_email && (
                          <span>Email: {project.author_email}</span>
                        )}
                        {project.created_at && (
                          <span>Created: {new Date(project.created_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    {project.id && (
                      <button
                        onClick={() => deleteProject(project.id!)}
                        className={`ml-4 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                          isLight
                            ? 'border border-red-300 text-red-700 hover:bg-red-50'
                            : 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                        }`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}