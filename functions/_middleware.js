// Auth gate — currently DISABLED. Every route (including /api/state, which
// holds all student/lesson data as raw JSON) is open to anyone with the URL.
//
// This is intentional for now (test/demo phase, no real student data), but
// must be re-enabled before real data goes into this deployment: the in-app
// login screen in kitesurf-school.html is client-side only and does not
// protect the API — anyone can GET/PUT /api/state directly regardless of it.
//
// To re-enable HTTP Basic Auth: replace the export below with the block
// commented out further down, then set TJKITE_PASSWORD as a Cloudflare
// dashboard Secret (see CLOUDFLARE.md) — do not put it in wrangler.toml.
export const onRequest = async ({ next }) => next();

/*
export const onRequest = async ({ request, env, next }) => {
  const adminPwd      = env.TJKITE_PASSWORD;
  const instructorPwd = env.TJKITE_INSTRUCTOR_PASSWORD; // optional second password for instructors

  if (!adminPwd) {
    return new Response("TJKITE_PASSWORD secret is not configured", { status: 500 });
  }

  const auth = request.headers.get("authorization") || "";
  let ok = false;
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const password = decoded.slice(decoded.indexOf(":") + 1);
      ok = password === adminPwd || (instructorPwd && password === instructorPwd);
    } catch { /* malformed header */ }
  }

  if (!ok) {
    return new Response("Auth required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="TJKite Manager", charset="UTF-8"' }
    });
  }

  return next();
};
*/
