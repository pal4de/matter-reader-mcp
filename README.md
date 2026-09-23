# Matter Reader MCP

A self-hosted MCP server for using your Matter account from ChatGPT Developer Mode, running on Cloudflare Workers. Each deployment connects to one Matter account.

The server imports the API client from the official [Matter CLI](https://github.com/getmatterapp/matter-cli). It does not start a CLI process or container. The Streamable HTTP endpoint is `/mcp`.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pal4de/matter-reader-mcp)

An independent community project, not an official Matter integration. Deploy your own instance; there is no shared hosted service.

## What you can do

Ask ChatGPT to search your saved reading, retrieve highlights, or organize your queue. For example:

- "Find articles I saved about local-first software."
- "Show my highlights from this article."
- "Save this URL to my Matter queue."

Seventeen tools cover items, annotations, tags, search, reading sessions, and account information. Set `READ_ONLY` to `true` to expose only the eight read tools. Writes are enabled by default. See the [tool reference](docs/design.md#tool-mapping) for exact coverage.

You need a Matter API token, a Cloudflare account with Access, and ChatGPT Developer Mode. Obtain your Matter token through the official [Matter CLI login flow](https://github.com/getmatterapp/matter-cli#auth). The server itself does not require installing the CLI.

**Start here:** deploy the Worker, protect all traffic with Access, then connect ChatGPT. The Deploy button creates the Worker project; Access and OAuth still need manual setup. A custom domain is optional: a `workers.dev` address works.

## Local checks

Use Node.js 22 or later.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
```

The CLI's other dependencies are installed, but only referenced modules are bundled into the Worker. Its terminal UI installation scripts are not needed.

## Set up Cloudflare Access

Cloudflare **Workers** runs the server. Cloudflare **Access** controls who may connect and handles OAuth. You can configure Access after deployment using the Worker dashboard:

1. Create a Cloudflare account and set up a Zero Trust organization if prompted.
2. After deploying, open the Worker → **Access** → **Manage Worker access**. Select **All traffic**, not just previews.
3. Allow only your own email. The preconfigured **Cloudflare account members** policy is also suitable if you intend every member of your Cloudflare account to access this Matter account.
4. Open the linked Access application → **Additional settings** → **OAuth**, enable **Managed OAuth**, and save. Some dashboard versions call this tab **Advanced settings**.
5. Add these **Allowed redirect URIs** for ChatGPT and save:

   ```text
   https://chatgpt.com/connector/oauth/*
   https://chatgpt.com/connector_platform_oauth_redirect
   ```

   Cloudflare supports a trailing `/*`. ChatGPT uses either a callback-specific URI or the stable URI depending on the authorization server's issuer-identification support. Once available, you can narrow the allowlist to the exact callback shown in ChatGPT's management page. See [OpenAI authentication](https://developers.openai.com/plugins/build/auth).

Localhost and loopback redirects are unnecessary for ChatGPT. The default 15-minute access token lifetime is suitable; the grant session duration determines when you must authorize again. A 24-hour grant works but requires more frequent reauthorization.

Until Access is configured, the Worker rejects tool requests because `ctx.access` is missing.

See [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/) for the current dashboard instructions.

## Deploy with configuration

Prepare the Matter token:

| Setting | Value |
| --- | --- |
| `MATTER_API_TOKEN` | Your Matter API token. |
| `READ_ONLY` | Optional: `true` exposes only the eight read tools. Defaults to `false`. |

The only required secret is `MATTER_API_TOKEN`, declared in `wrangler.jsonc`. Wrangler checks its presence during deployment; token validity and the Access policy still require a connection test.

### From your terminal

Clone this repository, run `npm ci --ignore-scripts`, and choose the Worker name in `wrangler.jsonc`. Copy the example file and fill in the token locally:

```sh
cp .dev.vars.example .dev.vars
npx wrangler login
npm run deploy -- --secrets-file .dev.vars
```

Edit `.dev.vars` before running the deploy command. It is ignored by Git. The command uploads the configuration and code together; there is no preliminary deployment of an unconfigured MCP server.

Subsequent code-only deployments can use `npm run deploy`, preserving existing secrets.

### Deploy to Cloudflare button

Use the Deploy button at the top of this README. Cloudflare builds and deploys the project in its hosted build environment. Enter `MATTER_API_TOKEN` when prompted. Keep the default deploy command `npx wrangler deploy`; no separate build command is required.

If deployment fails with **required secrets have not been set: MATTER_API_TOKEN**, open the Worker's **Settings → Variables and Secrets**, add `MATTER_API_TOKEN` as a **Secret**, save/deploy the setting, and retry the build. A build environment variable is not a runtime Worker secret.

Then complete [Cloudflare Access setup](#set-up-cloudflare-access). The button does not create the Access policy or configure Managed OAuth.
See [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) and [deploying secrets with code](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code).

## Connect ChatGPT

Register `https://<worker-host>/mcp` as an OAuth connection in ChatGPT Developer Mode. Accept the trust acknowledgement, create the app, and sign in through Cloudflare Access. Call `account` and `items_list` to verify the connection.

Managed OAuth advertises dynamic client registration, so a compatible client can obtain its own Client ID. If ChatGPT instead asks for a Client ID, check that Managed OAuth was saved and that OAuth discovery is reachable, then reopen the creation form. Do not enter the Matter token or Cloudflare AUD as an OAuth Client ID. The exact recovery for this onboarding error has not yet been documented.

The Worker requires Cloudflare's trusted `ctx.access` context. Access handles authentication and authorization; the Worker does not parse authentication headers or validate JWTs itself. No team domain or audience setting is required in the Worker.

The Access policy that applies to the incoming URL is the authorization boundary. Keep that policy restricted to your own email. All users permitted by it share the configured Matter account. Protect any additional hostname or preview URL with the same intended policy before using it.

This assumes direct invocation of the Worker through Access. Access context is not forwarded through Service Bindings or a Static Assets router; those are not part of this deployment. See [Access context](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#read-authenticated-user-identity-with-ctxaccess).

The maintainer reported a successful deployed ChatGPT connection on September 23, 2026. The Deploy button path and onboarding on a fresh Cloudflare account have not yet been independently verified.

## Behavior and limitations

See [the design](docs/design.md) for all 17 tools and their arguments. Names follow the CLI, and results preserve Matter's JSON. Successful operations with no response body return `{"ok":true}`.

- Callers advance pagination using cursors. Like the CLI, `tags_list` exposes only the first page.
- `items_list.favorite=false` leaves the favorite filter unset. `items_update.favorite=false` clears the favorite.
- Writes are not retried automatically. A failed connection can leave a write's outcome unknown.
- The CLI module is an internal interface, not a supported SDK contract.
- Dependencies use normal npm resolution and a lockfile. No custom updater runs. Deployed code changes only after another build and deployment.
- The upstream client does not accept an AbortSignal. Custom request deadlines and cancellation are not implemented.
- Containers are not required. Whether the Worker fits the free tier needs CPU measurement. Matter and Access requirements apply separately.

## Local authentication

By default, local requests have no Access context and are rejected. For local testing, temporarily add this standard Wrangler setting:

```json
{
  "access": {
    "dev": {
      "aud": "local-test"
    }
  }
}
```

Run `npm run dev` with a local Matter token. This simulates authentication only in local development; it does not create a production Access application. Remove the setting when finished. Local tool calls still use the real Matter account; use `READ_ONLY=true` in the Wrangler vars for read-only testing.

## Verification

Type checking, five tests, and a Wrangler dry-run pass with the Access-context implementation. Tests cover missing Access context, forged authentication headers, authenticated HTTP calls, Origin validation, read-only mode, false/zero updates, and 204/429 responses.

Unit tests supply a mock Access context; they do not verify Cloudflare's live authentication. A deployed ChatGPT connection has been reported by the maintainer. Full live tool coverage, deployed CPU usage, token refresh, and reproducibility of the onboarding flow remain unverified.

The CLI's terminal UI dependencies remain in the installation tree, including packages reported by npm audit. They are not imported by the Worker. The Worker uses only the CLI's API client and version module.

## Feedback

Small fixes and reproducible bug reports are welcome in [GitHub Issues](https://github.com/pal4de/matter-reader-mcp/issues). Include the failing step, error message, and client used. Remove tokens, account details, and private reading content before posting.

This project aims to stay a thin wrapper around the official Matter CLI client. There is no hosted service or support SLA.
