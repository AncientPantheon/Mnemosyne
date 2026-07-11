import type { ReactNode } from "react";

// Codex shell stylesheet — imported ONCE in the server root layout. It is
// `.codex-ui`-scoped so it does not bleed into the marketing pages, and
// codex-ui's `sideEffects: ["**/*.css"]` keeps it from being tree-shaken.
import "@ancientpantheon/codex-ui/ui.css";

export const metadata = {
  title: "Mnemosyne",
  description: "Mnemosyne Codex hub",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // stoa-deep base for ALL React routes (/admin, /codex, /_not-found) so a
    // centered/short page never shows the browser's white body behind it. The
    // landing route serves its own <body>, so this doesn't touch it.
    <html lang="en" style={{ background: "#0d0a07" }}>
      <body style={{ margin: 0, minHeight: "100vh", background: "#0d0a07" }}>
        {/* Cinzel — the Mnemosyne display face (matches the landing wordmark).
            Rendered here so the React routes (/codex host bar) get it; Next
            hoists the stylesheet link into <head>. The landing route serves its
            own Cinzel via its inline CDN <link>. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap"
        />
        {children}
      </body>
    </html>
  );
}
