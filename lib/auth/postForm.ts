/**
 * POST a form, manually following same-origin redirects so the method, body, and
 * Authorization header SURVIVE. The hub runs Next.js with `trailingSlash: true`,
 * so `POST /api/oidc/token` can 308 to `/api/oidc/token/` — and Node's auto-follow
 * drops the body + auth across a 307/308, which the IdP then rejects as an empty
 * request. Re-issuing the POST to the redirect target ourselves keeps them intact.
 * A no-op (single call) when the endpoint does not redirect.
 */
export async function postForm(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  let target = url;
  let res!: Response;
  for (let hop = 0; hop < 3; hop++) {
    res = await fetch(target, { method: "POST", headers, body, redirect: "manual" });
    const location =
      res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    target = new URL(location, target).toString();
  }
  return res;
}
