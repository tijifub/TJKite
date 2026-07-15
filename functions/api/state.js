const KEY = "tjkite-state";

const json = (body, init = {}) => new Response(
  typeof body === "string" ? body : JSON.stringify(body),
  {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  }
);

export const onRequestGet = async ({ env }) => {
  const data = await env.TJKITE_KV.get(KEY);
  return json(data || "{}");
};

export const onRequestPut = async ({ request, env }) => {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (
    !parsed || typeof parsed !== "object" ||
    !parsed.settings ||
    !Array.isArray(parsed.students) ||
    !Array.isArray(parsed.lessons)
  ) {
    return new Response("Invalid app state", { status: 400 });
  }

  await env.TJKITE_KV.put(KEY, JSON.stringify(parsed));
  return json({ ok: true });
};

export const onRequest = () => new Response("Method not allowed", { status: 405 });
