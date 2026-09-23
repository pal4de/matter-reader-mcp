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

## 1. Deploy the Worker and set the Matter secret

Prepare the Matter token:

| Setting | Value |
| --- | --- |
| `MATTER_API_TOKEN` | Your Matter API token. |
| `READ_ONLY` | Optional: `true` exposes only the eight read tools. Defaults to `false`. |

The only required secret is `MATTER_API_TOKEN`, declared in `wrangler.jsonc`. Wrangler checks its presence during deployment; token validity and the Access policy still require a connection test.

### Deploy to Cloudflare button

Use the Deploy button at the top of this README. Cloudflare builds and deploys the project in its hosted build environment. Enter `MATTER_API_TOKEN` when prompted. Keep the default deploy command `npx wrangler deploy`; no separate build command is required.

If deployment fails with **required secrets have not been set: MATTER_API_TOKEN**, open the Worker's **Settings → Variables and Secrets**, add `MATTER_API_TOKEN` as a **Secret**, save/deploy the setting, and retry the build. A build environment variable is not a runtime Worker secret.

Then complete [Cloudflare Access setup](#2-protect-all-traffic-with-cloudflare-access). The button does not create the Access policy or configure Managed OAuth.
See [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) and [deploying secrets with code](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code).

### From your terminal

Clone this repository, run `npm ci --ignore-scripts`, and choose the Worker name in `wrangler.jsonc`. Copy the example file and fill in the token locally:

```sh
cp .dev.vars.example .dev.vars
npx wrangler login
npm run deploy -- --secrets-file .dev.vars
```

Edit `.dev.vars` before running the deploy command. It is ignored by Git. The command uploads the configuration and code together; there is no preliminary deployment of an unconfigured MCP server.

Subsequent code-only deployments can use `npm run deploy`, preserving existing secrets.


## 2. Protect all traffic with Cloudflare Access

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

## 3. Connect ChatGPT

Register `https://<worker-host>/mcp` as an OAuth connection in ChatGPT Developer Mode. Accept the trust acknowledgement, create the app, and sign in through Cloudflare Access.

Managed OAuth advertises dynamic client registration, so a compatible client can obtain its own Client ID. If ChatGPT instead asks for a Client ID, check that Managed OAuth was saved and that OAuth discovery is reachable, then reopen the creation form. Do not enter the Matter token or Cloudflare AUD as an OAuth Client ID. The exact recovery for this onboarding error has not yet been documented.

The Worker requires Cloudflare's trusted `ctx.access` context. Access handles authentication and authorization; the Worker does not parse authentication headers or validate JWTs itself. No team domain or audience setting is required in the Worker.

The Access policy that applies to the incoming URL is the authorization boundary. Keep that policy restricted to your own email. All users permitted by it share the configured Matter account. Protect any additional hostname or preview URL with the same intended policy before using it.

This assumes direct invocation of the Worker through Access. Access context is not forwarded through Service Bindings or a Static Assets router; those are not part of this deployment. See [Access context](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#read-authenticated-user-identity-with-ctxaccess).

The maintainer reported a successful deployed ChatGPT connection on September 23, 2026. The Deploy button path and onboarding on a fresh Cloudflare account have not yet been independently verified.

## 4. Verify the first read

Ask the client to call `account`, then `items_list` with `limit=1`. Confirm the account is yours and the list request succeeds. This verifies Matter access as well as MCP discovery; no write is needed.

## Troubleshooting

| Symptom | What to check | Expected result |
| --- | --- | --- |
| Deployment says `MATTER_API_TOKEN` is missing | Worker Settings → Variables and Secrets. Store it as a runtime **Secret**, then retry the build. | Deployment succeeds; this does not yet prove the token is valid. |
| ChatGPT asks for an OAuth Client ID | Save Managed OAuth, verify discovery, then reopen the connection form. Do not use the Matter token or Access AUD as the Client ID. | The authorization server metadata advertises `registration_endpoint`. The maintainer eventually connected after several attempts; the exact cause and recovery are unknown. |
| Authentication opens an ordinary browser login or the client cannot discover OAuth | Ensure Managed OAuth is enabled on the Access application protecting this exact hostname. | An unauthenticated MCP request receives a Bearer challenge with a `resource_metadata` URL. |
| Access denies sign-in | Check All traffic, the permitted identity, and the client's allowed OAuth redirect URI. | Your intended identity is admitted by Access. |
| Sign-in succeeds but tools do not appear | Use the exact `/mcp` URL, inspect the client's discovery error and Worker logs, and reconnect after saving configuration changes. | `tools/list` returns 17 tools, or eight with `READ_ONLY=true`. Authentication success alone does not prove discovery succeeded. |
| Opening `/mcp` in a browser shows 405 | Browsers send GET; this server accepts MCP POST requests. | Connect using an MCP client. An authenticated GET returning 405 is expected. |
| `Forbidden origin` | A supplied Origin must match the Worker origin or `https://chatgpt.com`. Other client origins are not currently allowed. | Use a compatible server-side client; do not disable Origin validation to work around this. |
| `Server configuration incomplete` | Check that the deployed Worker has a nonempty `MATTER_API_TOKEN` secret. | The MCP transport can initialize. |
| Tools appear but Matter calls fail | Inspect the tool error status/message; verify the Matter token and account API access. | `account` and `items_list` succeed. A Matter 429 means the upstream rate limit was reached. |

Discovery can be inspected without credentials:

```sh
curl -i https://<worker-host>/mcp
```

Follow the `resource_metadata` URL in `WWW-Authenticate`, then the metadata's `authorization_servers` URL to its `/.well-known/oauth-authorization-server` document. This checks discovery only, not successful authentication. Never post tokens or private tool results in an issue. Do not automatically repeat failed writes; first check whether the change already happened.

## Following the official CLI

The MCP server imports `MatterAPI` directly from `matter-cli/src/api.ts`; it does not copy the HTTP client or run the CLI executable. API request behavior and response parsing therefore come from the official implementation. Tool schemas, names, and CLI-to-MCP argument mapping live in this repository.

`package.json` points to the official GitHub repository; `package-lock.json` records the resolved commit. `npm ci` installs that commit, including during Cloudflare builds. Rebuilding alone does not fetch a newer CLI. The CLI executable's self-updater is not invoked.

To intentionally refresh the client from the upstream default branch:

```sh
npm install matter-cli@github:getmatterapp/matter-cli --ignore-scripts
npm run check
npm test
npm run build
```

Review the lockfile and upstream changes, commit the updated lockfile, then deploy (or let your configured Cloudflare Git integration deploy the commit). An upstream API-client fix reaches the Worker after this update and deployment. A new CLI command still needs an explicit MCP tool mapping. The imported file is an internal interface, so breaking changes may require a small adapter change here. No custom updater or scheduled workflow is involved.

## Other clients and authentication

The endpoint uses standard Streamable HTTP. ChatGPT is the only client with a maintainer-reported successful connection so far; the alternatives below are configuration paths, not tested compatibility claims.

- **Interactive clients with OAuth:** reuse Access Managed OAuth. Add the client's documented callback URI to the Access application's allowlist. Claude Code supports remote HTTP and OAuth; local callback flows may require enabling localhost/loopback redirects. See [Claude Code MCP](https://code.claude.com/docs/en/mcp).
- **Headless clients with custom HTTP headers:** create a Cloudflare Access Service Token and add a **Service Auth** policy for that token to the same protected application. Send `CF-Access-Client-Id` and `CF-Access-Client-Secret` on each request. Access validates them and supplies `ctx.access`; the Worker needs no additional authentication implementation. Keep credentials in the client's secret configuration. These credentials are distinct from the Matter API token and the Cloudflare deployment API token.

See [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) and [Worker Access context](https://developers.cloudflare.com/workers/configuration/cloudflare-access/). All admitted clients access the same configured Matter account and the same deployment-wide read-only setting. Service tokens do not add per-client tool permissions.

The existing Origin check accepts requests without an Origin header, the Worker's own origin, and `https://chatgpt.com`. A client sending another Origin will be rejected even if authentication succeeds. Browser CORS and additional origins have not been implemented or verified. There is no local stdio transport.

## Behavior and limitations

See [the design](docs/design.md) for all 17 tools and their arguments. Names follow the CLI, and results preserve Matter's JSON. Successful operations with no response body return `{"ok":true}`.

- Callers advance pagination using cursors. Like the CLI, `tags_list` exposes only the first page.
- `items_list.favorite=false` leaves the favorite filter unset. `items_update.favorite=false` clears the favorite.
- Writes are not retried automatically. A failed connection can leave a write's outcome unknown.
- The CLI module is an internal interface, not a supported SDK contract.
- Dependencies use normal npm resolution and a lockfile. No custom updater runs. Deployed code changes only after another build and deployment.
- The upstream client does not accept an AbortSignal. Custom request deadlines and cancellation are not implemented.
- Containers are not required. Whether the Worker fits the free tier needs CPU measurement. Matter and Access requirements apply separately.

## Local checks

Use Node.js 22 or later.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
```

The CLI's other dependencies are installed, but only referenced modules are bundled into the Worker. Its terminal UI installation scripts are not needed.

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

## License

[MIT](LICENSE). Dependencies retain their respective licenses.
