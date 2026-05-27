import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Scrapbook from '../components/Scrapbook.jsx';
import {
  api, getMemberFor, saveMemberFor, clearMemberFor,
  listMemberships, uploadFile,
} from '../api.js';

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

  // Lazy backfill: if this device's stored membership predates the
  // group-switcher feature (no groupName), fill it in now so the
  // switcher can render the group's real name.
  useEffect(() => {
    if (!member || !data?.group) return;
    if (!member.groupName || member.groupName !== data.group.name) {
      saveMemberFor(groupId, member, data.group.name);
    }
  }, [member, data?.group, groupId]);

  // Upload pipeline: single multipart POST → server saves to disk + db → refetch.
  // The optional onProgress callback is invoked with a 0..1 fraction for the
  // file currently being sent - used by the gallery to render a progress bar
  // so big-video uploads over LTE don't look frozen.
  const handleUpload = useCallback(async (countryCode, file, metadata) => {
    try {
      await uploadFile({
        groupId,
        token: member.token,
        countryCode,
        file,
        durationSec: metadata?.durationSec ?? null,
        onProgress: metadata?.onProgress,
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

  // Drag-to-reorder. The Scrapbook drives the visual rearrangement with its
  // own local state during the drag; we just persist the final order and
  // refetch to confirm (or revert) from the server's view.
  const handleReorder = useCallback(async (countryCode, orderedIds) => {
    try {
      await api.reorderUploads({ groupId, token: member.token, countryCode, orderedIds });
      await loadData();
      return { ok: true };
    } catch (e) {
      await loadData();
      return { ok: false, error: e.message };
    }
  }, [groupId, member?.token, loadData]);

  function handleLeave() {
    // The "rejoin creates a fresh member" trap is real: api.joinGroup always
    // inserts a new row, so the old uploads stay in the group but become
    // orphaned - viewable by everyone, no longer deletable by you. Until we
    // server-side dedupe by device-ID this warning is the lazy fix.
    const msg =
      'Leave this group on this device?\n\n' +
      "Your uploads stay in the group. If you rejoin from the same link, " +
      "you'll appear as a NEW member. you won't be able to delete or reorder " +
      'the uploads you made before.';
    if (!confirm(msg)) return;
    clearMemberFor(groupId);
    nav('/');
  }

  if (error) return (
    <div className="boot">
      <div style={{fontSize:24}}>couldn't load the group</div>
      <small>{error}</small>
      <small>try refreshing or check the server is running</small>
    </div>
  );
  if (!data) return (
    <div className="boot">
      <div style={{fontSize:24}}>unfurling the chronicle…</div>
      <small>loading r/passportbros</small>
    </div>
  );

  // listMemberships() reads localStorage synchronously. It's cheap so we just
  // call it on every render - no point in stashing it in state when joining
  // another group writes to localStorage but doesn't trigger a re-render
  // here anyway. (After a join → navigate, the destination page re-renders.)
  const memberships = listMemberships();

  return (
    <Scrapbook
      group={data.group}
      me={data.me}
      members={data.members}
      countries={data.countries}
      totals={data.totals}
      memberships={memberships}
      onUpload={handleUpload}
      onDelete={handleDelete}
      onReorder={handleReorder}
      onLeave={handleLeave}
      onSwitchGroup={(id) => nav(`/g/${id}`)}
      inviteUrl={typeof window !== 'undefined' ? `${window.location.origin}/g/${groupId}` : `/g/${groupId}`}
    />
  );
}
