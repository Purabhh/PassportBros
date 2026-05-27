// Scrapbook.jsx — multi-user shared variant of the H2 Dragonflight design.
// Renders the country grid; clicking a country opens a gallery of every
// member's photos and videos for that country, with upload + delete.

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

// ─── main ──────────────────────────────────────────────────────────────

export default function Scrapbook({
  group, me, members, countries, totals,
  onUpload, onDelete, onReorder, onLeave, inviteUrl,
}) {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const stats = useStats(countries);
  const filtered = useFiltered(countries, query);
  useEscape(!!selected, () => setSelected(null));

  // Keep `selected` in sync with the latest countries prop (so uploads
  // appear in the open detail view after a refetch).
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
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      // Last-resort: surface the URL so the user can copy manually.
      window.prompt('copy this invite link:', inviteUrl);
    }
  }

  return (
    <div className="bs-root">
      <style>{CSS}</style>

      {/* ── DRAGON SKY ───────────────────────────────────────────────── */}
      <div className="bs-sky">
        <div className="bs-stars">
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="bs-star" style={{
              left: ((i * 37) % 100) + '%',
              top: ((i * 23) % 100) + '%',
              animationDelay: i * 0.17 + 's',
            }} />
          ))}
        </div>
        {[0, 0.8, 1.6, 2.4].map((d, i) => (
          <span key={i} className="bs-trail" style={{ animationDelay: d + 's' }} />
        ))}
        <div className="bs-dragon-wrap">
          <img className="bs-dragon-img" src="/dragon.png" alt="" aria-hidden="true" />
        </div>
      </div>

      {/* ── FRAMED CONTENT ──────────────────────────────────────────── */}
      <div className="bs-frame">
        <span className="bs-corner-bl" />
        <span className="bs-corner-br" />

        <header className="bs-header">
          <div className="bs-brand">
            <span className="bs-brand-mark">r/passportbros · {group.name}</span>
            <h1 className="bs-wordmark">passportbros</h1>
            <span className="bs-wordmark-sub">a shared chronicle of where we've been</span>
          </div>
          <div className="bs-stats">
            <div className="bs-stat-text">
              <b>{stats.visited}/{stats.total}</b>
              <small>countries visited</small>
            </div>
            <div className="bs-stat-coin" title={`${stats.uploads} uploads`}>
              <span className="bs-stat-coin-num">{String(stats.uploads).padStart(3, '0')}</span>
            </div>
          </div>
        </header>

        {/* meta row: members + invite + leave */}
        <div className="bs-meta-row">
          <div className="bs-members" title={members.map(m => m.displayName).join(', ')}>
            <span className="bs-meta-label">crew</span>
            <span className="bs-meta-value">
              {members.length === 1 ? `you (${me.displayName})` :
                `${members.length} · including you (${me.displayName})`}
            </span>
          </div>
          <div className="bs-meta-actions">
            <button className="bs-meta-btn" onClick={copyInvite}>
              {copied ? '✓ link copied' : '⌘ copy invite link'}
            </button>
            <button className="bs-meta-btn bs-meta-btn-quiet" onClick={onLeave}>
              leave group
            </button>
          </div>
        </div>

        <div className="bs-search-row">
          <span className="bs-search-lbl">seek</span>
          <input
            className="bs-search"
            placeholder="a destination…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="bs-grid">
          {filtered.map((c, i) => {
            const visited = c.uploads.length > 0;
            const cover = visited ? c.uploads[0] : null;
            const coverIsVideo = cover?.kind === 'video';
            return (
              <button
                key={c.code}
                onClick={() => setSelected(c)}
                className={`bs-tile ${visited ? 'bs-tile-visited' : 'bs-tile-empty'}`}
                style={{ animationDelay: i * 16 + 'ms' }}
                aria-label={c.name}
              >
                <div className="bs-tile-inner">
                  {visited && cover?.url && (
                    coverIsVideo ? (
                      <video className="bs-tile-photo" src={cover.url} muted playsInline preload="metadata" />
                    ) : (
                      <div className="bs-tile-photo" style={{ backgroundImage: `url(${cover.url})` }} />
                    )
                  )}
                  <span className="bs-corner-tile-bl" />
                  <span className="bs-corner-tile-br" />
                  {visited && (
                    <span className="bs-badge">×{c.uploads.length}{coverIsVideo ? ' ▶' : ''}</span>
                  )}
                  <span className="bs-name">
                    {c.name}
                    {!visited && <span className="bs-name-sub">unvisited</span>}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <CountryGallery
          country={selected}
          me={me}
          onClose={() => setSelected(null)}
          onUpload={onUpload}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      )}
    </div>
  );
}

// ─── per-country gallery (unlimited photos + videos) ──────────────────

function CountryGallery({ country, me, onClose, onUpload, onDelete, onReorder }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);   // {idx, total, filename}
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
      setProgress({ idx: i + 1, total: files.length, filename: file.name });

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

      const result = await onUpload(country.code, file, { durationSec });
      if (!result?.ok) {
        setError(`"${file.name}" failed: ${result?.error || 'unknown error'}`);
      }
    }
    setBusy(false);
    setProgress(null);
  }

  return (
    <div className="bs-detail">
      <button className="bs-back" onClick={onClose}>← back to the chronicle</button>

      <div className="bs-detail-head">
        <div className="bs-flag-cell">{country.flag}</div>
        <div className="bs-name-stack">
          <h2 className="bs-name-big">{country.name}</h2>
          <div className="bs-name-row">
            <span>{country.code.toUpperCase()}</span>
            <span>{country.uploads.length} {country.uploads.length === 1 ? 'entry' : 'entries'}</span>
            <span>shared by the group</span>
          </div>
        </div>
        <div className="bs-headcoin">
          <span className="bs-headcoin-num">{String(country.uploads.length).padStart(2, '0')}</span>
          <span className="bs-headcoin-lbl">sealed</span>
        </div>
      </div>

      <div className="bs-fortune">
        <em>★</em>{' '}
        {country.uploads.length > 0
          ? 'safe travels · fair winds'
          : 'an unvisited place — be the first to write its entry'}{' '}
        <em>★</em>
        <small>
          {country.uploads.length} {country.uploads.length === 1 ? 'memory' : 'memories'} from the group
        </small>
      </div>

      {/* upload bar */}
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
          {busy
            ? (progress ? `uploading ${progress.idx} / ${progress.total} — ${progress.filename}` : 'uploading…')
            : '＋ add photos or videos'}
        </button>
        <span className="bs-upload-hint">videos up to 5:00 · drag the grip to reorder · first slot = country cover</span>
      </div>
      {error && <p className="bs-upload-error">{error}</p>}

      {/* gallery */}
      {items.length === 0 ? (
        <div className="bs-empty">
          <div className="bs-empty-mark">︵</div>
          <p>no entries yet — click the button above to add the first photo or video</p>
        </div>
      ) : (
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
      )}
    </div>
  );
}

// Wraps GalleryItem with sortable behavior. The drag listeners are passed
// down so we can attach them to a dedicated grip handle rather than the
// whole figure — that way clicks on the X-delete button or the video play
// area aren't swallowed by the drag detector.
function SortableGalleryItem({ item, position, isMine, onDelete }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });
  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'bs-item-wrap bs-item-dragging' : 'bs-item-wrap'}>
      <GalleryItem
        item={item}
        position={position}
        isMine={isMine}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function GalleryItem({ item, position, isMine, onDelete, dragHandleProps }) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    const who = item.member?.name || 'someone';
    const kind = item.kind === 'video' ? 'video' : 'photo';
    const prompt = isMine
      ? `Delete this ${kind}? Can't be undone.`
      : `Delete ${who}'s ${kind}? They uploaded it — can't be undone.`;
    if (!confirm(prompt)) return;
    setDeleting(true);
    const r = await onDelete(item.id);
    if (!r.ok) {
      setDeleting(false);
      alert('delete failed: ' + r.error);
    }
  }
  const isCover = position === 0;
  return (
    <figure className="bs-item">
      {isCover && <span className="bs-item-cover-badge" title="cover photo for this country">cover</span>}
      <div className="bs-item-media">
        {item.kind === 'video'
          ? <video src={item.url} controls preload="metadata" playsInline />
          : <img src={item.url} alt="" loading="lazy" />}
        {item.kind === 'video' && item.durationSec && (
          <span className="bs-item-duration">{formatDuration(item.durationSec)}</span>
        )}
        {dragHandleProps && (
          <button
            type="button"
            className="bs-item-drag"
            title="drag to reorder"
            aria-label={`drag to reorder, currently at position ${position + 1}`}
            {...dragHandleProps}
          >
            ⠿
          </button>
        )}
      </div>
      <figcaption className="bs-item-caption">
        <span className="bs-item-author">{item.member?.name || '—'}</span>
        <span className="bs-item-date">
          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <button
          className={`bs-item-delete ${isMine ? '' : 'bs-item-delete-foreign'}`}
          onClick={handleDelete}
          disabled={deleting}
          title={isMine ? 'delete this upload' : `delete ${item.member?.name || 'this member'}'s upload`}
        >
          {deleting ? '…' : '✕'}
        </button>
      </figcaption>
    </figure>
  );
}

// ─── styles ────────────────────────────────────────────────────────────

const CSS = `
.bs-root {
  background:#b91d22;
  background-image:
    radial-gradient(ellipse at 20% 0%, rgba(212,175,55,0.12), transparent 55%),
    radial-gradient(ellipse at 80% 100%, rgba(40,8,8,0.4), transparent 60%),
    repeating-linear-gradient(45deg, transparent 0 22px, rgba(0,0,0,0.04) 22px 23px);
  min-height:100vh; font-family:'Cormorant Garamond',serif; color:#f5e7c4;
  padding:40px 52px 80px; position:relative; overflow:hidden;
}

/* ── dragon sky ──────────────────────────────────────────────────── */
.bs-sky { position:absolute; top:0; left:0; right:0; height:180px;
  background:linear-gradient(180deg, rgba(20,6,6,0.6), rgba(20,6,6,0));
  overflow:hidden; z-index:5; pointer-events:none; }
.bs-sky::after { content:''; position:absolute; left:0; right:0; bottom:0; height:1px;
  background:linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent); }
.bs-stars { position:absolute; inset:0; opacity:0.4; }
.bs-star { position:absolute; width:2px; height:2px; border-radius:50%; background:#d4af37;
  box-shadow:0 0 4px rgba(212,175,55,0.8); animation:bsTwinkle 3s ease-in-out infinite; }
@keyframes bsTwinkle { 0%,100% { opacity:0.3; } 50% { opacity:1; } }

.bs-dragon-wrap {
  position:absolute; top:18px; left:0; width:340px; height:157px;
  animation:bsFly 13s cubic-bezier(.55,.05,.35,.95) infinite; will-change:transform;
}
@keyframes bsFly {
  0%{transform:translateX(-115%) translateY(0);}
  10%{transform:translateX(-30%) translateY(-6px);}
  25%{transform:translateX(15%) translateY(10px);}
  45%{transform:translateX(55%) translateY(-8px);}
  60%{transform:translateX(170%) translateY(6px);}
  80%{transform:translateX(330%) translateY(-2px);}
  100%{transform:translateX(460%) translateY(0);}
}
.bs-dragon-img {
  width:100%; height:100%; display:block;
  filter:drop-shadow(0 6px 12px rgba(0,0,0,0.45)) drop-shadow(0 0 18px rgba(212,175,55,0.35));
  animation:bsWiggle 1.4s ease-in-out infinite; transform-origin:80% 50%;
}
@keyframes bsWiggle {
  0%{transform:rotate(-2deg) skewX(0deg) translateY(0);}
  25%{transform:rotate(1deg) skewX(-3deg) translateY(-3px);}
  50%{transform:rotate(2deg) skewX(0deg) translateY(0);}
  75%{transform:rotate(-1deg) skewX(3deg) translateY(3px);}
  100%{transform:rotate(-2deg) skewX(0deg) translateY(0);}
}
.bs-trail { position:absolute; width:4px; height:4px; border-radius:50%; background:#d4af37;
  box-shadow:0 0 6px #f0c659; opacity:0; animation:bsTrail 13s linear infinite; top:88px; }
@keyframes bsTrail {
  0%{opacity:0; transform:translateX(-20px) translateY(0);}
  10%{opacity:0.9;}
  50%{opacity:0.5; transform:translateX(80vw) translateY(-6px);}
  70%{opacity:0; transform:translateX(110vw) translateY(0);}
  100%{opacity:0;}
}

/* ── frame ──────────────────────────────────────────────────────── */
.bs-frame { position:relative; z-index:2; margin-top:202px;
  background:rgba(20,8,8,0.18); padding:28px 32px 32px;
  box-shadow: inset 0 0 0 2px #d4af37, inset 0 0 0 4px rgba(20,8,8,0.4), inset 0 0 0 5px #d4af37; }
.bs-frame::before, .bs-frame::after { content:''; position:absolute; width:28px; height:28px; border:2px solid #d4af37; }
.bs-frame::before { top:8px; left:8px; border-right:0; border-bottom:0; }
.bs-frame::after { top:8px; right:8px; border-left:0; border-bottom:0; }
.bs-corner-bl { position:absolute; bottom:8px; left:8px; width:28px; height:28px; border:2px solid #d4af37; border-right:0; border-top:0; }
.bs-corner-br { position:absolute; bottom:8px; right:8px; width:28px; height:28px; border:2px solid #d4af37; border-left:0; border-top:0; }

/* ── header ─────────────────────────────────────────────────────── */
.bs-header { display:flex; align-items:center; justify-content:space-between; gap:24px; padding-bottom:18px; margin-bottom:14px; border-bottom:1.5px dashed rgba(212,175,55,0.4); }
.bs-brand { display:flex; flex-direction:column; gap:6px; }
.bs-brand-mark { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.35em; text-transform:uppercase; color:#d4af37; font-weight:500; }
.bs-wordmark { font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:400; font-size:80px; line-height:0.88; letter-spacing:-0.02em; color:#f5e7c4; text-shadow:0 2px 0 rgba(0,0,0,0.3); margin:0; }
.bs-wordmark::after { content:'.'; color:#d4af37; font-style:normal; }
.bs-wordmark-sub { font-family:'Cormorant Garamond',serif; font-style:italic; font-size:15px; color:#d4af37; margin-top:2px; opacity:0.85; }

.bs-stats { display:flex; gap:18px; align-items:center; }
.bs-stat-coin { width:88px; height:88px; border-radius:50%;
  background:radial-gradient(circle at 30% 30%, #f0c659, #b8851f 70%, #8a5e15);
  position:relative; display:flex; align-items:center; justify-content:center;
  box-shadow:0 4px 12px rgba(0,0,0,0.4), inset 0 0 0 3px rgba(20,8,8,0.6);
  flex-shrink:0; transform:rotate(-4deg); animation:bsCoinSpin 16s ease-in-out infinite; }
@keyframes bsCoinSpin { 0%,100% { transform:rotate(-4deg); } 50% { transform:rotate(4deg); } }
.bs-stat-coin::before { content:''; position:absolute; inset:8px; border-radius:50%; border:1.5px solid rgba(20,8,8,0.5); }
.bs-stat-coin::after { content:''; position:absolute; inset:18px; border:1.5px solid rgba(20,8,8,0.35); }
.bs-stat-coin-num { font-family:'JetBrains Mono',monospace; font-weight:500; font-size:20px; color:#2a1010; line-height:1; }
.bs-stat-text { font-family:'Cormorant Garamond',serif; font-style:italic; font-size:18px; color:#f5e7c4; text-align:right; line-height:1.3; }
.bs-stat-text b { font-family:'JetBrains Mono',monospace; font-style:normal; color:#d4af37; font-weight:500; font-size:20px; }
.bs-stat-text small { display:block; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.3em; text-transform:uppercase; color:rgba(245,231,196,0.55); margin-top:4px; }

/* ── meta row ───────────────────────────────────────────────────── */
.bs-meta-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:8px 0 18px; margin-bottom:12px; border-bottom:1.5px dashed rgba(212,175,55,0.25); flex-wrap:wrap; }
.bs-members { display:flex; align-items:baseline; gap:8px; }
.bs-meta-label { font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.3em; text-transform:uppercase; color:rgba(212,175,55,0.7); }
.bs-meta-value { font-family:'Cormorant Garamond',serif; font-style:italic; font-size:15px; color:#f5e7c4; }
.bs-meta-actions { display:flex; gap:8px; }
.bs-meta-btn { background:transparent; border:1px solid rgba(212,175,55,0.5); padding:6px 14px; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:#d4af37; cursor:pointer; transition:all .15s; }
.bs-meta-btn:hover { background:#d4af37; color:#1a0808; }
.bs-meta-btn-quiet { border-color:rgba(212,175,55,0.25); color:rgba(212,175,55,0.55); }
.bs-meta-btn-quiet:hover { background:rgba(122,26,26,0.6); color:#f5e7c4; border-color:rgba(220,53,69,0.5); }

/* ── search ─────────────────────────────────────────────────────── */
.bs-search-row { display:flex; align-items:center; gap:14px; margin-bottom:22px; }
.bs-search-lbl { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.3em; text-transform:uppercase; color:#d4af37; font-weight:500; }
.bs-search { background:rgba(20,8,8,0.4); border:1.5px solid rgba(212,175,55,0.4); padding:9px 16px; font-size:14px; width:300px; outline:none; color:#f5e7c4; font-family:'Cormorant Garamond',serif; font-style:italic; letter-spacing:0.05em; }
.bs-search:focus { border-color:#d4af37; }
.bs-search::placeholder { color:rgba(245,231,196,0.4); }

/* ── tile grid ──────────────────────────────────────────────────── */
.bs-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:9px; }
@media (max-width: 900px) { .bs-grid { grid-template-columns:repeat(4,1fr); } }
@media (max-width: 540px) { .bs-grid { grid-template-columns:repeat(3,1fr); } }
.bs-tile { aspect-ratio:1/1; position:relative; overflow:visible; cursor:pointer; outline:none; transition:transform .3s cubic-bezier(.2,.7,.3,1); border:none; padding:0; background:none; opacity:0; animation:bsFadeIn .5s forwards; }
@keyframes bsFadeIn { to { opacity:1; } }
.bs-tile:hover, .bs-tile:focus-visible { transform:scale(1.06); z-index:5; }
.bs-tile-inner { position:absolute; inset:0; background:#1a0808; box-shadow:inset 0 0 0 1px #d4af37, inset 0 0 0 3px rgba(20,8,8,0.6), inset 0 0 0 4px rgba(212,175,55,0.5); overflow:hidden; transition:box-shadow .3s; }
.bs-tile:hover .bs-tile-inner { box-shadow:inset 0 0 0 1px #f0c659, inset 0 0 0 3px rgba(20,8,8,0.6), inset 0 0 0 4px #f0c659, 0 0 24px rgba(212,175,55,0.35); }
.bs-tile-inner::before, .bs-tile-inner::after,
.bs-corner-tile-bl, .bs-corner-tile-br { content:''; position:absolute; width:8px; height:8px; border:1px solid #d4af37; z-index:3; }
.bs-tile-inner::before { top:5px; left:5px; border-right:0; border-bottom:0; }
.bs-tile-inner::after { top:5px; right:5px; border-left:0; border-bottom:0; }
.bs-corner-tile-bl { bottom:5px; left:5px; border-right:0; border-top:0; }
.bs-corner-tile-br { bottom:5px; right:5px; border-left:0; border-top:0; }
.bs-tile-photo, .bs-tile-photo video, .bs-tile video.bs-tile-photo {
  position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
  background-size:cover; background-position:center; filter:saturate(0.7) sepia(0.25) brightness(0.85);
}
.bs-tile-photo::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(20,8,8,0.1) 45%, rgba(20,8,8,0.75)); }
.bs-name { position:absolute; left:10px; bottom:8px; font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500; font-size:16px; line-height:1.05; z-index:3; }
.bs-tile-visited .bs-name { color:#f5e7c4; text-shadow:0 1px 4px rgba(0,0,0,0.7); }
.bs-tile-empty .bs-name { color:rgba(212,175,55,0.6); }
.bs-tile-empty .bs-name-sub { display:block; font-family:'JetBrains Mono',monospace; font-style:normal; font-size:9px; letter-spacing:0.2em; color:rgba(212,175,55,0.4); margin-top:2px; }
.bs-badge { position:absolute; top:8px; right:8px; min-width:22px; height:22px; padding:0 6px; background:#d4af37; color:#1a0808; font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:600; display:flex; align-items:center; justify-content:center; border-radius:2px; z-index:3; box-shadow:0 1px 3px rgba(0,0,0,0.3); }

/* ── detail view ────────────────────────────────────────────────── */
.bs-detail { position:fixed; inset:0; background:#b91d22;
  background-image: radial-gradient(ellipse at 20% 0%, rgba(212,175,55,0.12), transparent 55%);
  padding:40px 52px 80px; animation:bsSlideIn .42s cubic-bezier(.2,.7,.3,1); overflow:auto; z-index:20; }
@keyframes bsSlideIn { from { transform:translateX(60px); opacity:0; } to { transform:translateX(0); opacity:1; } }
.bs-back { background:none; border:1.5px solid rgba(212,175,55,0.5); padding:7px 16px; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.3em; text-transform:uppercase; color:#d4af37; cursor:pointer; margin-bottom:28px; transition:all .15s; }
.bs-back:hover { background:#d4af37; color:#1a0808; }

.bs-detail-head { display:grid; grid-template-columns:auto 1fr auto; gap:24px; align-items:center; padding:24px; background:rgba(20,8,8,0.25); box-shadow:inset 0 0 0 1.5px #d4af37, inset 0 0 0 3px rgba(20,8,8,0.4), inset 0 0 0 4px rgba(212,175,55,0.5); margin-bottom:8px; }
.bs-flag-cell { width:92px; height:92px; background:#1a0808; box-shadow:inset 0 0 0 1.5px #d4af37; display:flex; align-items:center; justify-content:center; font-size:48px; position:relative; font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif; line-height:1; }
.bs-flag-cell::before, .bs-flag-cell::after { content:''; position:absolute; width:14px; height:14px; border:1.5px solid #d4af37; }
.bs-flag-cell::before { top:4px; left:4px; border-right:0; border-bottom:0; }
.bs-flag-cell::after { bottom:4px; right:4px; border-left:0; border-top:0; }
.bs-name-stack { display:flex; flex-direction:column; gap:10px; }
.bs-name-big { font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:400; font-size:96px; line-height:0.85; letter-spacing:-0.025em; color:#f5e7c4; text-shadow:0 2px 0 rgba(0,0,0,0.3); margin:0; }
.bs-name-row { display:flex; align-items:center; gap:14px; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.3em; text-transform:uppercase; color:#d4af37; font-weight:500; }
.bs-name-row span:not(:last-child)::after { content:'·'; margin-left:14px; opacity:0.5; }

.bs-headcoin { width:92px; height:92px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #f0c659, #b8851f 70%, #8a5e15); position:relative; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.4), inset 0 0 0 3px rgba(20,8,8,0.6); }
.bs-headcoin::before { content:''; position:absolute; inset:8px; border-radius:50%; border:1.5px solid rgba(20,8,8,0.5); }
.bs-headcoin-num { font-family:'JetBrains Mono',monospace; font-weight:500; font-size:22px; color:#2a1010; line-height:1; }
.bs-headcoin-lbl { position:absolute; bottom:-20px; left:50%; transform:translateX(-50%); font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.25em; text-transform:uppercase; color:rgba(245,231,196,0.65); white-space:nowrap; }

.bs-fortune { background:linear-gradient(180deg, #d4af37, #b8851f); color:#1a0808; padding:14px 18px; text-align:center; font-family:'Cormorant Garamond',serif; font-style:italic; font-size:20px; letter-spacing:0.05em; font-weight:500; box-shadow:0 4px 12px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(20,8,8,0.4); }
.bs-fortune em { font-style:normal; color:#7a1a1a; }
.bs-fortune small { display:block; font-family:'JetBrains Mono',monospace; font-style:normal; font-weight:500; font-size:10px; letter-spacing:0.3em; text-transform:uppercase; margin-top:4px; opacity:0.75; }

/* ── upload bar ─────────────────────────────────────────────────── */
.bs-upload-bar { display:flex; align-items:center; gap:14px; margin-top:24px; padding:14px 18px; background:rgba(20,8,8,0.3); border:1.5px dashed rgba(212,175,55,0.4); }
.bs-upload-btn { background:#d4af37; color:#1a0808; border:none; padding:10px 20px; font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:0.25em; text-transform:uppercase; font-weight:600; cursor:pointer; transition:background .15s, transform .1s; }
.bs-upload-btn:hover:not(:disabled) { background:#f0c659; }
.bs-upload-btn:active:not(:disabled) { transform:scale(0.98); }
.bs-upload-btn:disabled { opacity:0.7; cursor:wait; }
.bs-upload-hint { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.2em; color:rgba(245,231,196,0.5); text-transform:uppercase; }
.bs-upload-error { margin:14px 0 0; padding:10px 14px; background:rgba(122,26,26,0.45); border:1px solid rgba(220,53,69,0.45); color:#f5c2c7; font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:0.1em; }

/* ── gallery ────────────────────────────────────────────────────── */
.bs-gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:22px; margin-top:32px; }
.bs-item-wrap { transition:opacity .15s; }
.bs-item-wrap:hover .bs-item-drag { opacity:0.85; }
.bs-item-dragging { box-shadow:0 18px 40px rgba(0,0,0,0.55); }
.bs-item { position:relative; margin:0; background:#f5e7c4; padding:8px 8px 0; box-shadow:0 10px 24px rgba(0,0,0,0.35), inset 0 0 0 1px #d4af37; }
.bs-item-drag {
  position:absolute; bottom:10px; left:10px; z-index:5;
  width:28px; height:28px; padding:0;
  background:rgba(20,8,8,0.78); color:#d4af37;
  border:1px solid rgba(212,175,55,0.55);
  font-family:'JetBrains Mono',monospace; font-size:14px; line-height:1;
  display:flex; align-items:center; justify-content:center;
  cursor:grab; opacity:0; transition:opacity .15s, color .15s, background .15s;
  touch-action:none;
}
.bs-item-drag:hover { opacity:1 !important; color:#f0c659; background:rgba(20,8,8,0.92); }
.bs-item-drag:active, .bs-item-drag:focus-visible { cursor:grabbing; opacity:1 !important; outline:none; }
.bs-item-cover-badge {
  position:absolute; top:10px; right:10px; z-index:5;
  background:#d4af37; color:#1a0808;
  font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:600;
  letter-spacing:0.2em; text-transform:uppercase;
  padding:4px 8px; border-radius:1px;
  box-shadow:0 1px 3px rgba(0,0,0,0.3);
  pointer-events:none;
}
.bs-item-media { position:relative; aspect-ratio:1/1; background:#1a0808; overflow:hidden; }
.bs-item-media img, .bs-item-media video { width:100%; height:100%; object-fit:cover; display:block; }
.bs-item-duration { position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,0.7); color:#fff; font-family:'JetBrains Mono',monospace; font-size:10px; padding:2px 6px; border-radius:2px; letter-spacing:0.05em; }
.bs-item-caption { display:flex; align-items:center; gap:8px; padding:8px 4px; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.15em; text-transform:uppercase; color:#7a1a1a; }
.bs-item-author { flex:1; font-weight:600; }
.bs-item-date { opacity:0.6; }
.bs-item-delete { background:none; border:none; color:#7a1a1a; font-family:'JetBrains Mono',monospace; font-size:14px; cursor:pointer; padding:2px 6px; opacity:0.4; transition:opacity .15s, color .15s; }
.bs-item-delete:hover:not(:disabled) { opacity:1; color:#b91d22; }
/* Foreign uploads get a slightly more cautious styling so an accidental
   click on someone else's photo feels more intentional than the obvious
   "x out my own thing" gesture. */
.bs-item-delete-foreign { opacity:0.25; color:#5a1414; }
.bs-item-delete-foreign:hover:not(:disabled) { color:#b91d22; opacity:0.85; }

/* ── empty state ────────────────────────────────────────────────── */
.bs-empty { text-align:center; padding:60px 20px; color:rgba(245,231,196,0.6); font-family:'Cormorant Garamond',serif; font-style:italic; font-size:18px; }
.bs-empty-mark { font-size:64px; color:rgba(212,175,55,0.4); line-height:1; margin-bottom:12px; }
`;
