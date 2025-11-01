'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { useTheme } from '@/components/ThemeProvider';

export default function TicketsPage() {
  return (
    <RequireAuth>
      <TicketsInner />
    </RequireAuth>
  );
}

type Ticket = {
  id: number;
  user_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  admin_notes: string | null;
};

function TicketsInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    setLoading(true);
    try {
      const resp = await fetch('/api/tickets/list');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load tickets');
      setTickets(json.tickets || []);
    } catch (e: any) {
      console.error('Failed to load tickets', e);
      alert(e?.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      alert('Please fill in both title and description');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to create ticket');
      setTitle('');
      setDescription('');
      await loadTickets();
      alert('Ticket created successfully!');
    } catch (e: any) {
      console.error('Failed to create ticket', e);
      alert(e?.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'open':
        return isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/20 text-blue-300';
      case 'in_progress':
        return isLight ? 'bg-yellow-100 text-yellow-800' : 'bg-yellow-500/20 text-yellow-300';
      case 'resolved':
        return isLight ? 'bg-green-100 text-green-800' : 'bg-green-500/20 text-green-300';
      case 'closed':
        return isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-500/20 text-gray-300';
      default:
        return isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-500/20 text-gray-300';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'open':
        return 'Open';
      case 'in_progress':
        return 'In Progress';
      case 'resolved':
        return 'Resolved';
      case 'closed':
        return 'Closed';
      default:
        return status;
    }
  }

  return (
    <div className={`max-w-4xl mx-auto p-6 space-y-6 ${isLight ? 'text-black' : 'text-white'}`}>
      <h1 className={`text-2xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
        Report an Issue
      </h1>

      <form
        onSubmit={handleSubmit}
        className={`rounded-2xl border p-6 space-y-4 ${
          isLight
            ? 'border-black/10 bg-white/70'
            : 'border-white/10 bg-black/30'
        }`}
      >
        <div className="space-y-2">
          <label className={`block text-sm font-medium ${isLight ? 'text-black/80' : 'text-white/80'}`}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief description of the issue"
            className={`w-full rounded-xl border px-4 py-2 outline-none transition ${
              isLight
                ? 'border-black/10 bg-white placeholder-black/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                : 'border-white/10 bg-white/5 placeholder-white/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
            }`}
            required
          />
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${isLight ? 'text-black/80' : 'text-white/80'}`}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please provide detailed information about the issue, steps to reproduce, and any relevant context..."
            rows={6}
            className={`w-full rounded-xl border px-4 py-2 outline-none transition resize-none ${
              isLight
                ? 'border-black/10 bg-white placeholder-black/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                : 'border-white/10 bg-white/5 placeholder-white/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
            }`}
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`px-6 py-2.5 rounded-xl font-medium transition ${
            isLight
              ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
              : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]'
          } disabled:opacity-60`}
        >
          {submitting ? 'Submitting...' : 'Submit Ticket'}
        </button>
      </form>

      <div className="space-y-4">
        <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
          My Tickets
        </h2>

        {loading ? (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            Loading...
          </div>
        ) : tickets.length === 0 ? (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            No tickets yet. Create one above to report an issue.
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`rounded-xl border p-4 space-y-3 ${
                  isLight
                    ? 'border-black/10 bg-white/70'
                    : 'border-white/10 bg-black/30'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                      {ticket.title}
                    </h3>
                    <p className={`text-sm mt-1 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                      {ticket.description}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${getStatusColor(
                      ticket.status
                    )}`}
                  >
                    {getStatusLabel(ticket.status)}
                  </span>
                </div>

                <div className={`flex items-center gap-4 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                  <span>Created: {new Date(ticket.created_at).toLocaleString()}</span>
                  {ticket.updated_at !== ticket.created_at && (
                    <span>Updated: {new Date(ticket.updated_at).toLocaleString()}</span>
                  )}
                  {ticket.resolved_at && (
                    <span>Resolved: {new Date(ticket.resolved_at).toLocaleString()}</span>
                  )}
                </div>

                {ticket.admin_notes && (
                  <div
                    className={`rounded-lg border p-3 mt-2 ${
                      isLight
                        ? 'border-telegram-blue/20 bg-telegram-blue/5'
                        : 'border-telegram-blue/30 bg-telegram-blue/10'
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 ${
                      isLight ? 'text-telegram-blue' : 'text-telegram-blue-light'
                    }`}>
                      Admin Response:
                    </div>
                    <div className={`text-sm ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                      {ticket.admin_notes}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
