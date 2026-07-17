"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import {
  KhronotonProvider,
  createFetchAdapter,
} from "@ancientpantheon/khronoton-core/provider";
import {
  Builder,
  CronotonList,
  Detail,
  KhronotonUiRoot,
} from "@ancientpantheon/khronoton-core/ui";
import type { Access } from "@ancientpantheon/khronoton-core/ui";
import "@ancientpantheon/khronoton-core/ui.css";

/**
 * The live Khronoton console: the package's real screens over the ancient-gated
 * `/api/admin/khronoton` catch-all (same engine context as the tick loop).
 *
 * - Adapter: `createFetchAdapter` — mutations carry the `x-khronoton-confirmed`
 *   header once {@link onNeedConfirm} resolves; a 401 `admin_confirm_required`
 *   re-prompts exactly once (the package's `runGated` contract).
 * - Navigation: the screens are router-agnostic; this component holds the
 *   list ⇄ detail(id) ⇄ builder(editId?) state and wires their callbacks.
 * - Theming: `--khr-*` tokens are overridden to the admin bronze/parchment
 *   palette in admin.css (scoped to the admin panel).
 */

type Screen =
  | { view: "list" }
  | { view: "detail"; id: string }
  | { view: "builder"; editId?: string };

/** Promise-backed confirm gate rendered as a small admin-styled dialog. */
function useConfirmGate(): {
  gate: ReactElement | null;
  onNeedConfirm: () => Promise<boolean>;
} {
  const [pending, setPending] = useState<{ resolve: (ok: boolean) => void } | null>(null);

  const onNeedConfirm = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        setPending({ resolve });
      }),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  const gate = pending ? (
    <div className="mnemo-admin-confirm mnemo-khronoton-confirm" role="alertdialog">
      <p className="mnemo-admin-status">
        Confirm this Khronoton action? It changes what the automaton will sign and
        execute on-chain.
      </p>
      <div className="mnemo-admin-btnrow">
        <button
          type="button"
          className="mnemo-admin-btn mnemo-admin-btn--primary"
          onClick={() => settle(true)}
        >
          Yes, proceed
        </button>
        <button type="button" className="mnemo-admin-btn" onClick={() => settle(false)}>
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  return { gate, onNeedConfirm };
}

export function KhronotonApp(): ReactElement {
  const [screen, setScreen] = useState<Screen>({ view: "list" });
  const [email, setEmail] = useState<string | undefined>(undefined);
  const { gate, onNeedConfirm } = useConfirmGate();

  // Display-only identity for the screens (the server stamps createdBy itself).
  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((me: { name?: string }) => {
        if (active) setEmail(me?.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const adapter = useMemo(() => createFetchAdapter("/api/admin/khronoton"), []);
  const access: Access = useMemo(() => ({ tier: "admin", email }), [email]);

  return (
    <KhronotonUiRoot className="mnemo-khronoton">
      <KhronotonProvider adapter={adapter} onNeedConfirm={onNeedConfirm}>
        {gate}
        {screen.view === "list" ? (
          <CronotonList
            access={access}
            onOpen={(id) => setScreen({ view: "detail", id })}
            onEdit={(id) => setScreen({ view: "builder", editId: id })}
            onNew={() => setScreen({ view: "builder" })}
          />
        ) : screen.view === "detail" ? (
          <Detail
            id={screen.id}
            access={access}
            onBack={() => setScreen({ view: "list" })}
            onEdit={(id) => setScreen({ view: "builder", editId: id })}
            onNavigateToList={() => setScreen({ view: "list" })}
          />
        ) : (
          <Builder
            editId={screen.editId}
            access={access}
            onDone={(id) =>
              setScreen(id ? { view: "detail", id } : { view: "list" })
            }
          />
        )}
      </KhronotonProvider>
    </KhronotonUiRoot>
  );
}

export default KhronotonApp;
