// Invite-acceptance page rendered at /g/:id when the visitor doesn't yet
// have a membership stored on this device. Styled as a boarding stub
// (torn left edge on desktop, torn top on mobile) so it visually matches
// the boarding-pass landing - the whole app is the same metaphor end-to-end.

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, saveMemberFor } from '../api.js';

// ─── small helpers ─────────────────────────────────────────────────────

// Plausible "real ticket" boarding code. Same alphabet as the landing's
// dynamic SEQ, minus characters that read poorly in monospace at small
// sizes (0/1/I/L/O/Q). Random per page load so it feels alive.
function randCode() {
  const ALPHA = 'ABCDEFGHJKMNPRSTUVWXYZ23456789';
  let s = 'PB-';
  for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return `${month} · ${d.getFullYear()}`;
}

// Tracks a CSS media query without re-running on every render. Used to
// flip the stub's torn-edge orientation between mobile (top) and desktop
// (left) so the silhouette still reads as a ticket stub on a narrow phone.
function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

// ─── visual sub-components ─────────────────────────────────────────────

function Barcode() {
  // Hand-tuned widths so the bars look like a real Code-39 strip rather
  // than a uniform stripe. Deterministic per render is fine; barcodes
  // don't need to be unique per visit, and a fixed pattern looks crisper
  // than `Math.random()` would.
  const widths = [1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 1, 2, 1, 3, 1, 2,
                  1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1];
  return (
    <div className="ji-barcode">
      {widths.map((w, i) => (
        <span key={i} className="ji-bar" style={{ width: w + 'px' }} />
      ))}
    </div>
  );
}

function FriendStrip({ names, total }) {
  // Show up to three avatar swatches. Each name maps deterministically
  // to one of three duotone gradients so the same name renders the same
  // color every time (no random churn on re-render).
  const palette = ['ji-av-1', 'ji-av-2', 'ji-av-3'];
  const visible = names.slice(0, 3);
  const overflow = Math.max(0, total - visible.length);
  return (
    <div className="ji-friends">
      <div className="ji-avatars">
        {visible.map((name, i) => {
          // Tiny stable hash → pick palette index.
          const h = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
          return (
            <div
              key={i}
              className={`ji-av ${palette[h % palette.length]}`}
              title={name}
              style={{ zIndex: visible.length - i }}
            />
          );
        })}
        {overflow > 0 && (
          <div className="ji-av ji-av-more" title={`+${overflow} more`} style={{ zIndex: 0 }}>
            +{overflow}
          </div>
        )}
      </div>
      <div className="ji-friends-text">
        <div className="ji-friends-label">already inside</div>
        <div className="ji-friends-names">
          {visible.length ? visible.join(' · ') : 'this group is brand new'}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, accent }) {
  return (
    <div className="ji-mini">
      <div className="ji-mini-label">{label}</div>
      <div className={`ji-mini-value${accent ? ' ji-mini-accent' : ''}`}>{value}</div>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────

export default function JoinGroup() {
  const { groupId } = useParams();
  const nav = useNavigate();

  const [group, setGroup] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stage, setStage] = useState('form'); // form | submitting | done
  const [err, setErr] = useState('');

  const isNarrow = useMedia('(max-width: 639px)');
  const refCode = useMemo(() => randCode(), []);

  useEffect(() => {
    let cancelled = false;
    api.getGroup(groupId)
      .then(g => { if (!cancelled) setGroup(g); })
      .catch(e => { if (!cancelled) setLoadErr(e.message); });
    return () => { cancelled = true; };
  }, [groupId]);

  async function handleJoin(e) {
    e.preventDefault();
    if (!displayName.trim() || stage !== 'form') return;
    setStage('submitting');
    setErr('');
    try {
      const { member } = await api.joinGroup({ groupId, displayName: displayName.trim() });
      saveMemberFor(groupId, member, group?.name);
      // Tiny pause so the "BOARDED" stamp is readable before we leave -
      // otherwise the navigate steals the celebration immediately.
      setStage('done');
      setTimeout(() => nav(`/g/${groupId}`, { replace: true }), 1100);
    } catch (e) {
      setErr(e.message);
      setStage('form');
    }
  }

  if (loadErr) return (
    <div className="ji-stage ji-stage-error">
      <style>{CSS}</style>
      <div className="ji-error-card">
        <h2>this invite isn't working</h2>
        <p>{loadErr}</p>
        <small>the link may be invalid, or the group was deleted</small>
      </div>
    </div>
  );
  if (!group) return (
    <div className="ji-stage">
      <style>{CSS}</style>
      <div className="ji-loading">
        <span className="ji-pulse-dot ji-pulse-gold" />
        <span>opening the invite…</span>
      </div>
    </div>
  );

  const memberNames = group.memberNames || [];
  const dateLabel = formatDate(group.createdAt);

  return (
    <div className="ji-stage">
      <style>{CSS}</style>

      {/* runway dashes top/bottom */}
      <div className="ji-runway ji-runway-top" />
      <div className="ji-runway ji-runway-bottom" />

      <div className="ji-now-boarding">
        <span className="ji-pulse-dot ji-pulse-gold" />
        <span>now boarding</span>
      </div>

      <div className={`ji-stub ${isNarrow ? 'ji-stub-narrow' : 'ji-stub-wide'}`}>
        {/* the dashed perforation that mirrors the torn edge */}
        <div className={isNarrow ? 'ji-perf-h' : 'ji-perf-v'} />

        <div className="ji-stub-inner">
          {stage === 'done' ? (
            <div className="ji-done">
              <div className="ji-boarded-stamp">BOARDED</div>
              <h2 className="ji-done-title">
                welcome aboard, {displayName.split(' ')[0]}.
              </h2>
              <p className="ji-done-sub">
                you're in <em>"{group.name}"</em>. opening your scrapbook…
              </p>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="ji-head">
                <div className="ji-head-brand">
                  <div className="ji-wordmark">passportbros</div>
                  <div className="ji-zone">boarding stub · zone 1</div>
                </div>
                <div className="ji-head-meta">
                  <div className="ji-head-label">ref</div>
                  <div className="ji-head-ref">{refCode}</div>
                  <div className="ji-head-label ji-head-gate">gate · 04</div>
                </div>
              </div>

              {/* host */}
              <div className="ji-host">
                <span className="ji-pulse-dot ji-pulse-red" />
                <span>
                  you're invited by{' '}
                  <b>{group.founderName || 'a friend'}</b>
                </span>
              </div>

              {/* you're joining */}
              <div className="ji-joining">
                <div className="ji-joining-label">you're joining</div>
                <h1 className="ji-joining-name">"{group.name}"</h1>
                {dateLabel && <div className="ji-joining-date">· {dateLabel} ·</div>}
              </div>

              {/* friend strip */}
              <div className="ji-friends-wrap">
                <FriendStrip names={memberNames} total={group.memberCount || 0} />
              </div>

              {/* pre-filled stats */}
              <div className="ji-stats">
                <Mini label="travelers" value={`${group.memberCount || 0} inside`} />
                <Mini label="countries" value={`${group.countryCount || 0} so far`} />
                <Mini label="payload"   value={`${group.uploadCount || 0} memories`} accent />
              </div>

              {/* perforation divider */}
              <div className="ji-perforation">
                <div className="ji-perf-circle ji-perf-circle-l" />
                <div className="ji-perf-circle ji-perf-circle-r" />
                <div className="ji-perf-line" />
              </div>

              {/* name input + board button */}
              <form className="ji-form" onSubmit={handleJoin}>
                <div className="ji-input-row">
                  <span className="ji-input-label">your name on this trip</span>
                  <span className="ji-input-hint">how friends see your uploads</span>
                </div>
                <input
                  className="ji-input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Alex"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={40}
                  required
                />

                <button
                  type="submit"
                  className="ji-board-btn"
                  disabled={!displayName.trim() || stage === 'submitting'}
                >
                  <span className="ji-board-arrow">→</span>
                  <span className="ji-board-text">
                    {stage === 'submitting' ? 'boarding…' : 'board the group'}
                  </span>
                  <span className="ji-board-plane">✈</span>
                </button>
                {err && <p className="ji-err">{err}</p>}
              </form>

              {/* barcode + foot */}
              <div className="ji-foot">
                <Barcode />
                <div className="ji-foot-line1">no login · no email · no passwords</div>
                <div className="ji-foot-line2">
                  your invite link <em>is</em> your access
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ji-fineprint">a quiet scrapbook for friends · invite only</div>
    </div>
  );
}

// ─── styles ────────────────────────────────────────────────────────────

const CSS = `
.ji-stage {
  min-height:100vh; width:100%;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:48px 16px 56px; position:relative; overflow:hidden;
  background:radial-gradient(ellipse at 50% 40%, #7a1a1a 0%, #4a0e08 65%, #2a0608 100%);
  color:#ede2c4; font-family:'Manrope','Cormorant Garamond',system-ui,sans-serif;
}

/* runway dashes */
.ji-runway {
  position:absolute; left:0; right:0; height:2px;
  background:repeating-linear-gradient(to right,
    rgba(212,175,55,0.35) 0 14px, transparent 14px 28px);
}
.ji-runway-top { top:22px; }
.ji-runway-bottom { bottom:22px; }
@media (max-width: 639px) {
  .ji-runway-top { top:14px; }
  .ji-runway-bottom { bottom:14px; }
}

.ji-now-boarding {
  display:flex; align-items:center; gap:8px; margin-bottom:18px;
  font-family:'JetBrains Mono',monospace; font-size:11px;
  letter-spacing:0.32em; text-transform:uppercase; color:#d4af37;
}
@media (max-width: 639px) { .ji-now-boarding { font-size:10px; } }

/* pulsing dot */
.ji-pulse-dot {
  width:6px; height:6px; border-radius:50%; display:inline-block;
  animation:jiPulse 1.6s ease-in-out infinite;
}
.ji-pulse-gold { background:#d4af37; }
.ji-pulse-red  { background:#7a1a1a; }
@keyframes jiPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

/* stub card */
.ji-stub {
  position:relative; width:100%; max-width:640px;
  background-color:#ede2c4;
  background-image:
    radial-gradient(ellipse at 30% 20%, rgba(255,250,235,0.55) 0%, transparent 60%),
    repeating-linear-gradient(0deg, rgba(58,10,8,0.025) 0 1px, transparent 1px 3px);
  box-shadow:0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(58,10,8,0.15);
  color:#2a0808;
}
/* torn left edge - radial scallops cut out of the left side */
.ji-stub-wide {
  -webkit-mask:radial-gradient(circle at 0 18px, transparent 9px, #000 9.5px) 0 0/100% 36px;
          mask:radial-gradient(circle at 0 18px, transparent 9px, #000 9.5px) 0 0/100% 36px;
}
/* torn top edge - same idea rotated for mobile */
.ji-stub-narrow {
  -webkit-mask:radial-gradient(circle at 18px 0, transparent 9px, #000 9.5px) 0 0/36px 100%;
          mask:radial-gradient(circle at 18px 0, transparent 9px, #000 9.5px) 0 0/36px 100%;
}

/* dashed perforation along the torn edge */
.ji-perf-v {
  position:absolute; top:24px; bottom:24px; left:10px; width:1px;
  background:repeating-linear-gradient(to bottom, rgba(58,10,8,0.55) 0 6px, transparent 6px 12px);
}
.ji-perf-h {
  position:absolute; left:24px; right:24px; top:10px; height:1px;
  background:repeating-linear-gradient(to right, rgba(58,10,8,0.55) 0 6px, transparent 6px 12px);
}

.ji-stub-inner { position:relative; padding:38px 36px 32px 56px; }
@media (max-width: 639px) { .ji-stub-inner { padding:40px 22px 24px; } }

/* header */
.ji-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
  padding-bottom:14px; border-bottom:1px dashed rgba(42,8,8,0.3); }
.ji-head-brand { min-width:0; }
.ji-wordmark {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:30px; line-height:1; color:#7a1a1a;
}
@media (max-width: 639px) { .ji-wordmark { font-size:26px; } }
.ji-zone {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.28em; text-transform:uppercase; color:rgba(42,8,8,0.6);
  margin-top:6px;
}
.ji-head-meta { text-align:right; flex-shrink:0; }
.ji-head-label {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
}
.ji-head-ref {
  font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:700;
  letter-spacing:0.18em; color:#7a1a1a; margin:2px 0;
}
.ji-head-gate { margin-top:2px; }

/* host */
.ji-host {
  display:flex; align-items:center; gap:8px; margin-top:22px;
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.28em; text-transform:uppercase; color:rgba(42,8,8,0.7);
}
.ji-host b { color:#2a0808; font-weight:600; }
@media (max-width: 639px) { .ji-host { font-size:9px; letter-spacing:0.22em; } }

/* you're joining */
.ji-joining { margin-top:10px; }
.ji-joining-label {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
  margin-bottom:6px;
}
.ji-joining-name {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-weight:500;
  font-size:clamp(28px, 7vw, 50px); line-height:1.05; letter-spacing:-0.01em;
  color:#2a0808; margin:0;
}
.ji-joining-date {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.45);
  margin-top:8px;
}

/* friends */
.ji-friends-wrap { margin-top:22px; }
.ji-friends { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.ji-avatars { display:flex; }
.ji-av {
  width:40px; height:40px; border-radius:50%; border:2px solid #ede2c4;
  margin-left:-10px; position:relative; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:600;
  color:#2a0808;
}
.ji-av:first-child { margin-left:0; }
.ji-av-1 { background:linear-gradient(135deg,#f5c89a,#c84a2a 60%,#5a0e08); }
.ji-av-2 { background:linear-gradient(135deg,#e6c089,#b94022 55%,#3a1414); }
.ji-av-3 { background:linear-gradient(135deg,#f0d2a0,#d4af37 55%,#7a1a1a); }
.ji-av-more {
  background:rgba(42,8,8,0.1); color:#7a1a1a; font-size:10px;
  border-color:rgba(42,8,8,0.15);
}
.ji-friends-text { display:flex; flex-direction:column; min-width:0; }
.ji-friends-label {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.6);
}
.ji-friends-names {
  font-family:'Cormorant Garamond',serif; font-style:italic; color:#2a0808;
  font-size:17px; line-height:1.2; word-break:break-word;
}

/* stats grid */
.ji-stats {
  display:grid; grid-template-columns:repeat(3,1fr); gap:16px;
  margin-top:20px; padding-top:14px; border-top:1px dashed rgba(42,8,8,0.3);
}
.ji-mini { min-width:0; }
.ji-mini-label {
  font-family:'JetBrains Mono',monospace; font-size:9px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
  margin-bottom:2px;
}
.ji-mini-value {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:15px; color:#2a0808; line-height:1.15;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.ji-mini-accent { color:#7a1a1a; }
@media (max-width: 380px) {
  .ji-stats { grid-template-columns:repeat(3,1fr); gap:10px; }
  .ji-mini-value { font-size:13px; }
}

/* perforation divider */
.ji-perforation { position:relative; margin-top:24px; height:1px; }
.ji-perf-line {
  position:absolute; left:0; right:0; top:0; height:1px;
  background:repeating-linear-gradient(to right, rgba(58,10,8,0.55) 0 6px, transparent 6px 12px);
}
.ji-perf-circle {
  position:absolute; top:50%; transform:translateY(-50%);
  width:18px; height:18px; border-radius:50%; background:#3a0a08;
}
.ji-perf-circle-l { left:-46px; }
.ji-perf-circle-r { right:-26px; }
@media (max-width: 639px) {
  .ji-perf-circle-l { left:-32px; }
  .ji-perf-circle-r { right:-32px; }
}

/* form */
.ji-form { margin-top:24px; display:flex; flex-direction:column; gap:10px; }
.ji-input-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; flex-wrap:wrap; }
.ji-input-label {
  font-family:'JetBrains Mono',monospace; font-size:11px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.7);
}
.ji-input-hint {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:12px; color:rgba(42,8,8,0.45);
}
.ji-input {
  width:100%; background:transparent; border:0; border-bottom:2px solid #3a0a08;
  outline:none; padding:4px 0 8px;
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:26px; color:#2a0808;
  transition:border-color .15s;
}
.ji-input:focus { border-bottom-color:#7a1a1a; }
.ji-input::placeholder { color:rgba(58,10,8,0.3); }
@media (max-width: 639px) { .ji-input { font-size:22px; } }

.ji-board-btn {
  margin-top:14px; width:100%; background:#7a1a1a; color:#ede2c4;
  border:0; padding:18px 22px;
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  font-family:'JetBrains Mono',monospace; font-weight:700; font-size:14px;
  letter-spacing:0.24em; text-transform:uppercase;
  cursor:pointer; box-shadow:0 10px 28px rgba(122,26,26,0.45);
  transition:transform .15s, box-shadow .15s, background .15s;
}
.ji-board-btn:hover:not(:disabled) {
  transform:translateY(-1px); background:#5a0e08;
  box-shadow:0 14px 34px rgba(122,26,26,0.6);
}
.ji-board-btn:active:not(:disabled) { transform:translateY(0); }
.ji-board-btn:disabled { opacity:0.45; cursor:not-allowed; }
.ji-board-arrow, .ji-board-plane { font-size:22px; line-height:1; }
.ji-board-plane { color:#d4af37; }
@media (max-width: 639px) {
  .ji-board-btn { padding:16px 18px; font-size:12px; letter-spacing:0.2em; }
}

.ji-err {
  margin:6px 0 0; font-family:'JetBrains Mono',monospace; font-size:11px;
  color:#7a1a1a; letter-spacing:0.08em;
}

/* foot */
.ji-foot {
  margin-top:24px; padding-top:14px; border-top:1px dashed rgba(42,8,8,0.3);
  display:flex; flex-direction:column; align-items:center; gap:8px;
}
.ji-barcode { display:flex; align-items:stretch; gap:1px; height:38px; }
.ji-bar { background:#3a0a08; }
.ji-foot-line1 {
  font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(42,8,8,0.55);
  text-align:center;
}
.ji-foot-line2 {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:13px; color:rgba(42,8,8,0.65); text-align:center; margin-top:-2px;
}
.ji-foot-line2 em { color:#7a1a1a; font-style:normal; }

.ji-fineprint {
  margin-top:18px; font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(237,226,196,0.45);
  text-align:center; padding:0 8px;
}

/* done state */
.ji-done {
  display:flex; flex-direction:column; align-items:center; text-align:center;
  gap:18px; padding:40px 0 30px;
}
.ji-boarded-stamp {
  display:inline-block; padding:12px 26px;
  border:3px solid #7a1a1a; color:#7a1a1a;
  font-family:'JetBrains Mono',monospace; font-weight:700;
  font-size:24px; letter-spacing:0.3em;
  transform:rotate(-4deg); background:rgba(122,26,26,0.05);
  animation:jiStamp .35s ease-out;
}
@keyframes jiStamp {
  0%   { transform:rotate(8deg) scale(2);   opacity:0; }
  60%  { transform:rotate(-8deg) scale(0.92); opacity:1; }
  100% { transform:rotate(-4deg) scale(1);  }
}
.ji-done-title {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:clamp(26px, 6vw, 36px); color:#2a0808; margin:0; line-height:1.1;
}
.ji-done-sub {
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:16px; color:rgba(42,8,8,0.7); margin:0; max-width:380px;
}
.ji-done-sub em { color:#7a1a1a; font-style:normal; font-weight:500; }

/* loading / error states */
.ji-loading {
  display:flex; align-items:center; gap:10px;
  font-family:'JetBrains Mono',monospace; font-size:12px;
  letter-spacing:0.28em; text-transform:uppercase; color:#d4af37;
}
.ji-stage-error { padding:60px 16px; }
.ji-error-card {
  max-width:480px; background:rgba(0,0,0,0.25); border:1px solid rgba(212,175,55,0.4);
  padding:32px 28px; text-align:center;
}
.ji-error-card h2 {
  font-family:'Cormorant Garamond',serif; font-style:italic; font-size:26px;
  margin:0 0 8px; color:#ede2c4;
}
.ji-error-card p {
  font-family:'JetBrains Mono',monospace; font-size:12px; color:#f5c2c7;
  margin:0 0 14px; letter-spacing:0.05em;
}
.ji-error-card small {
  display:block; font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:0.22em; text-transform:uppercase; color:rgba(237,226,196,0.55);
}
`;
