'use client';

import { useEffect, useState, useRef } from 'react';
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
  image_urls?: string[];
  video_urls?: string[];
};

type TicketMessage = {
  id: number;
  ticket_id: number;
  user_id: string;
  body: string;
  image_urls: string[];
  video_urls: string[];
  is_admin: boolean;
  created_at: string;
};

function TicketsInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      loadMessages(selectedTicket.id);
    }
  }, [selectedTicket]);

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

  async function loadMessages(ticketId: number) {
    setLoadingMessages(true);
    try {
      const resp = await fetch(`/api/tickets/messages.list?ticket_id=${ticketId}`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load messages');
      setMessages(json.messages || []);
    } catch (e: any) {
      console.error('Failed to load messages', e);
      alert(e?.message || 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }

  async function uploadMedia(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const resp = await fetch('/api/tickets/upload-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file: base64,
              fileName: file.name,
              fileType: file.type,
            }),
          });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json?.error || 'Upload failed');
          resolve(json.url);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setImages((prev) => [...prev, file]);
      } else if (file.type.startsWith('video/')) {
        setVideos((prev) => [...prev, file]);
      }
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
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];

      for (const img of images) {
        const url = await uploadMedia(img);
        imageUrls.push(url);
      }

      for (const vid of videos) {
        const url = await uploadMedia(vid);
        videoUrls.push(url);
      }

      const resp = await fetch('/api/tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          image_urls: imageUrls,
          video_urls: videoUrls,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to create ticket');
      setTitle('');
      setDescription('');
      setImages([]);
      setVideos([]);
      await loadTickets();
      alert('Ticket created successfully!');
    } catch (e: any) {
      console.error('Failed to create ticket', e);
      alert(e?.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMessage() {
    if (!selectedTicket) return;
    if (!messageBody.trim() && images.length === 0 && videos.length === 0) {
      alert('Please enter a message or attach media');
      return;
    }

    if (selectedTicket.status === 'closed' || selectedTicket.status === 'resolved') {
      alert('Cannot send messages to closed or resolved tickets');
      return;
    }

    setSendingMessage(true);
    try {
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];

      for (const img of images) {
        const url = await uploadMedia(img);
        imageUrls.push(url);
      }

      for (const vid of videos) {
        const url = await uploadMedia(vid);
        videoUrls.push(url);
      }

      const resp = await fetch('/api/tickets/messages.create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          body: messageBody.trim() || '',
          image_urls: imageUrls,
          video_urls: videoUrls,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to send message');
      setMessageBody('');
      setImages([]);
      setVideos([]);
      await loadMessages(selectedTicket.id);
      await loadTickets();
    } catch (e: any) {
      console.error('Failed to send message', e);
      alert(e?.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
  }

  function closeTicket() {
    setSelectedTicket(null);
    setMessages([]);
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

  if (selectedTicket) {
    return (
      <div className={`max-w-4xl mx-auto p-6 space-y-6 ${isLight ? 'text-black' : 'text-white'}`}>
        <div className="flex items-center justify-between">
          <button
            onClick={closeTicket}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              isLight
                ? 'border border-black/20 text-black/70 hover:bg-black/5'
                : 'border border-white/20 text-white/70 hover:bg-white/5'
            }`}
          >
? Back to Tickets
          </button>
          <span className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap ${getStatusColor(
            selectedTicket.status
          )}`}>
            {getStatusLabel(selectedTicket.status)}
          </span>
        </div>

        <div className={`rounded-2xl border p-6 space-y-4 ${
          isLight
            ? 'border-black/10 bg-white/90 backdrop-blur'
            : 'border-white/10 bg-black/30 backdrop-blur'
        } shadow-lg`}>
          <h2 className={`text-2xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            {selectedTicket.title}
          </h2>
          <p className={`text-sm ${isLight ? 'text-black/80' : 'text-white/80'}`}>
            {selectedTicket.description}
          </p>

          {(selectedTicket.image_urls && selectedTicket.image_urls.length > 0) ||
           (selectedTicket.video_urls && selectedTicket.video_urls.length > 0) ? (
            <div className="grid grid-cols-2 gap-2 mt-4">
              {selectedTicket.image_urls?.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={idx} src={url} alt={`Attachment ${idx + 1}`} className="rounded-lg max-w-full" />
              ))}
              {selectedTicket.video_urls?.map((url, idx) => (
                <video key={idx} src={url} controls className="rounded-lg max-w-full" />
              ))}
            </div>
          ) : null}

          <div className={`flex items-center gap-4 text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
            <span>Created: {new Date(selectedTicket.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-6 space-y-4 ${
          isLight
            ? 'border-black/10 bg-white/90 backdrop-blur'
            : 'border-white/10 bg-black/30 backdrop-blur'
        } shadow-lg`}>
          <h3 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            Messages
          </h3>

          {loadingMessages ? (
            <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
              No messages yet.
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-4 ${
                    msg.is_admin
                      ? isLight
                        ? 'border-telegram-blue/30 bg-telegram-blue/5'
                        : 'border-telegram-blue/30 bg-telegram-blue/10'
                      : isLight
                      ? 'border-black/10 bg-black/5'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className={`text-xs mb-2 ${
                    msg.is_admin
                      ? isLight ? 'text-telegram-blue' : 'text-telegram-blue-light'
                      : isLight ? 'text-black/60' : 'text-white/60'
                  }`}>
                    {msg.is_admin ? 'Admin' : 'You'} ? {new Date(msg.created_at).toLocaleString()}
                  </div>
                  <p className={`text-sm ${isLight ? 'text-black/90' : 'text-white/90'}`}>
                    {msg.body}
                  </p>
                  {(msg.image_urls.length > 0 || msg.video_urls.length > 0) && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {msg.image_urls.map((url, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={idx} src={url} alt={`Attachment ${idx + 1}`} className="rounded-lg max-w-full" />
                      ))}
                      {msg.video_urls.map((url, idx) => (
                        <video key={idx} src={url} controls className="rounded-lg max-w-full" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={`pt-4 border-t space-y-3 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
            {(selectedTicket.status === 'open' || selectedTicket.status === 'in_progress') && (
              <>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Type your message..."
                rows={3}
                className={`w-full rounded-xl border px-4 py-2 outline-none transition resize-none ${
                  isLight
                    ? 'border-black/10 bg-white placeholder-black/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                    : 'border-white/10 bg-white/5 placeholder-white/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                }`}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    isLight
                      ? 'border-black/20 text-black/70 hover:bg-black/5'
                      : 'border-white/20 text-white/70 hover:bg-white/5'
                  }`}
                >
                  Attach Media
                </button>
                {(images.length > 0 || videos.length > 0) && (
                  <div className="flex items-center gap-2 text-sm">
                    {images.length > 0 && <span>{images.length} image(s)</span>}
                    {videos.length > 0 && <span>{videos.length} video(s)</span>}
                  </div>
                )}
                <button
                  onClick={sendMessage}
                  disabled={sendingMessage}
                  className={`ml-auto px-6 py-2.5 rounded-xl font-medium transition ${
                    isLight
                      ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                      : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]'
                  } disabled:opacity-60`}
                >
                  {sendingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>
              </>
            )}

            {(selectedTicket.status === 'open' || selectedTicket.status === 'in_progress') && (
              <div className={`flex items-center gap-3 pt-4 border-t ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                <span className={`text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                  Mark ticket as:
                </span>
                <button
                  onClick={async () => {
                    try {
                      const resp = await fetch('/api/tickets/update-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ticket_id: selectedTicket.id,
                          status: 'resolved',
                        }),
                      });
                      const json = await resp.json();
                      if (!resp.ok) throw new Error(json?.error || 'Failed to update status');
                      await loadTickets();
                      const updated = tickets.find(t => t.id === selectedTicket.id);
                      if (updated) setSelectedTicket({ ...updated, status: 'resolved' });
                      alert('Ticket marked as resolved');
                    } catch (e: any) {
                      alert(e?.message || 'Failed to update status');
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isLight
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  }`}
                >
                  Resolved
                </button>
                <button
                  onClick={async () => {
                    try {
                      const resp = await fetch('/api/tickets/update-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ticket_id: selectedTicket.id,
                          status: 'closed',
                        }),
                      });
                      const json = await resp.json();
                      if (!resp.ok) throw new Error(json?.error || 'Failed to update status');
                      await loadTickets();
                      const updated = tickets.find(t => t.id === selectedTicket.id);
                      if (updated) setSelectedTicket({ ...updated, status: 'closed' });
                      alert('Ticket marked as closed');
                    } catch (e: any) {
                      alert(e?.message || 'Failed to update status');
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    isLight
                      ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      : 'bg-gray-500/20 text-gray-300 hover:bg-gray-500/30'
                  }`}
                >
                  Closed
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
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
            ? 'border-black/10 bg-white/90 backdrop-blur'
            : 'border-white/10 bg-black/30 backdrop-blur'
        } shadow-lg`}
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

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${isLight ? 'text-black/80' : 'text-white/80'}`}>
            Attach Photos or Videos (optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className={`w-full rounded-xl border px-4 py-2 ${
              isLight
                ? 'border-black/10 bg-white'
                : 'border-white/10 bg-white/5'
            }`}
          />
          {(images.length > 0 || videos.length > 0) && (
            <div className="flex items-center gap-2 text-sm">
              {images.length > 0 && <span>{images.length} image(s)</span>}
              {videos.length > 0 && <span>{videos.length} video(s)</span>}
            </div>
          )}
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
                    ? 'border-black/10 bg-white/90 backdrop-blur'
                    : 'border-white/10 bg-black/30 backdrop-blur'
                } shadow-lg cursor-pointer hover:opacity-80 transition`}
                onClick={() => openTicket(ticket)}
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

                {(ticket.image_urls && ticket.image_urls.length > 0) ||
                 (ticket.video_urls && ticket.video_urls.length > 0) ? (
                  <div className="text-xs text-blue-500">
                    {(ticket.image_urls?.length || 0) + (ticket.video_urls?.length || 0)} attachment(s)
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
