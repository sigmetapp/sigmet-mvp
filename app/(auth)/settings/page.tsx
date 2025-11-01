'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSiteSettings } from '@/components/SiteSettingsContext';

export default function SettingsPage() {
  return <SettingsInner />;
}

function SettingsInner() {
  const { site_name, logo_url, invites_only, allowed_continents } = useSiteSettings();
  const [isAdmin, setIsAdmin] = useState<null | boolean>(null);
  const [name, setName] = useState(site_name || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(logo_url || null);
  const [saving, setSaving] = useState(false);
  const [invitesOnly, setInvitesOnly] = useState<boolean>(!!invites_only);
  const [continents, setContinents] = useState<string[]>(Array.isArray(allowed_continents) ? allowed_continents! : []);
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [editingTicket, setEditingTicket] = useState<number | null>(null);
  const [ticketStatus, setTicketStatus] = useState<string>('');
  const [ticketNotes, setTicketNotes] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(site_name || '');
  }, [site_name]);
  useEffect(() => {
    setPreview(logo_url || null);
  }, [logo_url]);
  useEffect(() => {
    setInvitesOnly(!!invites_only);
    setContinents(Array.isArray(allowed_continents) ? allowed_continents! : []);
  }, [invites_only, allowed_continents]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || '';
      const allowed = email === 'seosasha@gmail.com';
      setIsAdmin(!!allowed);
      if (!allowed && typeof window !== 'undefined') {
        // redirect non-admins
        window.location.href = '/';
      }
    })();
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogo(f);
    setPreview(URL.createObjectURL(f));
  }

  function toggleContinent(code: string) {
    setContinents((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function save() {
    setSaving(true);
    try {
      let logoPayload: { name: string; type?: string; dataBase64: string } | null = null;
      if (logo) {
        const dataBase64 = await fileToBase64(logo);
        logoPayload = { name: logo.name, type: logo.type, dataBase64 };
      }

      const resp = await fetch('/api/admin/site-settings.update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: name || null,
          invites_only: !!invitesOnly,
          allowed_continents: continents,
          logo: logoPayload,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Save failed');
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function loadTickets() {
    setLoadingTickets(true);
    try {
      const resp = await fetch('/api/admin/tickets.list');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to load tickets');
      setTickets(json.tickets || []);
    } catch (e) {
      setTickets(null);
    } finally {
      setLoadingTickets(false);
    }
  }

  async function updateTicket(ticketId: number) {
    try {
      const resp = await fetch('/api/admin/tickets.update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          status: ticketStatus || undefined,
          admin_notes: ticketNotes !== '' ? ticketNotes : undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to update ticket');
      setEditingTicket(null);
      setTicketStatus('');
      setTicketNotes('');
      await loadTickets();
    } catch (e: any) {
      alert(e?.message || 'Failed to update ticket');
    }
  }

  function startEditTicket(ticket: any) {
    setEditingTicket(ticket.id);
    setTicketStatus(ticket.status);
    setTicketNotes(ticket.admin_notes || '');
  }

  function cancelEditTicket() {
    setEditingTicket(null);
    setTicketStatus('');
    setTicketNotes('');
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'open':
        return 'bg-blue-500/20 text-blue-300';
      case 'in_progress':
        return 'bg-yellow-500/20 text-yellow-300';
      case 'resolved':
        return 'bg-green-500/20 text-green-300';
      case 'closed':
        return 'bg-gray-500/20 text-gray-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
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

  if (isAdmin === null) return null;
  if (!isAdmin) return null;

  const continentOptions: { code: string; label: string }[] = [
    { code: 'AF', label: 'Africa' },
    { code: 'AN', label: 'Antarctica' },
    { code: 'AS', label: 'Asia' },
    { code: 'EU', label: 'Europe' },
    { code: 'NA', label: 'North America' },
    { code: 'OC', label: 'Oceania' },
    { code: 'SA', label: 'South America' },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-medium text-white/90">Site Settings (Admin)</h1>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-white/70">Site name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SIGMET"
            className="w-full rounded-xl bg-transparent border border-white/10 px-3 py-2 outline-none placeholder-white/40"
          />
        </label>

        <div className="space-y-2">
          <span className="text-sm text-white/70">Logo</span>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
            <button
              onClick={() => fileRef.current?.click()}
              className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
            >
              Choose file
            </button>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Logo preview" className="h-10 w-10 rounded-lg border border-white/10 object-cover" />
            )}
          </div>
          <p className="text-xs text-white/50">Recommended: square PNG/SVG, 36?40px height in header.</p>
        </div>

        <div className="pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="relative inline-flex items-center gap-2 rounded-2xl px-5 py-2.5
                       bg-gradient-to-r from-white to-white/90 text-black
                       shadow-[0_8px_24px_rgba(255,255,255,0.25)] hover:shadow-[0_10px_36px_rgba(255,255,255,0.35)]
                       hover:translate-y-[-1px] active:translate-y-0 transition
                       disabled:opacity-60"
          >
            {saving ? 'Saving?' : 'Save changes'}
            <span className="absolute inset-0 rounded-2xl ring-1 ring-white/30 pointer-events-none" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <h2 className="text-white/90 font-medium">Registration controls</h2>
        <label className="flex items-center gap-2 text-white/80">
          <input type="checkbox" checked={invitesOnly} onChange={(e) => setInvitesOnly(e.target.checked)} />
          <span>Registration by invites only</span>
        </label>
        <div className="pt-2 space-y-2">
          <div className="text-sm text-white/70">Allowed continents (by IP)</div>
          <div className="grid grid-cols-2 gap-2">
            {continentOptions.map((opt) => (
              <label key={opt.code} className="flex items-center gap-2 text-white/80">
                <input
                  type="checkbox"
                  checked={continents.includes(opt.code)}
                  onChange={() => toggleContinent(opt.code)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div id="tickets" className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white/90 font-medium">Ticket Management</h2>
          <button onClick={loadTickets} className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10">
            {loadingTickets ? 'Loading?' : 'Load tickets'}
          </button>
        </div>
        {tickets && tickets.length === 0 && (
          <div className="text-white/60 text-sm text-center py-4">No tickets found.</div>
        )}
        {tickets && tickets.length > 0 && (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-white/10 p-4 space-y-3">
                {editingTicket === ticket.id ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-white/70 text-sm mb-1">Title</div>
                      <div className="text-white/90 font-medium">{ticket.title}</div>
                    </div>
                    <div>
                      <div className="text-white/70 text-sm mb-1">Description</div>
                      <div className="text-white/80 text-sm">{ticket.description}</div>
                    </div>
                    <div>
                      <label className="block text-white/70 text-sm mb-1">Status</label>
                      <select
                        value={ticketStatus}
                        onChange={(e) => setTicketStatus(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/90 outline-none focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-white/70 text-sm mb-1">Admin Notes</label>
                      <textarea
                        value={ticketNotes}
                        onChange={(e) => setTicketNotes(e.target.value)}
                        placeholder="Add admin notes or response..."
                        rows={3}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/90 placeholder-white/40 outline-none focus:border-telegram-blue focus:ring-2 focus:ring-telegram-blue/30 resize-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateTicket(ticket.id)}
                        className="h-9 px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/90"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditTicket}
                        className="h-9 px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-white/90 font-medium">{ticket.title}</h3>
                        <p className="text-white/70 text-sm mt-1">{ticket.description}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${getStatusColor(ticket.status)}`}>
                        {getStatusLabel(ticket.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/50">
                      <span>User: {ticket.user_id?.substring(0, 8)}...</span>
                      <span>Created: {new Date(ticket.created_at).toLocaleString()}</span>
                      {ticket.updated_at !== ticket.created_at && (
                        <span>Updated: {new Date(ticket.updated_at).toLocaleString()}</span>
                      )}
                      {ticket.resolved_at && (
                        <span>Resolved: {new Date(ticket.resolved_at).toLocaleString()}</span>
                      )}
                    </div>
                    {ticket.admin_notes && (
                      <div className="rounded-lg border border-telegram-blue/30 bg-telegram-blue/10 p-3">
                        <div className="text-xs font-medium mb-1 text-telegram-blue-light">Admin Notes:</div>
                        <div className="text-sm text-white/80">{ticket.admin_notes}</div>
                      </div>
                    )}
                    <button
                      onClick={() => startEditTicket(ticket)}
                      className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 text-sm"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
