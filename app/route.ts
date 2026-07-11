import { readFileSync } from "node:fs";
import { join } from "node:path";

// The marketing landing is the byte-preserved static page folded in from web/.
// It uses the Tailwind Play CDN + inline config + Google Fonts, which only run
// when the browser parses the original <script>/<link> tags in order — so it is
// served verbatim here rather than re-expressed as JSX (which would break the
// CDN pipeline) or injected via dangerouslySetInnerHTML (which never executes
// injected scripts). Read once at module load; the file is immutable at runtime.
const LANDING_PATH = join(process.cwd(), "public", "index.html");
const PACKAGE_PATH = join(process.cwd(), "package.json");

/** The running Mnemosyne version, from package.json (single source of truth). */
function mnemosyneVersion(): string {
  try {
    return (
      (JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as { version?: string })
        .version ?? "0.0.0"
    );
  } catch {
    return "0.0.0";
  }
}

export function GET() {
  // Read per request so edits to public/index.html reflect without a server
  // restart (the file is small; this is negligible). The route is dynamic.
  // Inject the running version into the {{MNEMOSYNE_VERSION}} placeholder so the
  // header tag always reflects what is actually deployed.
  const landingHtml = readFileSync(LANDING_PATH, "utf8").replaceAll(
    "{{MNEMOSYNE_VERSION}}",
    mnemosyneVersion(),
  );
  return new Response(landingHtml, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const dynamic = "force-dynamic";
