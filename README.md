# offline-publish-relay

A tiny Webflow Cloud app that turns a Webflow **Site publish** webhook into
a GitHub **Run workflow** for that site's offline app repo, so the offline
app rebuilds itself whenever someone clicks Publish in Webflow.

```
Webflow: Publish  →  webhook  →  this relay  →  GitHub: run "Rebuild offline app"  →  push  →  Webflow Cloud redeploys
```

One relay serves every offline app repo on your GitHub account.

## How requests are checked

Webhooks go to `…/hook/<owner>/<repo>/<secret>`. The relay:

1. Checks `<owner>` is in `ALLOWED_OWNERS`.
2. Reads `.kit/hook.json` from that repo and compares its `secret`.
3. Runs that repo's `offline-rebuild.yml` workflow on the `branch` given
   there (default `main`).

Anything else gets a plain 404. Webflow's dashboard webhooks aren't signed,
so the unguessable address is the protection. At worst, a leaked address lets
someone start a rebuild, and that stops after one check if the site wasn't
republished.

## Setup (once)

### 1. A GitHub token for the relay

On GitHub: **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**.

- **Repository access:** *All repositories*, or only your offline app repos
  (then add each new one later).
- **Permissions → Repository permissions:**
  - **Actions:** Read and write (to start the workflow)
  - **Contents:** Read-only (to read `.kit/hook.json`)
  - Nothing else.
- Set an expiry you're comfortable with, and put a reminder in your calendar
  to renew it.

### 2. Deploy the relay on Webflow Cloud

1. Push this repo to GitHub.
2. In Webflow: **Apps → Webflow Cloud → Create new app**, pick this repo and
   choose **Existing site**, for example your test site. Set the mount path to
   **`/hooks`**.
3. In the app's **environment variables**, add:
   - `GITHUB_TOKEN`: the token from step 1 (mark it secret)
   - `ALLOWED_OWNERS`: `TineAkeo`
4. Deploy. `https://<that-site>/hooks` should show "Publish relay is running".

The relay's address is then `https://<that-site>/hooks`. Put it in each
offline app's `.kit/site.json` as `"relay"`. The offline app template already
has it.

### 3. Per client site: the webhook

The offline app's setup run prints its webhook address:
`https://<relay>/hook/<owner>/<repo>/<secret>`. In the **client's** Webflow
site: **Site settings → Apps & integrations → Webhooks → Add webhook**:

- **Trigger type:** Site publish
- **Webhook URL:** that address

Publish the site once to test. In the offline app repo's **Actions** tab, a
"Rebuild offline app" run should start within seconds.

## Developing

`src/worker.ts` handles `/hook/...` and passes everything else to the static
files (`index.html`). Environment variables are read from `env` in the
worker; never name them `VITE_*`, which would ship them to browsers.
