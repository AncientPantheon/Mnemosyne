"use client";

import type { ReactElement } from "react";

import { useMe } from "@/lib/useMe";

import "./pantheon-header.css";

/** A Tier-1 section (L2) or Tier-2 sub-view (L3) button. Either navigates (`href`)
 *  or invokes a handler (`onSelect`); `active` renders the current one accented. */
export interface HeaderNavItem {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  active?: boolean;
}

/** The single accent-worthy link on L2 (one, not a row). */
export interface MemorableAction {
  label: string;
  href: string;
}

export interface PantheonHeaderProps {
  /** "full" = landing/public (L1+L2+L3); "admin" = L1 only (nav is the sidebar). */
  variant: "full" | "admin";
  /** App version for the medallion chip (e.g. "0.7.0"). */
  version?: string;
  /** Brand wordmark; defaults to "Mnemosyne". */
  brand?: string;
  /** Where the medallion links; defaults to "/". */
  homeHref?: string;
  /** A ghost back button right of the medallion (admin → home). */
  backHref?: string;
  backLabel?: string;
  /** L2 Tier-1 sections (full variant only). */
  sections?: HeaderNavItem[];
  /** L2 single memorable action (full variant only). */
  memorableAction?: MemorableAction;
  /** L3 Tier-2 sub-views of the active section (full variant only). */
  subviews?: HeaderNavItem[];
}

/** The right-hand identity block — the ONE shared implementation, reading `useMe`.
 *  Holds (renders nothing) until the first `/api/me` resolves so there's no flash of
 *  the wrong auth state. Hub-supplied name/role are React text nodes, never HTML. */
function Identity({ showAdmin }: { showAdmin: boolean }): ReactElement | null {
  const { me } = useMe();
  if (me === null) return null;

  if (!me.authenticated) {
    return (
      <a className="ph-btn ph-btn--primary" href="/admin/login">
        Login with AncientHub
      </a>
    );
  }

  const roles = Array.isArray(me.roles) ? me.roles : [];
  const isAncient = roles.includes("ancient");
  const shownRole = roles.length ? (isAncient ? "ancient" : roles[0]) : null;

  return (
    <>
      <span className="ph-who">
        Signed in as <b>{me.name || "user"}</b>
        {shownRole ? (
          <>
            {" · "}
            <span
              className={`ph-role-badge${isAncient ? " ph-role-badge--ancient" : ""}`}
            >
              {shownRole}
            </span>
          </>
        ) : null}
      </span>
      {showAdmin ? (
        isAncient ? (
          <a className="ph-btn ph-btn--ghost" href="/admin">
            Admin
          </a>
        ) : (
          <span
            className="ph-btn ph-btn--ghost"
            aria-disabled="true"
            title="Requires the ancient role"
          >
            Admin
          </span>
        )
      ) : null}
      <a className="ph-btn ph-btn--ghost" href="/admin/logout">
        Log out
      </a>
    </>
  );
}

/** One nav button (L2/L3): an `<a>` when it has an href, else a `<button>`. */
function NavButton({ item }: { item: HeaderNavItem }): ReactElement {
  const cls = `ph-btn${item.active ? " ph-btn--active" : " ph-btn--ghost"}`;
  return item.href ? (
    <a className={cls} href={item.href} onClick={item.onSelect}>
      {item.label}
    </a>
  ) : (
    <button type="button" className={cls} onClick={item.onSelect}>
      {item.label}
    </button>
  );
}

/**
 * The Pantheonic Header — the single sticky 3-level `.ph` bar shared by every surface.
 * L1: medallion + version chip + identity block. L2 (full only): Tier-1 sections + one
 * memorable action. L3 (full only): the fixed-height Tier-2 zone. `variant="admin"`
 * renders L1 only — admin's navigation is the sidebar. The bottom separator is on
 * `.ph` (full chrome width), not `.ph-inner`.
 */
export function PantheonHeader({
  variant,
  version,
  brand = "Mnemosyne",
  homeHref = "/",
  backHref,
  backLabel = "← Back",
  sections,
  memorableAction,
  subviews,
}: PantheonHeaderProps): ReactElement {
  return (
    <header className="ph">
      <div className="ph-inner">
        <div className="ph-l1">
          <div className="ph-l1-left">
            <a className="ph-medallion" href={homeHref}>
              <span className="ph-name">{brand}</span>
            </a>
            {version ? <span className="ph-version">v{version}</span> : null}
            {backHref ? (
              <a className="ph-btn ph-btn--ghost" href={backHref}>
                {backLabel}
              </a>
            ) : null}
          </div>
          <div className="ph-l1-right">
            <Identity showAdmin={variant === "full"} />
          </div>
        </div>

        {variant === "full" && (sections?.length || memorableAction) ? (
          <div className="ph-l2">
            <div className="ph-tier1">
              {sections?.map((s) => (
                <NavButton key={s.id} item={s} />
              ))}
            </div>
            {memorableAction ? (
              <div className="ph-memorable">
                <a className="ph-btn ph-btn--primary" href={memorableAction.href}>
                  {memorableAction.label}
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {variant === "full" ? (
          <div className="ph-l3">
            <div className="ph-tier2">
              {subviews?.map((s) => (
                <NavButton key={s.id} item={s} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default PantheonHeader;
