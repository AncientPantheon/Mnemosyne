"use client";

import { useEffect } from "react";

// Legacy route — the admin is now one hash-routed shell at /admin#khronoton. Redirect any
// old deep link (bookmark, external nav) into the shell, preserving the section.
export default function RedirectToShell(): null {
  useEffect(() => {
    window.location.replace("/admin#khronoton");
  }, []);
  return null;
}
