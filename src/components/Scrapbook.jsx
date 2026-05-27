// Scrapbook — the inside of the boarding-pass terminal.
// Renders the country grid (group home) plus the per-country detail panel.
// Visuals mirror the boarding-pass landing + invite page so the whole app
// is one coherent metaphor: a chronicle of stamps you collect with friends.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';

// ─── helpers ───────────────────────────────────────────────────────────

function useStats(countries) {
  return useMemo(() => {
    const visited = countries.filter(c => c.uploads.length > 0).length;
    const uploads = countries.reduce((n, c) => n + c.uploads.length, 0);
    return { visited, uploads, total: countries.length };
  }, [countries]);
}

function useFiltered(countries, query) {
  return useMemo(() => {
    if (!query) return countries;
    const q = query.toLowerCase().trim();
    return countries.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countries, query]);
}

function useEscape(active, onEsc) {
  useEffect(() => {
    if (!active) return;
    const onKey = e => { if (e.key === 'Escape') onEsc(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEsc]);
}

// Watches a CSS media query without rerendering on every render.
function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const fn = e => setMatches(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return matches;
}

function formatDuration(sec) {
  if (!sec || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Read a local video file's duration via a hidden <video> element.
function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : null);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read video')); };
    v.src = url;
  });
}

const MAX_VIDEO_SECONDS = 5 * 60;

// Stable PNR-looking ref code derived from the groupId. Same group →
// same ref every visit, so the boarding stub always agrees with itself.
// Alphabet skips 0/1/I/L/O/Q for legibility in monospace at small sizes.
function refFromGroupId(id) {
  const ALPHA = 'ABCDEFGHJKMNPRSTUVWXYZ23456789';
  let hash = 5381;
  for (const c of String(id || '')) hash = ((hash << 5) + hash + c.charCodeAt(0)) >>> 0;
  let s = 'PB-';
  for (let i = 0; i < 6; i++) {
    s += ALPHA[hash % ALPHA.length];
    hash = Math.floor(hash / ALPHA.length) + (i + 1) * 17;
  }
  return s;
}

// Avatar tone derived from displayName so the same person renders the same
// color in every group and in every place the avatar shows up.
const AVATAR_TONES = [
  'linear-gradient(135deg,#f5c89a,#c84a2a 60%,#5a0e08)',
  'linear-gradient(135deg,#e6c089,#b94022 55%,#3a1414)',
  'linear-gradient(135deg,#f0d2a0,#d4af37 55%,#7a1a1a)',
  'linear-gradient(135deg,#e8c79e,#a83838 55%,#4a0e08)',
  'linear-gradient(135deg,#f3d29d,#cf6a2a 55%,#5a1a14)',
];
function avatarTone(name) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

// Cosine date format ("14 mar · 2026") so it fits the stub aesthetic.
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en', { month: 'short' }).toLowerCase();
  return `${day} ${month} · ${d.getFullYear()}`;
}

// ─── atomic visuals ─────────────────────────────────────────────────────

function PulseDot({ tone = 'gold' }) {
  return <span className={`bs-pulse-dot bs-pulse-${tone}`} />;
}

function Avatar({ name, size = 32 }) {
  const initial = (String(name || '?').trim()[0] || '?').toUpperCase();
  return (
    <span
      className="bs-avatar"
      title={name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: avatarTone(name) }}
    >
      {initial}
    </span>
  );
}

function Barcode({ short }) {
  // Fixed widths so the strip looks engraved rather than randomly jittery
  // on every re-render. Two lengths (~38 bars wide, or ~24 if short=true).
  const widths = short
    ? [1,1,2,1,3,1,2,1,1,2,3,1,2,1,1,2,1,3,1,2,1,1,2,3]
    : [1,1,2,1,3,1,2,1,1,2,3,1,2,1,1,2,1,3,1,2,1,1,2,3,1,1,2,1,3,1,2,1,1,2,3,1,2,1];
  return (
    <div className="bs-barcode">
      {widths.map((w, i) => <span key={i} className="bs-bar" style={{ width: w + 'px' }} />)}
    </div>
  );
}

function CornerBrackets() {
  return (
    <>
      <span className="bs-tile-corner bs-tile-corner-tl" />
      <span className="bs-tile-corner bs-tile-corner-tr" />
      <span className="bs-tile-corner bs-tile-corner-bl" />
      <span className="bs-tile-corner bs-tile-corner-br" />
    </>
  );
}

// ─── main scrapbook ─────────────────────────────────────────────────────

export default function Scrapbook({
  group, me, members, countries, totals,
  memberships = [], onSwitchGroup,
  onUpload, onDelete, onReorder, onLeave, inviteUrl,
}) {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  const refCode = useMemo(() => refFromGroupId(group.id), [group.id]);
  const stats = useStats(countries);
  const filtered = useFiltered(countries, query);
  const memoryStr = String(stats.uploads).padStart(3, '0');

  // Memberships excluding the current group, sorted by name, so the switcher
  // doesn't redundantly list "switch to where I already am."
  const otherGroups = useMemo(() => (memberships || [])
    .filter(m => m.groupId !== group.id)
    .sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '')),
    [memberships, group.id],
  );

  // Click-outside + escape closes the switcher.
  useEffect(() => {
    if (!switcherOpen) return;
    function onDown(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    }
    function onKey(e) { if (e.key === 'Escape') setSwitcherOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [switcherOpen]);

  useEscape(!!selected, () => setSelected(null));

  // Keep `selected` in sync with the latest countries prop (so uploads appear
  // in the open detail view after a refetch).
  useEffect(() => {
    if (!selected) return;
    const fresh = countries.find(c => c.code === selected.code);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [countries, selected]);

  async function copyInvite() {
    // navigator.clipboard is only defined in secure contexts (https or localhost).
    // When friends open the app over plain http on a LAN IP the API is undefined,
    // which used to make .then() throw silently and the button do nothing. Try the
    // modern API first, fall back to execCommand, and as a last resort show the URL
    // in a prompt so the user can copy it by hand.
    let ok = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        ok = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = inviteUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch { ok = false; }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      window.prompt('copy this invite link:', inviteUrl);
    }
  }

  return (
    <div className="bs-root">
      <style>{CSS}</style>

      <div className="bs-runway bs-runway-top" />
      <div className="bs-runway bs-runway-bottom" />

      <div className="bs-wrap">
        <div className="bs-now-boarding">
          <PulseDot tone="gold" />
          <span>terminal · group home</span>
        </div>

        <div className="bs-stub">
          <div className="bs-stub-perf" />

          <div className="bs-stub-inner">
            {/* HEADER strip */}
            <div className="bs-stub-head">
              <div className="bs-stub-brand">
                <div className="bs-stub-wordmark-row">
                  <span className="bs-stub-wordmark">passportbros</span>
                  <span className="bs-stub-chronicle">· the chronicle</span>
                </div>
                <div className="bs-stub-zone">passport · zone 1</div>
              </div>
              <div className="bs-stub-meta">
                <div className="bs-stub-meta-label">ref</div>
                <div className="bs-stub-meta-ref">{refCode}</div>
                <div className="bs-stub-meta-label bs-stub-meta-gate">gate · 04</div>
              </div>
            </div>

            {/* TITLE + coin row */}
            <div className="bs-title-row">
              <div className="bs-title-block">
                <div className="bs-title-label">destination</div>
                <h1 className="bs-title">{group.name}</h1>
                <div className="bs-crew">
                  <div className="bs-avatar-stack">
                    {members.slice(0, 5).map(m => (
                      <Avatar key={m.id} name={m.displayName} size={32} />
                    ))}
                  </div>
                  <span className="bs-crew-label">
                    crew · <b>{members.length}</b> ·{' '}
                    {members.length === 1 ? `just you (${me.displayName})` : `including you (${me.displayName})`}
                  </span>
                </div>
              </div>

              <div className="bs-coin-row">
                <div className="bs-coin-meta">
                  <div className="bs-coin-meta-label">memories</div>
                  <div className="bs-coin-meta-big">{memoryStr}</div>
                  <div className="bs-coin-meta-label">in the chronicle</div>
                </div>
                <div className="bs-coin" title={`${stats.visited} of ${stats.total} countries stamped`}>
                  <span className="bs-coin-stamped">★ STAMPED ★</span>
                  <span className="bs-coin-num">{stats.visited}</span>
                  <span className="bs-coin-of">/ {stats.total}</span>
                </div>
              </div>
            </div>

            {/* ACTIONS row */}
            <div className="bs-actions">
              <div className="bs-switcher" ref={switcherRef}>
                <button
                  className="bs-stub-btn bs-stub-btn-paper bs-switcher-btn"
                  aria-haspopup="true"
                  aria-expanded={switcherOpen}
                  onClick={() => setSwitcherOpen(o => !o)}
                >
                  <span className="bs-stub-btn-plane">✈</span>
                  <span className="bs-stub-btn-italic">{group.name}</span>
                  <span className="bs-stub-btn-arrow">▾</span>
                </button>
                {switcherOpen && (
                  <div className="bs-switcher-panel" role="menu">
                    <div className="bs-switcher-section">where to</div>
                    {otherGroups.length === 0 && (
                      <div className="bs-switcher-empty">
                        this is your only chronicle<br/>
                        <small>create or join another below</small>
                      </div>
                    )}
                    {otherGroups.map(g => (
                      <button
                        key={g.groupId}
                        className="bs-switcher-row"
                        role="menuitem"
                        onClick={() => {
                          setSwitcherOpen(false);
                          if (onSwitchGroup) onSwitchGroup(g.groupId);
                        }}
                      >
                        <span className="bs-switcher-name">{g.groupName || '(unnamed chronicle)'}</span>
                        <span className="bs-switcher-sub">as {g.displayName || '—'}</span>
                      </button>
                    ))}
                    <div className="bs-switcher-divider" />
                    <a
                      className="bs-switcher-row bs-switcher-new"
                      href="/"
                      role="menuitem"
                    >
                      <span className="bs-switcher-name">+ new chronicle</span>
                      <span className="bs-switcher-sub">create or join another</span>
                    </a>
                  </div>
                )}
              </div>

              <button className="bs-stub-btn" onClick={copyInvite}>
                <span className="bs-stub-btn-glyph">⌘</span>
                <span>{copied ? 'link copied' : 'copy invite link'}</span>
              </button>

              <button className="bs-stub-btn bs-stub-btn-paper" onClick={onLeave}>
                <span className="bs-stub-btn-glyph">↗</span>
                <span>leave group</span>
              </button>
            </div>

            {/* SEEK input */}
            <div className="bs-search-row">
              <span className="bs-search-lbl">seek</span>
              <input
                className="bs-search"
                placeholder="seek a destination…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                spellCheck={false}
              />
              {query && (
                <button className="bs-search-clear" onClick={() => setQuery('')}>clear</button>
              )}
            </div>

            {/* MANIFEST — country grid */}
            <div className="bs-manifest">
              <div className="bs-manifest-head">
                <span>— manifest —</span>
                <span><b>{filtered.length}</b> of {stats.total} countries</span>
              </div>

              <div className="bs-grid" role="grid" aria-label="countries">
                {filtered.map((c, i) => {
                  const visited = c.uploads.length > 0;
                  const cover = visited ? c.uploads[0] : null;
                  const coverIsVideo = cover?.kind === 'video';
                  return (
                    <button
                      key={c.code}
                      onClick={() => setSelected(c)}
                      className={`bs-tile ${visited ? 'bs-tile-visited' : 'bs-tile-empty'}`}
                      style={{ animationDelay: i * 14 + 'ms' }}
                      aria-label={c.name}
                    >
                      {visited && cover?.url && (
                        coverIsVideo ? (
                          <video className="bs-tile-cover" src={cover.url} muted playsInline preload="metadata" />
                        ) : (
                          <div className="bs-tile-cover" style={{ backgroundImage: `url(${cover.url})` }} />
                        )
                      )}
                      {visited && <div className="bs-tile-tint" />}

                      <span className="bs-tile-code">{c.code.toUpperCase()}</span>
                      {visited && (
                        <span className="bs-tile-badge">×{c.uploads.length}{coverIsVideo ? ' ▶' : ''}</span>
                      )}

                      <div className="bs-tile-foot">
                        <div className="bs-tile-name">{c.name}</div>
                        <div className="bs-tile-sub">
                          {visited
                            ? `stamped · ${c.uploads.length} ${c.uploads.length === 1 ? 'entry' : 'entries'}`
                            : 'unvisited'}
                        </div>
                      </div>

                      <CornerBrackets />
                    </button>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="bs-no-match">no countries match "{query}".</div>
              )}
            </div>

            {/* STATS FOOTER */}
            <div className="bs-stub-foot">
              <div className="bs-foot-stat">
                <div className="bs-foot-label">visited</div>
                <div className="bs-foot-big">
                  {stats.visited}<span className="bs-foot-of">/{stats.total}</span>
                </div>
                <div className="bs-foot-sub">countries · stamped</div>
              </div>
              <div className="bs-foot-sep" />
              <div className="bs-foot-stat">
                <div className="bs-foot-label">memories</div>
                <div className="bs-foot-big">{memoryStr}</div>
                <div className="bs-foot-sub">photos · videos</div>
              </div>
              <div className="bs-foot-sep" />
              <div className="bs-foot-barcode-block">
                <Barcode />
                <div className="bs-foot-sub bs-foot-sub-r">
                  {refCode} · {memoryStr} · {stats.visited}/{stats.total}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bs-fineprint">
          a private corner of the world · invite only · esc to clear search
        </div>
      </div>

      {selected && (
        <CountryGallery
          country={selected}
          me={me}
          members={members}
          groupRef={refCode}
          onClose={() => setSelected(null)}
          onUpload={onUpload}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      )}
    </div>
  );
}

// ─── per-country detail (slides in from the right) ──────────────────────

function CountryGallery({ country, me, members, groupRef, onClose, onUpload, onDelete, onReorder }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  // Track both file-level position ("3 of 7") and byte-level fraction
  // ("45% of video.mp4") so big uploads on slow connections don't look
  // frozen. pct stays 0..1; the bar is purely cosmetic until the XHR's
  // progress event fires.
  const [progress, setProgress] = useState(null); // { idx, total, filename, pct, sizeMB }
  const [error, setError] = useState(null);

  // Local copy of the upload list that the DnD context rearranges instantly
  // on drop. Resyncs whenever the parent hands us a fresh country.uploads
  // (after refetch, upload, or delete).
  const [items, setItems] = useState(country.uploads);
  useEffect(() => { setItems(country.uploads); }, [country.uploads]);

  const sensors = useSensors(
    // 6px activation distance — short enough to feel responsive, long enough
    // that a stray click on the X-delete button doesn't accidentally drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);                                   // optimistic
    const result = await onReorder(country.code, next.map(i => i.id));
    if (!result?.ok) {
      setError(`reorder failed: ${result?.error || 'unknown error'}`);
      // items will resync from props once the parent refetches.
    }
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError(null);
    setBusy(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sizeMB = file.size / (1024 * 1024);
      setProgress({ idx: i + 1, total: files.length, filename: file.name, pct: 0, sizeMB });

      // Pre-validate videos client-side so we don't burn an upload on a
      // file the server will reject.
      let durationSec = null;
      if (file.type.startsWith('video/')) {
        try {
          durationSec = await readVideoDuration(file);
        } catch {
          setError(`couldn't read "${file.name}" — is it a valid video?`);
          continue;
        }
        if (durationSec && durationSec > MAX_VIDEO_SECONDS) {
          setError(`"${file.name}" is ${formatDuration(durationSec)} — max is 5:00`);
          continue;
        }
      }

      const result = await onUpload(country.code, file, {
        durationSec,
        // XHR progress events fire constantly — throttle to whole-percent
        // changes so React isn't re-rendering 100×/sec on a fast LAN.
        onProgress: (frac) => setProgress(p => p && p.idx === i + 1
          ? (Math.floor(frac * 100) === Math.floor((p.pct || 0) * 100) ? p : { ...p, pct: frac })
          : p),
      });
      if (!result?.ok) {
        setError(`"${file.name}" failed: ${result?.error || 'unknown error'}`);
      }
    }
    setBusy(false);
    setProgress(null);
  }

  const count = country.uploads.length;
  const memoryStr = String(count).padStart(2, '0');

  return (
    <div className="bs-detail" role="dialog" aria-modal="true">
      <div className="bs-runway bs-runway-top" />
      <div className="bs-runway bs-runway-bottom" />

      <div className="bs-wrap">
        <div className="bs-detail-topbar">
          <button className="bs-back" onClick={onClose}>
            <span>←</span> back to the chronicle
          </button>
          <span className="bs-detail-esc">esc to close</span>
        </div>

        <div className="bs-stub">
          <div className="bs-stub-perf" />

          <div className="bs-stub-inner">
            {/* ARRIVAL HEADER */}
            <div className="bs-arrival">
              <span className="bs-arrival-stamp bs-arrival-stamp-tl">★ arrival ★</span>
              <span className="bs-arrival-stamp bs-arrival-stamp-br">form pb·{country.code}</span>

              <div className="bs-arrival-grid">
                <div className="bs-arrival-flag" aria-hidden="true">{country.flag}</div>
                <div className="bs-arrival-name-block">
                  <div className="bs-arrival-label">you have entered</div>
                  <h2 className="bs-arrival-name">{country.name}</h2>
                  <div className="bs-arrival-ribbon">
                    <span><b>{country.code.toUpperCase()}</b></span>
                    <span className="bs-arrival-ribbon-sep">·</span>
                    <span>{count} {count === 1 ? 'entry' : 'entries'}</span>
                    <span className="bs-arrival-ribbon-sep">·</span>
                    <span>shared by the group</span>
                  </div>
                </div>
                <div className="bs-arrival-coin-cell">
                  <div className="bs-coin bs-coin-detail" title={`${count} memories from ${country.name}`}>
                    <span className="bs-coin-stamped">★ MEMORIES ★</span>
                    <span className="bs-coin-num">{memoryStr}</span>
                    <span className="bs-coin-of">{country.code.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <div className="bs-arrival-crew">
                <div className="bs-avatar-stack">
                  {members.slice(0, 5).map(m => <Avatar key={m.id} name={m.displayName} size={28} />)}
                </div>
                <span className="bs-crew-label">
                  contributions · {members.map(m => m.displayName).join(' · ')}
                </span>
              </div>
            </div>

            {/* PERFORATION DIVIDER */}
            <div className="bs-perforation">
              <span className="bs-perf-hole bs-perf-hole-l" />
              <span className="bs-perf-hole bs-perf-hole-r" />
              <div className="bs-perf-line" />
            </div>

            {/* UPLOAD BAR */}
            <div className="bs-upload-bar">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFiles}
              />
              <button
                className="bs-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <span className="bs-upload-btn-plus">＋</span>
                <span>{busy ? (progress ? `uploading ${progress.idx} / ${progress.total}` : 'uploading…') : 'add photos or videos'}</span>
              </button>
              <div className="bs-upload-hint">
                <span><b>videos</b> up to <b>5:00</b></span>
                <span>drag the <b>⠿</b> grip to reorder</span>
                <span>first slot <b>= cover</b></span>
              </div>
            </div>

            {busy && progress && (
              <div className="bs-upload-progress">
                <div className="bs-upload-progress-row">
                  <span className="bs-upload-progress-name">
                    {progress.filename}
                    {progress.sizeMB >= 0.05 && (
                      <span className="bs-upload-progress-size"> · {progress.sizeMB.toFixed(progress.sizeMB < 10 ? 1 : 0)} MB</span>
                    )}
                  </span>
                  <span className="bs-upload-progress-pct">{Math.round((progress.pct || 0) * 100)}%</span>
                </div>
                <div className="bs-upload-progress-track">
                  <div className="bs-upload-progress-fill" style={{ width: `${Math.round((progress.pct || 0) * 100)}%` }} />
                </div>
              </div>
            )}

            {error && <p className="bs-upload-error">{error}</p>}

            {/* GALLERY OR EMPTY STATE */}
            <div className="bs-gallery-wrap">
              {items.length === 0 ? (
                <div className="bs-empty">
                  <div className="bs-plaque">
                    <span className="bs-plaque-tag">— plaque —</span>
                    <div className="bs-plaque-title">an unvisited place</div>
                    <div className="bs-plaque-sub">— be the first to write its entry</div>
                    <div className="bs-plaque-count">0 memories from the group</div>
                  </div>
                  <button
                    className="bs-empty-cta"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span>✈</span>
                    <span>open a stamp</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="bs-manifest-head">
                    <span>— field entries —</span>
                    <span><b>{items.length}</b> {items.length === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
                      <div className="bs-gallery">
                        {items.map((u, idx) => (
                          <SortableGalleryItem
                            key={u.id}
                            item={u}
                            position={idx}
                            isMine={u.member?.id === me.id}
                            onDelete={onDelete}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </div>

            {/* DETAIL FOOTER */}
            <div className="bs-detail-foot">
              <div className="bs-detail-foot-left">
                <PulseDot tone="red" />
                <span>live · synced with the group</span>
              </div>
              <Barcode short />
              <div className="bs-detail-foot-right">
                {country.code.toUpperCase()} · {memoryStr} · {groupRef}
              </div>
            </div>
          </div>
        </div>

        <div className="bs-fineprint">press esc · or click ← to return to the chronicle</div>
      </div>
    </div>
  );
}

// ─── sortable gallery item ──────────────────────────────────────────────

const ROTATIONS = [-1.5, 1.2, -0.8, 0.6, -1.1, 1.5, -0.5, 0.9, -1.3, 0.4];

function SortableGalleryItem({ item, position, isMine, onDelete }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 50 : 'auto',
    // Each polaroid gets a tiny deterministic rotation so the wall doesn't
    // look like a uniform grid. Stable per position.
    '--bs-rot': `${ROTATIONS[position % ROTATIONS.length]}deg`,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'bs-polaroid-wrap bs-polaroid-dragging' : 'bs-polaroid-wrap'}>
      <Polaroid
        item={item}
        position={position}
        isMine={isMine}
        isFirst={position === 0}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function Polaroid({ item, position, isMine, isFirst, onDelete, dragHandleProps }) {
  async function handleDelete() {
    const author = item.member?.displayName || 'someone';
    if (!isMine && !confirm(`Delete ${author}'s upload? This can't be undone.`)) return;
    if (isMine && !confirm('Delete this upload? This can\'t be undone.')) return;
    await onDelete(item.id);
  }

  return (
    <figure className="bs-polaroid">
      <div className="bs-polaroid-media">
        {item.kind === 'video' ? (
          <video src={item.url} controls preload="metadata" />
        ) : (
          <img src={item.url} alt="" loading="lazy" />
        )}
        {item.kind === 'video' && item.durationSec != null && (
          <span className="bs-polaroid-duration">{formatDuration(item.durationSec)}</span>
        )}
        {dragHandleProps && (
          <button
            type="button"
            className="bs-polaroid-grip"
            title="drag to reorder"
            aria-label={`drag to reorder, currently at position ${position + 1}`}
            {...dragHandleProps}
          >
            ⠿
          </button>
        )}
        {isFirst && <span className="bs-polaroid-cover-badge">1st · cover</span>}
      </div>
      <figcaption className="bs-polaroid-caption">
        <span className="bs-polaroid-author">
          <b>{item.member?.displayName || 'unknown'}</b>
          <span className="bs-polaroid-date"> · {shortDate(item.createdAt)}</span>
        </span>
        <button
          type="button"
          className={isMine ? 'bs-polaroid-delete bs-polaroid-delete-mine' : 'bs-polaroid-delete'}
          onClick={handleDelete}
          title={isMine ? 'delete' : "delete someone else's upload"}
          aria-label="delete this upload"
        >
          ×
        </button>
      </figcaption>
    </figure>
  );
}

// ─── styles ────────────────────────────────────────────────────────────

const CSS = `
/* ── root + stage ──────────────────────────────────────────────── */
.bs-root {
  min-height:100vh; position:relative;
  background:radial-gradient(ellipse at 50% 30%, #7a1a1a 0%, #4a0e08 65%, #2a0608 100%);
  color:#ede2c4;
  font-family:'Manrope','Cormorant Garamond',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}

.bs-runway {
  position:absolute; left:0; right:0; height:2px; z-index:5; pointer-events:none;
  background:repeating-linear-gradient(to right, rgba(212,175,55,0.35) 0 14px, transparent 14px 28px);
}
.bs-runway-top { top:22px; }
.bs-runway-bottom { bottom:22px; }
@media (max-width: 639px) {
  .bs-runway-top { top:14px; }
  .bs-runway-bottom { bottom:14px; }
}

.bs-wrap {
  max-width:1280px; margin:0 auto;
  padding:48px 24px 56px;
  position:relative; z-index:1;
}
@media (max-width: 639px) { .bs-wrap { padding:40px 12px 48px; } }

.bs-now-boarding {
  display:flex; align-items:center; gap:8px;
  padding-left:32px; margin-bottom:18px;
  font-family:'JetBrains Mono',monospace; font-size:11px;
  letter-spacing:0.32em; text-transform:uppercase; color:#d4af37;
}
@media (max-width: 639px) {
  .bs-now-boarding { padding-left:12px; font-size:10px; }
}

.bs-pulse-dot {
  display:inline-block; width:6px; height:6px; border-radius:50%;
  animation:bsPulse 1.6s ease-in-out infinite;
}
.bs-pulse-gold { background:#d4af37; }
.bs-pulse-red  { background:#7a1a1a; }
@keyframes bsPulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }

/* ── stub paper card ───────────────────────────────────────────── */
.bs-stub {
  position:relative;
  background-color:#ede2c4;
  background-image:
    radial-gradient(ellipse at 30% 0%, rgba(255,250,235,0.55) 0%, transparent 60%),
    repeating-linear-gradient(0deg, rgba(58,10,8,0.022) 0 1px, transparent 1px 3px);
  box-shadow:0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(58,10,8,0.15);
  color:#2a0808;
  -webkit-mask:radial-gradient(circle at 0 18px, transparent 9px, #000 9.5px) 0 0/100% 36px;
          mask:radial-gradient(circle at 0 18px, transparent 9px, #000 9.5px) 0 0/100% 36px;
}
@media (max-width: 639px) {
  .bs-stub {
    -webkit-mask:radial-gradient(circle at 18px 0, transparent 9px, #000 9.5px) 0 0/36px 100%;
            mask:radial-gradient(circle at 18px 0, transparent 9px, #000 9.5px) 0 0/36px 100%;
  }
}
.bs-stub-perf {
  position:absolute; top:24px; bottom:24px; left:10px; width:1px;
  background:repeating-linear-gradient(to bottom, rgba(58,10,8,0.5) 0 6px, transparent 6px 12px);
}
@media (max-width: 639px) {
  .bs-stub-perf {
    top:10px; left:24px; right:24px; bottom:auto; width:auto; height:1px;
    background:repeating-linear-gradient(to right, rgba(58,10,8,0.5) 0 6px, transparent 6px 12px);
  }
}
.bs-stub-inner {
  position:relative;
  padding:36px 40px 32px 60px;
}
@media (max-width: 639px) {
  .bs-stub-inner { padding:40px 18px 26px; }
}

/* ── stub header strip ─────────────────────────────────────────── */
.bs-stub-head {
  display:flex; align-items:flex-start; justify-content:space-between;
  gap:14px; padding-bottom:14px;
  border-bottom:1px dashed rgba(42,8,8,0.3);
}
.bs-stub-brand { min-width:0; }
.bs-stub-wordmark-row { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.bs-stub-wordmark {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:30px; line-height:1; color:#7a1a1a;
}
@media (max-width: 639px) { .bs-stub-wordmark { font-size:26px; } }
.bs-stub-chronicle {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.26em; text-transform:uppercase; color:rgba(42,8,8,0.5);
}
.bs-stub-zone {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.28em; text-transform:uppercase; color:rgba(42,8,8,0.6);
  margin-top:6px;
}
.bs-stub-meta { text-align:right; flex-shrink:0; }
.bs-stub-meta-label {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.bs-stub-meta-ref {
  font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:700;
  letter-spacing:0.18em; color:#7a1a1a; margin:2px 0;
}
.bs-stub-meta-gate { margin-top:2px; }

/* ── title + coin row ──────────────────────────────────────────── */
.bs-title-row {
  display:grid; grid-template-columns:1fr auto; gap:24px;
  margin-top:26px; align-items:end;
}
@media (max-width: 900px) { .bs-title-row { grid-template-columns:1fr; gap:18px; } }

.bs-title-block { min-width:0; }
.bs-title-label {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
  margin-bottom:6px;
}
.bs-title {
  margin:0;
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:clamp(36px, 6vw, 60px); line-height:1.02; letter-spacing:-0.015em;
  color:#2a0808; word-break:break-word;
}

.bs-crew {
  margin-top:16px;
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
}
.bs-avatar-stack { display:flex; }
.bs-avatar {
  display:inline-flex; align-items:center; justify-content:center;
  border-radius:50%; border:2px solid #ede2c4;
  margin-left:-8px; position:relative; flex-shrink:0;
  font-family:'JetBrains Mono',monospace; font-weight:700; color:#2a0808;
}
.bs-avatar:first-child { margin-left:0; }
.bs-crew-label {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.24em; text-transform:uppercase; color:rgba(42,8,8,0.7);
}
.bs-crew-label b { color:#2a0808; }

/* coin */
.bs-coin-row { display:flex; align-items:center; gap:16px; justify-content:flex-end; }
@media (max-width: 900px) { .bs-coin-row { justify-content:flex-start; } }
.bs-coin-meta { text-align:right; }
@media (max-width: 900px) { .bs-coin-meta { text-align:left; } }
.bs-coin-meta-label {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.24em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.bs-coin-meta-big {
  font-family:'JetBrains Mono',monospace; font-size:28px; font-weight:700;
  letter-spacing:0.18em; color:#2a0808; line-height:1; margin:4px 0;
}

.bs-coin {
  width:80px; height:80px; border-radius:50%;
  background:radial-gradient(circle at 30% 25%, #f0d77a 0%, #d4af37 35%, #a8853a 80%, #6e5520 100%);
  box-shadow:
    inset 0 0 0 2px rgba(110,85,32,0.7),
    inset 0 0 0 3px rgba(240,215,122,0.45),
    0 14px 26px rgba(0,0,0,0.4);
  position:relative;
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0;
}
@media (max-width: 639px) { .bs-coin { width:70px; height:70px; } }
.bs-coin-num {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:700;
  font-size:28px; color:#2a0808; transform:rotate(-8deg); line-height:1;
}
.bs-coin-stamped {
  position:absolute; top:8px; left:0; right:0; text-align:center;
  font-family:'JetBrains Mono',monospace; font-size:7px; font-weight:700;
  letter-spacing:0.3em; color:rgba(42,8,8,0.85);
}
.bs-coin-of {
  position:absolute; bottom:8px; left:0; right:0; text-align:center;
  font-family:'JetBrains Mono',monospace; font-size:7px; font-weight:700;
  letter-spacing:0.2em; color:rgba(42,8,8,0.85);
}

.bs-coin-detail { width:96px; height:96px; }
.bs-coin-detail .bs-coin-num { font-size:32px; }

/* ── action buttons ────────────────────────────────────────────── */
.bs-actions {
  margin-top:24px;
  display:flex; gap:10px; flex-wrap:wrap; align-items:center;
}

.bs-stub-btn {
  background:#7a1a1a; color:#ede2c4;
  border:1.5px dashed #d4af37;
  padding:9px 16px; cursor:pointer;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:11px;
  letter-spacing:0.22em; text-transform:uppercase;
  display:inline-flex; align-items:center; gap:10px;
  box-shadow:0 4px 14px rgba(0,0,0,0.15);
  transition:background .15s, color .15s, border-color .15s, transform .15s, box-shadow .15s;
}
.bs-stub-btn:hover:not(:disabled) {
  background:#d4af37; color:#2a0808; border-color:#2a0808;
  transform:translateY(-1px);
  box-shadow:0 10px 22px rgba(212,175,55,0.35);
}
.bs-stub-btn:disabled { opacity:0.45; cursor:not-allowed; }

.bs-stub-btn-paper {
  background:transparent; color:#2a0808; border-color:#7a1a1a;
  box-shadow:none;
}
.bs-stub-btn-paper:hover:not(:disabled) {
  background:#7a1a1a; color:#ede2c4; border-color:#2a0808;
}

.bs-stub-btn-glyph { font-size:14px; line-height:1; }
.bs-stub-btn-plane { color:#a8853a; font-size:14px; }
.bs-stub-btn-paper:hover .bs-stub-btn-plane { color:#d4af37; }
.bs-stub-btn-italic {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:15px; letter-spacing:0; text-transform:none; line-height:1.1;
}
.bs-stub-btn-arrow { color:rgba(42,8,8,0.5); }
.bs-stub-btn-paper:hover .bs-stub-btn-arrow { color:rgba(237,226,196,0.8); }

@media (max-width: 639px) {
  .bs-stub-btn { padding:8px 12px; font-size:10px; letter-spacing:0.18em; gap:8px; }
  .bs-stub-btn-italic { font-size:13px; }
}

/* ── switcher ──────────────────────────────────────────────────── */
.bs-switcher { position:relative; }
.bs-switcher-btn { cursor:pointer; }
.bs-switcher-panel {
  position:absolute; top:calc(100% + 6px); left:0; z-index:30;
  min-width:240px; max-width:320px;
  background-color:#ede2c4;
  background-image:
    radial-gradient(ellipse at 30% 0%, rgba(255,250,235,0.55) 0%, transparent 60%),
    repeating-linear-gradient(0deg, rgba(58,10,8,0.022) 0 1px, transparent 1px 3px);
  box-shadow:0 18px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(58,10,8,0.15);
  padding:6px;
  animation:bsSwitcherFade .14s ease-out;
}
@keyframes bsSwitcherFade {
  from { opacity:0; transform:translateY(-4px); }
  to   { opacity:1; transform:translateY(0); }
}
.bs-switcher-section {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.32em; text-transform:uppercase; color:#7a1a1a;
  padding:8px 12px 6px;
  border-bottom:1px dashed rgba(42,8,8,0.3); margin-bottom:4px;
}
.bs-switcher-row {
  display:flex; flex-direction:column; align-items:flex-start; gap:2px;
  width:100%; text-align:left; padding:10px 12px;
  background:transparent; border:none; cursor:pointer;
  font-family:'Cormorant Garamond',serif; color:#2a0808;
  text-decoration:none; transition:background .12s;
}
.bs-switcher-row:hover, .bs-switcher-row:focus-visible {
  background:rgba(212,175,55,0.18); outline:none;
}
.bs-switcher-name { font-style:italic; font-size:15px; line-height:1.15; }
.bs-switcher-sub {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.bs-switcher-divider {
  height:1px; margin:6px 4px;
  background:repeating-linear-gradient(to right, rgba(42,8,8,0.3) 0 4px, transparent 4px 8px);
}
.bs-switcher-new .bs-switcher-name { color:#7a1a1a; }
.bs-switcher-empty {
  padding:14px 12px; text-align:center;
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:14px; color:rgba(42,8,8,0.7); line-height:1.4;
}
.bs-switcher-empty small {
  display:block; margin-top:4px;
  font-family:'JetBrains Mono',monospace; font-style:normal; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.5);
}

/* ── seek input ────────────────────────────────────────────────── */
.bs-search-row {
  margin-top:28px;
  display:flex; align-items:flex-end; gap:14px; max-width:560px;
}
.bs-search-lbl {
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:11px;
  letter-spacing:0.28em; text-transform:uppercase; color:#7a1a1a;
  padding-bottom:8px; flex-shrink:0;
}
.bs-search {
  flex:1; background:transparent; border:0;
  border-bottom:2px solid #2a0808;
  outline:none; padding:4px 0 8px;
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:22px; color:#2a0808;
  transition:border-color .15s;
}
.bs-search:focus { border-bottom-color:#7a1a1a; }
.bs-search::placeholder { color:rgba(42,8,8,0.35); }
.bs-search-clear {
  background:none; border:none; cursor:pointer;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.5);
  padding-bottom:8px;
}
.bs-search-clear:hover { color:#7a1a1a; }

/* ── manifest grid ─────────────────────────────────────────────── */
.bs-manifest { margin-top:28px; }
.bs-manifest-head {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:12px;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.26em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.bs-manifest-head b { color:#2a0808; }

.bs-grid {
  display:grid; grid-template-columns:repeat(8, 1fr); gap:10px;
}
@media (max-width: 1024px) { .bs-grid { grid-template-columns:repeat(4, 1fr); } }
@media (max-width: 639px)  { .bs-grid { grid-template-columns:repeat(3, 1fr); gap:8px; } }

.bs-tile {
  position:relative; aspect-ratio:3/4; overflow:hidden;
  text-align:left; cursor:pointer; border:none; padding:0;
  background-color:#ede2c4;
  background-image:
    radial-gradient(ellipse at 30% 0%, #f6ecd3 0%, transparent 70%),
    repeating-linear-gradient(0deg, rgba(58,10,8,0.022) 0 1px, transparent 1px 3px);
  background-size:cover; background-position:center;
  box-shadow:0 6px 14px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(58,10,8,0.08);
  transition:transform .15s, box-shadow .15s;
  opacity:0; animation:bsTileIn .45s forwards;
}
@keyframes bsTileIn { to { opacity:1; } }
.bs-tile:hover, .bs-tile:focus-visible {
  transform:translateY(-3px); outline:none;
  box-shadow:0 14px 26px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(212,175,55,0.55);
}
.bs-tile-cover {
  position:absolute; inset:0; width:100%; height:100%;
  background-size:cover; background-position:center;
  object-fit:cover;
}
.bs-tile-tint {
  position:absolute; inset:0;
  background:
    linear-gradient(180deg, rgba(58,10,8,0.15) 0%, rgba(58,10,8,0.6) 75%, rgba(58,10,8,0.9) 100%),
    radial-gradient(ellipse at 60% 30%, rgba(122,26,26,0.15), transparent 70%);
  mix-blend-mode:multiply; pointer-events:none;
}
.bs-tile-code {
  position:absolute; top:6px; left:6px;
  font-family:'JetBrains Mono',monospace; font-size:8px;
  letter-spacing:0.22em; text-transform:uppercase;
  color:rgba(42,8,8,0.55); z-index:3;
}
.bs-tile-visited .bs-tile-code { color:rgba(237,226,196,0.85); }
.bs-tile-badge {
  position:absolute; top:6px; right:6px;
  background:#d4af37; color:#2a0808;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:10px;
  letter-spacing:0.12em; padding:2px 6px; line-height:1; z-index:3;
}
.bs-tile-foot {
  position:absolute; left:8px; right:8px; bottom:7px; z-index:3;
}
.bs-tile-name {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:15px; line-height:1.05;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.bs-tile-visited .bs-tile-name { color:#ede2c4; text-shadow:0 1px 5px rgba(0,0,0,0.55); }
.bs-tile-empty .bs-tile-name { color:#2a0808; }
.bs-tile-sub {
  font-family:'JetBrains Mono',monospace; font-size:8px;
  letter-spacing:0.22em; text-transform:uppercase; margin-top:2px;
}
.bs-tile-visited .bs-tile-sub { color:rgba(237,226,196,0.75); text-shadow:0 1px 4px rgba(0,0,0,0.5); }
.bs-tile-empty .bs-tile-sub { color:rgba(42,8,8,0.4); }
@media (max-width: 639px) {
  .bs-tile-name { font-size:13px; }
  .bs-tile-sub  { display:none; }
}

.bs-tile-corner {
  position:absolute; width:14px; height:14px; pointer-events:none;
  opacity:0; transition:opacity .15s;
}
.bs-tile:hover .bs-tile-corner, .bs-tile:focus-visible .bs-tile-corner { opacity:1; }
.bs-tile-corner-tl { top:5px; left:5px;  border-top:1.5px solid #d4af37; border-left:1.5px solid #d4af37; }
.bs-tile-corner-tr { top:5px; right:5px; border-top:1.5px solid #d4af37; border-right:1.5px solid #d4af37; }
.bs-tile-corner-bl { bottom:5px; left:5px;  border-bottom:1.5px solid #d4af37; border-left:1.5px solid #d4af37; }
.bs-tile-corner-br { bottom:5px; right:5px; border-bottom:1.5px solid #d4af37; border-right:1.5px solid #d4af37; }

.bs-no-match {
  text-align:center; padding:36px 16px;
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:16px; color:rgba(42,8,8,0.55);
}

/* ── stub footer stats ─────────────────────────────────────────── */
.bs-stub-foot {
  margin-top:36px; padding-top:18px;
  border-top:1px dashed rgba(42,8,8,0.3);
  display:flex; flex-wrap:wrap; gap:24px; align-items:center;
}
.bs-foot-stat { min-width:0; }
.bs-foot-label {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.24em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.bs-foot-big {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:36px; color:#2a0808; line-height:1; margin-top:4px;
}
.bs-foot-of { color:rgba(42,8,8,0.4); }
.bs-foot-sub {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
  margin-top:4px;
}
.bs-foot-sub-r { text-align:right; }
.bs-foot-sep { width:1px; align-self:stretch; background:rgba(42,8,8,0.2); }
@media (max-width: 639px) { .bs-foot-sep { display:none; } }
.bs-foot-barcode-block {
  margin-left:auto; display:flex; flex-direction:column; align-items:flex-end; gap:6px;
}
@media (max-width: 639px) { .bs-foot-barcode-block { margin-left:0; align-items:flex-start; } }

.bs-barcode { display:flex; align-items:stretch; gap:1px; height:30px; }
.bs-bar { display:inline-block; background:#2a0808; }

.bs-fineprint {
  margin-top:18px; padding:0 8px;
  text-align:center;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.24em; text-transform:uppercase; color:rgba(237,226,196,0.45);
}

/* ── detail (slide-in) ─────────────────────────────────────────── */
.bs-detail {
  position:fixed; inset:0; z-index:40;
  background:radial-gradient(ellipse at 50% 30%, #7a1a1a 0%, #4a0e08 65%, #2a0608 100%);
  overflow-y:auto;
  animation:bsDetailSlide .42s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes bsDetailSlide {
  from { transform:translateX(100%); opacity:0; }
  to   { transform:translateX(0);    opacity:1; }
}
.bs-detail-topbar {
  display:flex; align-items:center; justify-content:space-between;
  padding-left:32px; padding-right:8px; margin-bottom:14px;
}
@media (max-width: 639px) { .bs-detail-topbar { padding-left:12px; } }
.bs-back {
  background:none; border:none; cursor:pointer;
  font-family:'JetBrains Mono',monospace; font-size:11px;
  letter-spacing:0.28em; text-transform:uppercase; color:#d4af37;
  display:inline-flex; align-items:center; gap:8px;
  padding:4px 0;
}
.bs-back:hover { color:#ede2c4; }
.bs-detail-esc {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(237,226,196,0.5);
}
@media (max-width: 639px) { .bs-detail-esc { display:none; } }

/* arrival header */
.bs-arrival {
  position:relative; padding:18px;
  box-shadow:inset 0 0 0 2px rgba(122,26,26,0.6), inset 0 0 0 5px rgba(122,26,26,0.3);
}
@media (max-width: 639px) { .bs-arrival { padding:14px; } }
.bs-arrival-stamp {
  position:absolute; background:#ede2c4; padding:2px 8px;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:9px;
  letter-spacing:0.28em; text-transform:uppercase;
}
.bs-arrival-stamp-tl { top:-10px; left:-10px; color:#7a1a1a; transform:rotate(-4deg); }
.bs-arrival-stamp-br { bottom:-10px; right:-10px; color:rgba(42,8,8,0.7); transform:rotate(3deg); }
@media (max-width: 639px) {
  .bs-arrival-stamp-tl { left:-4px; }
  .bs-arrival-stamp-br { right:-4px; }
}

.bs-arrival-grid {
  display:grid; grid-template-columns:auto 1fr auto; gap:22px;
  align-items:center;
}
@media (max-width: 900px) {
  .bs-arrival-grid {
    grid-template-columns:auto 1fr; gap:14px;
  }
  .bs-arrival-coin-cell { grid-column:1 / -1; justify-self:start; }
}
@media (max-width: 480px) {
  .bs-arrival-grid { grid-template-columns:1fr; }
  .bs-arrival-flag { justify-self:start; }
}

.bs-arrival-flag {
  font-size:clamp(48px, 9vw, 96px); line-height:1;
  font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif;
  filter:drop-shadow(0 6px 10px rgba(0,0,0,0.25));
}
.bs-arrival-name-block { min-width:0; }
.bs-arrival-label {
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:10px;
  letter-spacing:0.28em; text-transform:uppercase; color:#7a1a1a;
  margin-bottom:4px;
}
.bs-arrival-name {
  margin:0;
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:clamp(40px, 7vw, 86px); line-height:0.95; letter-spacing:-0.02em;
  color:#2a0808; word-break:break-word;
}
.bs-arrival-ribbon {
  display:inline-flex; align-items:center; gap:8px; margin-top:10px;
  padding:6px 12px;
  background:#f6ecd3; border:1px dashed rgba(42,8,8,0.4);
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.24em; text-transform:uppercase; color:rgba(42,8,8,0.75);
  flex-wrap:wrap;
}
.bs-arrival-ribbon b { color:#2a0808; }
.bs-arrival-ribbon-sep { color:rgba(42,8,8,0.3); }

.bs-arrival-coin-cell { display:flex; justify-content:flex-end; }
@media (max-width: 900px) { .bs-arrival-coin-cell { justify-content:flex-start; } }

.bs-arrival-crew {
  margin-top:18px;
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
}

/* perforation divider with circle cutouts */
.bs-perforation { position:relative; margin:26px 0; height:1px; }
.bs-perf-hole {
  position:absolute; top:50%; transform:translateY(-50%);
  width:20px; height:20px; border-radius:50%; background:#2a0608;
}
.bs-perf-hole-l { left:-44px; }
.bs-perf-hole-r { right:-26px; }
@media (max-width: 639px) {
  .bs-perf-hole-l { left:-30px; }
  .bs-perf-hole-r { right:-30px; }
}
.bs-perf-line {
  position:absolute; left:0; right:0; top:0; height:1px;
  background:repeating-linear-gradient(to right, rgba(58,10,8,0.5) 0 6px, transparent 6px 12px);
}

/* upload bar */
.bs-upload-bar {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between;
  gap:14px; padding:14px 16px;
  background:linear-gradient(180deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.1) 100%);
  box-shadow:inset 0 0 0 1px rgba(212,175,55,0.55), inset 0 0 0 2px rgba(212,175,55,0.18);
}
.bs-upload-btn {
  background:#d4af37; color:#2a0808; border:none;
  padding:12px 20px; cursor:pointer;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:12px;
  letter-spacing:0.22em; text-transform:uppercase;
  display:inline-flex; align-items:center; gap:10px;
  box-shadow:0 6px 14px rgba(0,0,0,0.2);
  transition:background .15s, transform .1s;
}
.bs-upload-btn:hover:not(:disabled) { background:#f0c659; }
.bs-upload-btn:active:not(:disabled) { transform:scale(0.98); }
.bs-upload-btn:disabled { opacity:0.7; cursor:wait; }
.bs-upload-btn-plus { font-size:20px; line-height:1; }

.bs-upload-hint {
  display:flex; flex-direction:column; gap:2px;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.18em; text-transform:uppercase; color:rgba(42,8,8,0.7);
}
.bs-upload-hint b { color:#2a0808; }

.bs-upload-progress {
  margin-top:10px; padding:10px 14px;
  background:rgba(58,10,8,0.06);
  border:1px solid rgba(212,175,55,0.45);
  border-left:3px solid #d4af37;
}
.bs-upload-progress-row {
  display:flex; align-items:baseline; justify-content:space-between; gap:12px;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.18em; text-transform:uppercase; color:rgba(42,8,8,0.85);
  margin-bottom:6px;
}
.bs-upload-progress-name {
  text-overflow:ellipsis; overflow:hidden; white-space:nowrap;
  flex:1; min-width:0;
}
.bs-upload-progress-size { color:rgba(42,8,8,0.5); }
.bs-upload-progress-pct {
  flex-shrink:0; color:#7a1a1a; font-weight:700;
  font-variant-numeric:tabular-nums;
}
.bs-upload-progress-track {
  height:4px; background:rgba(58,10,8,0.15);
  border:1px solid rgba(212,175,55,0.25);
  overflow:hidden;
}
.bs-upload-progress-fill {
  height:100%;
  background:linear-gradient(90deg, #d4af37, #f0c659);
  transition:width 0.2s linear;
  box-shadow:0 0 8px rgba(212,175,55,0.4);
}

.bs-upload-error {
  margin:12px 0 0; padding:10px 14px;
  background:rgba(122,26,26,0.15);
  border:1px solid rgba(220,53,69,0.45);
  color:#7a1a1a;
  font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:0.1em;
}

/* empty state */
.bs-empty {
  display:flex; flex-direction:column; align-items:center; gap:16px;
  padding:40px 12px;
}
.bs-plaque {
  position:relative; max-width:460px; width:100%; padding:28px 24px;
  background:linear-gradient(180deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.1) 100%);
  box-shadow:inset 0 0 0 2px #d4af37, inset 0 0 0 4px rgba(212,175,55,0.25);
  transform:rotate(-0.6deg); text-align:center;
}
.bs-plaque-tag {
  position:absolute; top:-9px; left:50%; transform:translateX(-50%);
  background:#ede2c4; padding:0 10px;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:9px;
  letter-spacing:0.3em; text-transform:uppercase; color:#a8853a;
}
.bs-plaque-title {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:clamp(22px, 4vw, 30px); color:#2a0808; line-height:1.15;
}
.bs-plaque-sub {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:18px; color:rgba(42,8,8,0.65); line-height:1.2; margin-top:2px;
}
.bs-plaque-count {
  margin-top:16px;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.28em; text-transform:uppercase; color:#a8853a;
}
.bs-empty-cta {
  background:#7a1a1a; color:#ede2c4; border:none;
  padding:12px 20px; cursor:pointer;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:11px;
  letter-spacing:0.22em; text-transform:uppercase;
  display:inline-flex; align-items:center; gap:10px;
  transition:background .15s;
}
.bs-empty-cta:hover { background:#5a0e08; }

/* gallery (CSS columns masonry) */
.bs-gallery-wrap { margin-top:26px; }
.bs-gallery {
  column-count:3; column-gap:22px;
}
@media (max-width: 1024px) { .bs-gallery { column-count:2; } }
@media (max-width: 600px)  { .bs-gallery { column-count:1; } }
.bs-polaroid-wrap {
  break-inside:avoid; display:block; margin-bottom:22px;
  transition:opacity .15s;
}
.bs-polaroid-dragging { box-shadow:0 24px 42px rgba(0,0,0,0.55); }

.bs-polaroid {
  margin:0; background:#f6ecd3;
  padding:8px 8px 4px;
  box-shadow:0 16px 30px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.2);
  transform:rotate(var(--bs-rot, 0deg));
  transition:transform .2s, box-shadow .2s;
}
.bs-polaroid:hover {
  transform:translateY(-3px) rotate(0deg);
  box-shadow:0 22px 40px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.25);
  z-index:5;
}
.bs-polaroid-media {
  position:relative; background:#2a0608;
  box-shadow:inset 0 0 0 1px rgba(212,175,55,0.7), inset 0 0 0 2px rgba(212,175,55,0.15);
}
.bs-polaroid-media img, .bs-polaroid-media video {
  display:block; width:100%; height:auto;
}
.bs-polaroid-duration {
  position:absolute; bottom:6px; right:6px;
  background:rgba(0,0,0,0.7); color:#fff;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  padding:2px 6px; letter-spacing:0.05em;
}
.bs-polaroid-grip {
  position:absolute; bottom:6px; left:6px; z-index:3;
  width:26px; height:26px; padding:0;
  background:rgba(20,8,8,0.78); color:#d4af37;
  border:1px solid rgba(212,175,55,0.55);
  font-family:'JetBrains Mono',monospace; font-size:14px; line-height:1;
  display:flex; align-items:center; justify-content:center;
  cursor:grab; opacity:0; transition:opacity .15s, color .15s, background .15s;
  touch-action:none;
}
.bs-polaroid:hover .bs-polaroid-grip { opacity:0.85; }
.bs-polaroid-grip:hover { opacity:1 !important; color:#f0c659; background:rgba(20,8,8,0.92); }
.bs-polaroid-grip:active, .bs-polaroid-grip:focus-visible { cursor:grabbing; opacity:1 !important; outline:none; }

.bs-polaroid-cover-badge {
  position:absolute; top:-6px; right:-6px; z-index:4;
  background:#d4af37; color:#2a0808;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:9px;
  letter-spacing:0.18em; text-transform:uppercase;
  padding:4px 8px; line-height:1; box-shadow:0 4px 10px rgba(0,0,0,0.3);
  transform:rotate(8deg);
}

.bs-polaroid-caption {
  display:flex; align-items:baseline; justify-content:space-between;
  gap:8px; padding:8px 4px 4px;
}
.bs-polaroid-author {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.16em; text-transform:uppercase; color:rgba(42,8,8,0.65);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;
}
.bs-polaroid-author b { color:#2a0808; }
.bs-polaroid-date { color:rgba(42,8,8,0.55); }
.bs-polaroid-delete {
  background:none; border:none; cursor:pointer;
  font-family:'JetBrains Mono',monospace; font-size:16px; line-height:1;
  color:#7a1a1a; padding:2px 6px;
  opacity:0; transition:opacity .15s, color .15s;
}
.bs-polaroid:hover .bs-polaroid-delete, .bs-polaroid:focus-within .bs-polaroid-delete { opacity:1; }
.bs-polaroid-delete:hover { color:#5a0e08; }
.bs-polaroid-delete-mine { opacity:0.4; }
.bs-polaroid:hover .bs-polaroid-delete-mine { opacity:1; }

/* detail footer */
.bs-detail-foot {
  margin-top:30px; padding-top:16px;
  border-top:1px dashed rgba(42,8,8,0.3);
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  flex-wrap:wrap;
}
.bs-detail-foot-left {
  display:inline-flex; align-items:center; gap:10px;
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.bs-detail-foot-right {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
`;
