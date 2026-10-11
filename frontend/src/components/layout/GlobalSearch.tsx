'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Megaphone, User } from 'lucide-react';
import { fetchCampaigns } from '@/src/lib/api/campaigns';
import { fetchLeads, Lead } from '@/src/lib/api/leads';
import { Campaign } from '@/src/components/campaigns/CampaignCard';

type Result =
  | { kind: 'campaign'; id: string; title: string; meta: string; href: string }
  | { kind: 'lead'; id: string; title: string; meta: string; href: string };

const MIN_CHARS = 1;

function campaignMeta(campaign: Campaign): string {
  const goal = (campaign.goal || '').trim();
  return goal ? `${campaign.status} · ${goal}` : campaign.status;
}

function leadMeta(lead: Lead): string {
  const campaignName = lead.campaign && typeof lead.campaign === 'object' ? lead.campaign.name : '';
  const where = lead.company || lead.phone || '';
  return [lead.status, where, campaignName].filter(Boolean).join(' · ');
}

export default function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [campaigns, setCampaigns] = useState<Result[]>([]);
  const [leads, setLeads] = useState<Result[]>([]);
  const [campaignTotal, setCampaignTotal] = useState(0);
  const [leadTotal, setLeadTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [settledTerm, setSettledTerm] = useState('');

  const term = query.trim();
  const results = [...campaigns, ...leads];
  const showPanel = open && term.length >= MIN_CHARS;

  useEffect(() => {
    if (term.length < MIN_CHARS) {
      setCampaigns([]);
      setLeads([]);
      setCampaignTotal(0);
      setLeadTotal(0);
      setLoading(false);
      setError(false);
      setSettledTerm('');
      return;
    }

    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const [campaignRes, leadRes] = await Promise.all([
          fetchCampaigns({ search: term, limit: 5, page: 1, includeArchived: true }),
          fetchLeads({ search: term, limit: 5, page: 1 }),
        ]);
        if (requestId !== requestRef.current) return;
        setCampaigns(
          campaignRes.campaigns.map((campaign) => ({
            kind: 'campaign',
            id: campaign._id,
            title: campaign.name,
            meta: campaignMeta(campaign),
            href: `/dashboard/campaigns/${campaign._id}`,
          }))
        );
        setLeads(
          leadRes.leads.map((lead) => ({
            kind: 'lead',
            id: lead._id,
            title: lead.fullName,
            meta: leadMeta(lead),
            href: `/dashboard/leads/${lead._id}`,
          }))
        );
        setCampaignTotal(campaignRes.pagination?.total ?? campaignRes.campaigns.length);
        setLeadTotal(leadRes.pagination?.total ?? leadRes.leads.length);
        setSettledTerm(term);
        setActive(0);
      } catch {
        if (requestId !== requestRef.current) return;
        setError(true);
        setCampaigns([]);
        setLeads([]);
        setSettledTerm(term);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showPanel) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      go(results[active].href);
    }
  };

  const renderGroup = (label: string, items: Result[], offset: number, seeAllHref: string, total: number) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          {total > items.length && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(seeAllHref)}
              className="text-[10px] font-medium text-blue-400 hover:text-blue-300"
            >
              See all {total}
            </button>
          )}
        </div>
        {items.map((item, index) => {
          const position = offset + index;
          const selected = position === active;
          const Icon = item.kind === 'campaign' ? Megaphone : User;
          return (
            <button
              key={`${item.kind}-${item.id}`}
              id={`${listId}-${position}`}
              type="button"
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setActive(position)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(item.href)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left"
              style={{ background: selected ? 'rgba(59,130,246,0.12)' : 'transparent' }}
            >
              <Icon size={13} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-slate-100">{item.title}</span>
                <span className="block truncate text-[11px] text-slate-500">{item.meta}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative" style={{ width: 280 }} ref={boxRef}>
      <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={showPanel && results[active] ? `${listId}-${active}` : undefined}
        placeholder="Search leads, campaigns..."
        className="h-8 w-full rounded-lg pl-8 pr-4 text-xs text-slate-300 outline-none placeholder-slate-600"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          event.target.style.borderColor = 'rgba(59,130,246,0.5)';
          event.target.style.background = 'rgba(59,130,246,0.05)';
        }}
        onBlur={(event) => {
          event.target.style.borderColor = 'rgba(255,255,255,0.07)';
          event.target.style.background = 'rgba(255,255,255,0.05)';
        }}
        onKeyDown={onKeyDown}
      />

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-2xl"
          style={{ background: '#0F1E35', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
        >
          {settledTerm !== term && !error && (
            <p className="px-3 py-3 text-xs text-slate-500">Searching…</p>
          )}
          {error && settledTerm === term && <p className="px-3 py-3 text-xs text-red-300">Couldn’t search. Try again.</p>}
          {settledTerm === term && !loading && !error && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-slate-500">No leads or campaigns match “{term}”.</p>
          )}
          {settledTerm === term && renderGroup('Campaigns', campaigns, 0, `/dashboard/campaigns?search=${encodeURIComponent(term)}`, campaignTotal)}
          {settledTerm === term && renderGroup('Leads', leads, campaigns.length, `/dashboard/leads?search=${encodeURIComponent(term)}`, leadTotal)}
        </div>
      )}
    </div>
  );
}
