// HTTP Basic Auth gate over the entire site.
// Username is ignored; only the password matters.
// Accepts TJKITE_PASSWORD (admin/owner) OR TJKITE_INSTRUCTOR_PASSWORD (instructors).
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
