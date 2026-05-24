import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, saveMemberFor } from '../api.js';

export default function Landing() {
  const nav = useNavigate();
  const [mode, setMode] = useState('create');           // 'create' | 'join'
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinLink, setJoinLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim() || !displayName.trim()) return;
    setBusy(true); setErr('');
    try {
      const { group, member } = await api.createGroup({
        name: name.trim(),
        founderName: displayName.trim(),
      });
      saveMemberFor(group.id, member);
      nav(`/g/${group.id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  function handleJoin(e) {
    e.preventDefault();
    const m = /\/g\/([A-Za-z0-9]+)/.exec(joinLink.trim());
    const id = m ? m[1] : joinLink.trim();
    if (!id) return setErr('paste a full r/PassportBros link');
    nav(`/g/${id}`);
  }

  return (
    <div className="landing-root">
      <style>{LANDING_CSS}</style>

      <div className="landing-frame">
        <div className="landing-mark">r/passportbros</div>
        <h1 className="landing-title">a shared chronicle</h1>
        <p className="landing-sub">
          one scrapbook · all your friends · every country · photos &amp; videos
        </p>

        <div className="landing-tabs">
          <button
            className={`landing-tab ${mode === 'create' ? 'on' : ''}`}
            onClick={() => { setMode('create'); setErr(''); }}>
            start a new one
          </button>
          <button
            className={`landing-tab ${mode === 'join' ? 'on' : ''}`}
            onClick={() => { setMode('join'); setErr(''); }}>
            i was sent a link
          </button>
        </div>

        {mode === 'create' && (
          <form className="landing-form" onSubmit={handleCreate}>
            <label className="landing-field">
              <span>group name</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="EU Trip 2025"
                maxLength={80}
                required
              />
            </label>
            <label className="landing-field">
              <span>your name (how friends see your uploads)</span>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Alex"
                maxLength={40}
                required
              />
            </label>
            <button className="landing-submit" type="submit" disabled={busy}>
              {busy ? 'creating…' : 'create scrapbook →'}
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form className="landing-form" onSubmit={handleJoin}>
            <label className="landing-field">
              <span>paste your invite link</span>
              <input
                value={joinLink}
                onChange={e => setJoinLink(e.target.value)}
                placeholder="https://passportbros.app/g/xY8nQ3kP42…"
                required
              />
            </label>
            <button className="landing-submit" type="submit">open it →</button>
          </form>
        )}

        {err && <p className="landing-err">{err}</p>}

        <p className="landing-foot">
          no login · no email · no passwords — your invite link <em>is</em> your access
        </p>
      </div>
    </div>
  );
}

const LANDING_CSS = `
.landing-root {
  min-height: 100vh; padding: 60px 20px;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(212,175,55,0.12), transparent 55%),
    radial-gradient(ellipse at 80% 100%, rgba(40,8,8,0.4), transparent 60%),
    #b91d22;
  display: flex; align-items: flex-start; justify-content: center;
  color: #f5e7c4; font-family: 'Cormorant Garamond', serif;
}
.landing-frame {
  max-width: 520px; width: 100%; padding: 36px 36px 40px;
  background: rgba(20,8,8,0.25);
  box-shadow: inset 0 0 0 1.5px #d4af37, inset 0 0 0 3px rgba(20,8,8,0.4),
              inset 0 0 0 4.5px rgba(212,175,55,0.4);
  position: relative;
}
.landing-frame::before, .landing-frame::after {
  content: ''; position: absolute; width: 28px; height: 28px; border: 2px solid #d4af37;
}
.landing-frame::before { top: 8px; left: 8px; border-right: 0; border-bottom: 0; }
.landing-frame::after { top: 8px; right: 8px; border-left: 0; border-bottom: 0; }

.landing-mark {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.4em;
  text-transform: uppercase; color: #d4af37; font-weight: 500; text-align: center;
  margin-bottom: 8px;
}
.landing-title {
  font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 400;
  font-size: 56px; line-height: 0.95; letter-spacing: -0.02em;
  color: #f5e7c4; text-align: center; margin: 0; text-shadow: 0 2px 0 rgba(0,0,0,0.3);
}
.landing-title::after { content: '.'; color: #d4af37; font-style: normal; }
.landing-sub {
  font-family: 'Cormorant Garamond', serif; font-style: italic; text-align: center;
  font-size: 16px; color: #d4af37; opacity: 0.85; margin: 8px 0 28px;
}

.landing-tabs { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 1.5px dashed rgba(212,175,55,0.4); }
.landing-tab {
  flex: 1; background: none; border: none; padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.25em;
  text-transform: uppercase; color: rgba(245,231,196,0.55); cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1.5px;
}
.landing-tab.on { color: #d4af37; border-bottom-color: #d4af37; }
.landing-tab:hover:not(.on) { color: rgba(245,231,196,0.85); }

.landing-form { display: flex; flex-direction: column; gap: 16px; }
.landing-field { display: flex; flex-direction: column; gap: 6px; }
.landing-field span {
  font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.3em;
  text-transform: uppercase; color: rgba(245,231,196,0.55);
}
.landing-field input {
  background: rgba(20,8,8,0.4); border: 1.5px solid rgba(212,175,55,0.4);
  padding: 10px 14px; font-size: 15px; outline: none; color: #f5e7c4;
  font-family: 'Cormorant Garamond', serif; font-style: italic; letter-spacing: 0.02em;
}
.landing-field input:focus { border-color: #d4af37; }
.landing-field input::placeholder { color: rgba(245,231,196,0.35); }

.landing-submit {
  background: #d4af37; color: #1a0808; border: none; padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.3em;
  text-transform: uppercase; font-weight: 600; cursor: pointer;
  transition: background .15s, transform .1s; margin-top: 8px;
}
.landing-submit:hover:not(:disabled) { background: #f0c659; }
.landing-submit:active:not(:disabled) { transform: scale(0.98); }
.landing-submit:disabled { opacity: 0.5; cursor: wait; }

.landing-err {
  margin: 14px 0 0; padding: 8px 12px; background: rgba(122,26,26,0.4);
  border: 1px solid rgba(220,53,69,0.4); color: #f5c2c7; font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}
.landing-foot {
  margin: 32px 0 0; text-align: center; font-size: 12px;
  font-family: 'JetBrains Mono', monospace; letter-spacing: 0.15em;
  color: rgba(245,231,196,0.45); text-transform: uppercase;
}
.landing-foot em { font-style: italic; text-transform: none; color: #d4af37; }
`;
