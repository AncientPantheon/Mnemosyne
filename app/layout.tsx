import type { ReactNode } from "react";

// Codex shell stylesheet — imported ONCE in the server root layout. It is
// `.codex-ui`-scoped so it does not bleed into the marketing pages, and
// codex-ui's `sideEffects: ["**/*.css"]` keeps it from being tree-shaken.
import "@ancientpantheon/codex/ui.css";

export const metadata = {
  title: "Mnemosyne",
  description: "Mnemosyne Codex hub",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // stoa-deep base for ALL React routes (the landing /, /admin, /codex,
    // /_not-found) so a centered/short page never shows the browser's white body
    // behind it. The landing is now a React route (app/page.tsx) rendered through
    // this layout, so it shares this body.
    <html lang="en" style={{ background: "#0d0a07" }}>
      <body style={{ margin: 0, minHeight: "100vh", background: "#0d0a07" }}>
        {/* Canonical Pantheonic design tokens (:root { --bg … --accent … --maxw }).
            Linked ahead of the codex ui.css import so the token custom-properties
            are the cascade base every React surface (/admin, /codex) resolves
            against. Served as a static public asset, hence a <link> not an import. */}
        <link rel="stylesheet" href="/assets/pantheon-tokens.css" />
        {/* Cinzel — the Mnemosyne display face (the header medallion + landing
            headings). Rendered here so every React route (the landing, /admin,
            /codex) gets it; Next hoists the stylesheet link into <head>. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap"
        />
        {children}
      </body>
    </html>
  );
}
