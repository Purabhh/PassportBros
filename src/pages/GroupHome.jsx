import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Scrapbook from '../components/Scrapbook.jsx';
import { api, getMemberFor, clearMemberFor, uploadFile } from '../api.js';

export default function GroupHome() {
  const { groupId } = useParams();
  const nav = useNavigate();
  const member = getMemberFor(groupId);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const d = await api.getData({ groupId, token: member?.token });
      setData(d);
      setError(null);
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        clearMemberFor(groupId);
        nav(`/g/${groupId}`, { replace: true });
        return;
      }
      setError(e.message);
    }
  }, [groupId, member?.token, nav]);

  useEffect(() => {
    if (!member) { nav(`/g/${groupId}`, { replace: true }); return; }
    loadData();
  }, [member, groupId, loadData, nav]);

  // Upload pipeline: single multipart POST → server saves to disk + db → refetch.
  const handleUpload = useCallback(async (countryCode, file, metadata) => {
    try {
      await uploadFile({
        groupId,
        token: member.token,
        countryCode,
        file,
        durationSec: metadata?.durationSec ?? null,
      });
      await loadData();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [groupId, member?.token, loadData]);

  const handleDelete = useCallback(async (uploadId) => {
    try {
      await api.deleteUpload({ groupId, token: member.token, uploadId });
      await loadData();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [groupId, member?.token, loadData]);

  function handleLeave() {
    if (!confirm('Leave this group on this device? Your uploads stay; you can rejoin with the same link.')) return;
    clearMemberFor(groupId);
    nav('/');
  }

  if (error) return (
    <div className="boot">
      <div style={{fontSize:24}}>couldn't load the group</div>
      <small>{error}</small>
      <small>try refreshing — or check the server is running</small>
    </div>
  );
  if (!data) return (
    <div className="boot">
      <div style={{fontSize:24}}>unfurling the chronicle…</div>
      <small>loading r/passportbros</small>
    </div>
  );

  return (
    <Scrapbook
      group={data.group}
      me={data.me}
      members={data.members}
      countries={data.countries}
      totals={data.totals}
      onUpload={handleUpload}
      onDelete={handleDelete}
      onLeave={handleLeave}
      inviteUrl={typeof window !== 'undefined' ? `${window.location.origin}/g/${groupId}` : `/g/${groupId}`}
    />
  );
}
