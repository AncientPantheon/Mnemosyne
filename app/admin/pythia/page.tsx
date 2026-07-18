"use client";

import { useEffect } from "react";

// Legacy route — the admin is now one hash-routed shell at /admin#pythia. Redirect any
// old deep link (bookmark, external nav) into the shell, preserving the section.
export default function RedirectToShell(): null {
  useEffect(() => {
    window.location.replace("/admin#pythia");
  }, []);
  return null;
}
