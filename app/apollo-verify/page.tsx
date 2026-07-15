import type { ReactElement } from "react";

import { ApolloVerifyMount } from "./ApolloVerifyMount.client";

// The generic /apollo-verify surface — a relying party (Pythia first) deep-links
// here with ?accounts&challenge&rp&callback to have the user prove Apollo-key
// ownership. Client-only (the codex tree pulls browser crypto); this server page
// renders nothing from the codex packages, mirroring /codex.
export const dynamic = "force-dynamic";

export default function ApolloVerifyPage(): ReactElement {
  return <ApolloVerifyMount />;
}
