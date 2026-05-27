// The real landing is the static boarding-pass page at public/landing.html,
// served at "/" by Vite (dev) and Express (prod). This React stub only mounts
// when the SPA does a client-side navigation to "/" (e.g. clicking "leave
// group" in GroupHome). In that case we bounce to a full reload so the server
// serves the static page.

import { useEffect } from 'react';

export default function Landing() {
  useEffect(() => {
    window.location.replace('/');
  }, []);
  return null;
}
