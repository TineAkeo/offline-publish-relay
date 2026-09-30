// Publish relay: turns a Webflow "Site publish" webhook into a GitHub
// "Run workflow" for that site's offline app repo.
//
//   POST .../hook/<owner>/<repo>/<secret>
//
// The secret must match .kit/hook.json in <owner>/<repo> (written by the
// offline app's setup). Webflow's dashboard webhooks aren't signed, so the
// unguessable address is what keeps strangers out; a stray call could only
// start a rebuild, which stops after one check if nothing was published.

export interface RelayEnv {
  GITHUB_TOKEN?: string;    // fine-grained token: Actions read & write, Contents read-only
  ALLOWED_OWNERS?: string;  // optional: comma-separated GitHub accounts, e.g. "TineAkeo"
}

const HOOK_RE = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9_-]{16,})\/?$/;
const WORKFLOW = 'offline-rebuild.yml';

function github(env: RelayEnv, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'offline-publish-relay',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

// Constant-time comparison, so response timing doesn't leak the secret.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const notFound = () => new Response('Not found', { status: 404 });

// Failures on GitHub's side. Not 5xx: Webflow Cloud swaps 5xx responses for
// its own error page, which would hide the reason. Any non-200 still makes
// Webflow retry the webhook. Also logged (Webflow Cloud app logs).
function upstream(message: string): Response {
  console.error('[relay]', message);
  return new Response(message, { status: 424, headers: { 'Content-Type': 'text/plain' } });
}

/** Handle a request for "<owner>/<repo>/<secret>" (the part after /hook/). */
export async function handleHook(request: Request, rest: string, env: RelayEnv): Promise<Response> {
  const match = HOOK_RE.exec(rest || '');
  if (!match) return notFound();
  if (request.method !== 'POST') return new Response('Use POST', { status: 405 });
  if (!env.GITHUB_TOKEN) return upstream('Relay is missing GITHUB_TOKEN (set it in the app\'s environment variables)');

  const [, owner, repo, secret] = match;
  const allowed = (env.ALLOWED_OWNERS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(owner.toLowerCase())) return notFound();

  const res = await github(env, `/repos/${owner}/${repo}/contents/.kit/hook.json`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  });
  if (res.status === 404) return notFound();
  if (!res.ok) return upstream(`GitHub error reading .kit/hook.json: ${res.status} ${(await res.text()).slice(0, 300)}`);
  let hook: { secret?: string; branch?: string };
  try {
    hook = await res.json();
  } catch {
    return notFound();
  }
  if (!hook.secret || !sameSecret(String(hook.secret), secret)) return notFound();

  // A non-2xx reply makes Webflow retry (3 more times, 10 minutes apart).
  const run = await github(env, `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: hook.branch || 'main' }),
  });
  if (run.status !== 204) {
    return upstream(`GitHub didn't start the rebuild: ${run.status} ${(await run.text()).slice(0, 300)}`);
  }
  return Response.json({ ok: true, repo: `${owner}/${repo}`, started: WORKFLOW });
}
