// .../hook/<owner>/<repo>/<secret> — see src/lib/relay.ts.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleHook } from '../../lib/relay';

export const prerender = false;

export const ALL: APIRoute = ({ request, params }) =>
  handleHook(request, params.path ?? '', env as { GITHUB_TOKEN?: string; ALLOWED_OWNERS?: string });
