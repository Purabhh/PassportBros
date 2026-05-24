import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import JoinGroup from './pages/JoinGroup.jsx';
import GroupHome from './pages/GroupHome.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/g/:groupId" element={<GroupRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Decides whether to show JoinGroup or GroupHome based on whether the
// browser already has a member token for this group.
import { useParams } from 'react-router-dom';
import { getMemberFor } from './api.js';

function GroupRoute() {
  const { groupId } = useParams();
  const member = getMemberFor(groupId);
  return member ? <GroupHome /> : <JoinGroup />;
}
