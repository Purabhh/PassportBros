import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, saveMemberFor } from '../api.js';

export default function JoinGroup() {
  const { groupId } = useParams();
  const nav = useNavigate();

  const [group, setGroup] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getGroup(groupId)
      .then(g => { if (!cancelled) setGroup(g); })
      .catch(e => { if (!cancelled) setLoadErr(e.message); });
    return () => { cancelled = true; };
  }, [groupId]);

  async function handleJoin(e) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true); setErr('');
    try {
      const { member } = await api.joinGroup({ groupId, displayName: displayName.trim() });
      saveMemberFor(groupId, member, group?.name);
      nav(`/g/${groupId}`, { replace: true });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (loadErr) return (
    <div className="boot"><div style={{fontSize:24}}>{loadErr}</div>
      <small>this invite link may be invalid or the group was deleted</small></div>
  );
  if (!group) return <div className="boot"><div style={{fontSize:24}}>opening the invite…</div></div>;

  return (
    <div className="landing-root">
      <div className="landing-frame">
        <div className="landing-mark">r/passportbros · join</div>
        <h1 className="landing-title">{group.name}</h1>
        <p className="landing-sub">
          {group.memberCount === 1
            ? '1 friend already in · join them'
            : `${group.memberCount} friends already in · join them`}
        </p>

        <form className="landing-form" onSubmit={handleJoin}>
          <label className="landing-field">
            <span>your name (how the group sees your uploads)</span>
            <input
              autoFocus
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Mo"
              maxLength={40}
              required
            />
          </label>
          <button className="landing-submit" type="submit" disabled={busy}>
            {busy ? 'joining…' : 'join group →'}
          </button>
        </form>

        {err && <p className="landing-err">{err}</p>}
      </div>
    </div>
  );
}
