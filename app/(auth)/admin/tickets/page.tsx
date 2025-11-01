'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/RequireAuth';
import { useTheme } from '@/components/ThemeProvider';
import Link from 'next/link';

export default function AdminTicketsPage() {
  return (
    <RequireAuth>
      <AdminTicketsInner />
    </RequireAuth>
  );
}

type Ticket = {
  id: number;
  user_id: string;
  user_email?: string | null;
  user_username?: string | null;
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

function AdminTicketsInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [status, setStatus] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageImages, setMessageImages] = useState<File[]>([]);
  const [messageVideos, setMessageVideos] = useState<File[]>([]);
  const messageFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || '';
      const allowed = email === 'seosasha@gmail.com';
      setIsAdmin(allowed);
      if (!allowed && typeof window !== 'undefined') {
        window.location.href = '/';
      } else if (allowed) {
        loadTickets();
      }
    })();
  }, []);

  async function loadTickets() {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/tickets.list');
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

  function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
    setStatus(ticket.status);
    setAdminNotes(ticket.admin_notes || '');
    setMessageBody('');
    setMessageImages([]);
    setMessageVideos([]);
    loadMessages(ticket.id);
  }

  function closeTicket() {
    setSelectedTicket(null);
    setStatus('');
    setAdminNotes('');
    setMessages([]);
    setMessageBody('');
    setMessageImages([]);
    setMessageVideos([]);
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

  async function sendAdminMessage() {
    if (!selectedTicket) return;
    if (!messageBody.trim() && messageImages.length === 0 && messageVideos.length === 0) {
      alert('Please enter a message or attach media');
      return;
    }

    setSendingMessage(true);
    try {
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];

      for (const img of messageImages) {
        const url = await uploadMedia(img);
        imageUrls.push(url);
      }

      for (const vid of messageVideos) {
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
      setMessageImages([]);
      setMessageVideos([]);
      await loadMessages(selectedTicket.id);
      await loadTickets();
    } catch (e: any) {
      console.error('Failed to send message', e);
      alert(e?.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  function handleMessageFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setMessageImages((prev) => [...prev, file]);
      } else if (file.type.startsWith('video/')) {
        setMessageVideos((prev) => [...prev, file]);
      }
    }
  }

  async function saveTicket() {
    if (!selectedTicket) return;

    setSaving(true);
    try {
      const resp = await fetch('/api/admin/tickets.update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          status: status || undefined,
          admin_notes: adminNotes || undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to update ticket');
      
      await loadTickets();
      closeTicket();
      alert('Ticket updated successfully!');
    } catch (e: any) {
      console.error('Failed to update ticket', e);
      alert(e?.message || 'Failed to update ticket');
    } finally {
      setSaving(false);
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

  function getUserDisplayName(ticket: Ticket) {
    if (ticket.user_username) return ticket.user_username;
    if (ticket.user_email) return ticket.user_email.split('@')[0];
    return ticket.user_id.substring(0, 8) + '...';
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
      <div className={`max-w-7xl mx-auto px-4 py-6 ${selectedTicket ? 'hidden' : 'block'}`}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={`text-2xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>
            Ticket Management
          </h1>
          <button
            onClick={loadTickets}
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

        {loading ? (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            Loading tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className={`text-center py-8 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
            No tickets found.
          </div>
        ) : (
          <div className={`rounded-xl border ${
            isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
          } overflow-hidden shadow-lg`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${
                    isLight ? 'border-black/10 bg-black/5' : 'border-white/10 bg-white/5'
                  }`}>
                    <th className={`px-4 py-3 text-left text-sm font-medium ${
                      isLight ? 'text-black font-semibold' : 'text-white font-semibold'
                    }`}>
                      ID
                    </th>
                    <th className={`px-4 py-3 text-left text-sm font-medium ${
                      isLight ? 'text-black font-semibold' : 'text-white font-semibold'
                    }`}>
                      Title
                    </th>
                    <th className={`px-4 py-3 text-left text-sm font-medium ${
                      isLight ? 'text-black font-semibold' : 'text-white font-semibold'
                    }`}>
                      Author
                    </th>
                    <th className={`px-4 py-3 text-left text-sm font-medium ${
                      isLight ? 'text-black font-semibold' : 'text-white font-semibold'
                    }`}>
                      Date
                    </th>
                    <th className={`px-4 py-3 text-left text-sm font-medium ${
                      isLight ? 'text-black font-semibold' : 'text-white font-semibold'
                    }`}>
                      Status
                    </th>
                    <th className={`px-4 py-3 text-left text-sm font-medium ${
                      isLight ? 'text-black font-semibold' : 'text-white font-semibold'
                    }`}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className={`border-b ${
                        isLight ? 'border-black/5 hover:bg-black/5' : 'border-white/5 hover:bg-white/5'
                      } transition`}
                    >
                      <td className={`px-4 py-3 text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                        #{ticket.id}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium ${isLight ? 'text-black' : 'text-white'}`}>
                        {ticket.title}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                        {ticket.user_username ? (
                          <Link
                            href={`/u/${ticket.user_username}`}
                            className={`hover:underline ${
                              isLight ? 'text-telegram-blue' : 'text-telegram-blue-light'
                            }`}
                          >
                            {getUserDisplayName(ticket)}
                          </Link>
                        ) : (
                          <span>{getUserDisplayName(ticket)}</span>
                        )}
                        {ticket.user_email && (
                          <div className={`text-xs ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                            {ticket.user_email}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                        {new Date(ticket.created_at).toLocaleDateString()} {new Date(ticket.created_at).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${getStatusColor(
                            ticket.status
                          )}`}
                        >
                          {getStatusLabel(ticket.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openTicket(ticket)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            isLight
                              ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark'
                              : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark'
                          }`}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Ticket Detail View */}
      {selectedTicket && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="mb-4">
            <button
              onClick={closeTicket}
              className={`px-4 py-2 rounded-xl font-medium transition ${
                isLight
                  ? 'border border-black/20 text-black/70 hover:bg-black/5'
                  : 'border border-white/20 text-white/70 hover:bg-white/5'
              }`}
            >
? Back to List
            </button>
          </div>

          <div className={`rounded-2xl border p-6 space-y-6 ${
            isLight ? 'border-black/10 bg-white/90 backdrop-blur' : 'border-white/10 bg-black/30 backdrop-blur'
          } shadow-lg`}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className={`text-2xl font-semibold mb-2 ${isLight ? 'text-black' : 'text-white'}`}>
                  {selectedTicket.title}
                </h2>
                <div className={`flex items-center gap-4 text-sm ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                  <span>
                    Author: {selectedTicket.user_username ? (
                      <Link
                        href={`/u/${selectedTicket.user_username}`}
                        className={`hover:underline ${
                          isLight ? 'text-telegram-blue' : 'text-telegram-blue-light'
                        }`}
                      >
                        {getUserDisplayName(selectedTicket)}
                      </Link>
                    ) : (
                      <span>{getUserDisplayName(selectedTicket)}</span>
                    )}
                    {selectedTicket.user_email && ` (${selectedTicket.user_email})`}
                  </span>
                  <span>?</span>
                  <span>Created: {new Date(selectedTicket.created_at).toLocaleString()}</span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-lg text-sm font-medium whitespace-nowrap ${getStatusColor(
                selectedTicket.status
              )}`}>
                {getStatusLabel(selectedTicket.status)}
              </span>
            </div>

            <div>
              <h3 className={`text-sm font-medium mb-2 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                Description
              </h3>
              <div className={`rounded-lg border p-4 ${
                isLight ? 'border-black/10 bg-black/5' : 'border-white/10 bg-white/5'
              }`}>
                <p className={`whitespace-pre-wrap ${isLight ? 'text-black/90' : 'text-white/90'}`}>
                  {selectedTicket.description}
                </p>
              </div>
            </div>

            {(selectedTicket.image_urls && selectedTicket.image_urls.length > 0) ||
             (selectedTicket.video_urls && selectedTicket.video_urls.length > 0) ? (
              <div>
                <h3 className={`text-sm font-medium mb-2 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                  Attachments
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {selectedTicket.image_urls?.map((url, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={idx} src={url} alt={`Attachment ${idx + 1}`} className="rounded-lg max-w-full" />
                  ))}
                  {selectedTicket.video_urls?.map((url, idx) => (
                    <video key={idx} src={url} controls className="rounded-lg max-w-full" />
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h3 className={`text-sm font-medium mb-2 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
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
                        {msg.is_admin ? 'Admin' : 'User'} ? {new Date(msg.created_at).toLocaleString()}
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

              <div className={`pt-4 mt-4 border-t space-y-3 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                <textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Write your response..."
                  rows={3}
                  className={`w-full rounded-xl border px-4 py-2 outline-none transition resize-none ${
                    isLight
                      ? 'border-black/10 bg-white placeholder-black/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                      : 'border-white/10 bg-white/5 placeholder-white/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                  }`}
                />
                <input
                  ref={messageFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleMessageFileSelect}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => messageFileInputRef.current?.click()}
                    className={`px-4 py-2 rounded-lg border text-sm ${
                      isLight
                        ? 'border-black/20 text-black/70 hover:bg-black/5'
                        : 'border-white/20 text-white/70 hover:bg-white/5'
                    }`}
                  >
                    Attach Media
                  </button>
                  {(messageImages.length > 0 || messageVideos.length > 0) && (
                    <div className="flex items-center gap-2 text-sm">
                      {messageImages.length > 0 && <span>{messageImages.length} image(s)</span>}
                      {messageVideos.length > 0 && <span>{messageVideos.length} video(s)</span>}
                    </div>
                  )}
                  <button
                    onClick={sendAdminMessage}
                    disabled={sendingMessage}
                    className={`ml-auto px-6 py-2.5 rounded-xl font-medium transition ${
                      isLight
                        ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                        : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]'
                    } disabled:opacity-60`}
                  >
                    {sendingMessage ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </div>
            </div>

            <div className={`pt-4 border-t space-y-4 ${
              isLight ? 'border-black/10' : 'border-white/10'
            }`}>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-black/80' : 'text-white/80'
                }`}>
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={`w-full rounded-xl border px-4 py-2 outline-none transition ${
                    isLight
                      ? 'border-black/10 bg-white text-black focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                      : 'border-white/10 bg-white/5 text-white focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                  }`}
                  style={isLight ? {} : { colorScheme: 'dark' }}
                >
                  <option value="open" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>Open</option>
                  <option value="in_progress" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>In Progress</option>
                  <option value="resolved" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>Resolved (User/Admin can set)</option>
                  <option value="closed" className={isLight ? 'bg-white text-black' : 'bg-black text-white'}>Closed (User/Admin can set)</option>
                </select>
                <p className={`text-xs mt-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                  Note: Status "Resolved" or "Closed" prevents further messages
                </p>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isLight ? 'text-black/80' : 'text-white/80'
                }`}>
                  Admin Response
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Write your response to the user..."
                  rows={6}
                  className={`w-full rounded-xl border px-4 py-2 outline-none transition resize-none ${
                    isLight
                      ? 'border-black/10 bg-white placeholder-black/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/20'
                      : 'border-white/10 bg-white/5 placeholder-white/40 focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30'
                  }`}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveTicket}
                  disabled={saving}
                  className={`px-6 py-2.5 rounded-xl font-medium transition ${
                    isLight
                      ? 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]'
                      : 'bg-telegram-blue text-white hover:bg-telegram-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]'
                  } disabled:opacity-60`}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={closeTicket}
                  className={`px-6 py-2.5 rounded-xl font-medium border transition ${
                    isLight
                      ? 'border-black/20 text-black/70 hover:bg-black/5'
                      : 'border-white/20 text-white/70 hover:bg-white/5'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
