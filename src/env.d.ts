// Environment variables set in the app's Webflow Cloud settings.
interface Env {
  GITHUB_TOKEN?: string;
  ALLOWED_OWNERS?: string;
}

declare module "cloudflare:workers" {
  export const env: Env;
}
