# Matter Reader MCP

A self-hosted MCP server for using your Matter account from ChatGPT Developer Mode, running on Cloudflare Workers. Each deployment connects to one Matter account.

The server imports the API client from the official [Matter CLI](https://github.com/getmatterapp/matter-cli). It does not start a CLI process or container. The Streamable HTTP endpoint is `/mcp`.

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

Cloudflare **Workers** runs the server. Cloudflare **Access** controls who may connect and handles OAuth. Prepare Access before deploying the server:

1. Create a Cloudflare account and set up a Zero Trust organization.
2. Choose the Worker name and its final hostname, for example `matter-reader-mcp.<your-workers-subdomain>.workers.dev`. Find or configure your Workers subdomain in the Cloudflare dashboard. Keep this name when deploying.
3. In Zero Trust, create a **self-hosted Access application** for that hostname. Use a hostname destination so it can be configured before the Worker exists. Add an Allow policy for your own email address.
4. Enable **Managed OAuth** in the application's advanced settings. A browser-only Access login is not sufficient for an MCP client.


See [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/) for the current dashboard instructions.

## Deploy with configuration

Prepare the Matter token:

| Setting | Value |
| --- | --- |
| `MATTER_API_TOKEN` | Your Matter API token. |
| `READ_ONLY` | Optional: `true` exposes only the eight read tools. Defaults to `false`. |

The only required secret is `MATTER_API_TOKEN`, declared in `wrangler.jsonc`. Wrangler checks its presence during deployment; token validity and the Access policy still require a connection test.

### From your terminal

Set the Worker name in `wrangler.jsonc` to the name chosen above. Copy the example file and fill in the token locally:

```sh
cp .dev.vars.example .dev.vars
npx wrangler login
npm run deploy -- --secrets-file .dev.vars
```

Edit `.dev.vars` before running the deploy command. It is ignored by Git. The command uploads the configuration and code together; there is no preliminary deployment of an unconfigured MCP server.

Subsequent code-only deployments can use `npm run deploy`, preserving existing secrets.

### Deploy to Cloudflare button

Once a public repository URL is available, a Deploy to Cloudflare button can be added. Its standard setup form reads secret names from `.dev.vars.example` and descriptions from `package.json`. Enter your Matter token and keep the hostname consistent with the Access application.

The button does not provision the Access application or its policy. Complete that setup first. No custom setup service, GitHub Actions workflow, or infrastructure automation is required.

See [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) and [deploying secrets with code](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code).

## Connect ChatGPT

Register `https://<worker-host>/mcp` as an OAuth connection in ChatGPT Developer Mode. If redirect registration is required, use the exact URL shown by ChatGPT. Call `account` and `items_list` to verify the connection.

The Worker requires Cloudflare's trusted `ctx.access` context. Access handles authentication and authorization; the Worker does not parse authentication headers or validate JWTs itself. No team domain or audience setting is required in the Worker.

The Access policy that applies to the incoming URL is the authorization boundary. Keep that policy restricted to your own email. All users permitted by it share the configured Matter account. Protect any additional hostname or preview URL with the same intended policy before using it.

This assumes direct invocation of the Worker through Access. Access context is not forwarded through Service Bindings or a Static Assets router; those are not part of this deployment. See [Access context](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#read-authenticated-user-identity-with-ctxaccess).

The end-to-end ChatGPT and Access Managed OAuth connection has not yet been tested on a deployed instance.

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

Unit tests supply a mock Access context; they do not verify Cloudflare's live authentication. Live Matter operations, deployed CPU usage, and the complete ChatGPT/Managed OAuth onboarding flow remain unverified.

The CLI's terminal UI dependencies remain in the installation tree, including packages reported by npm audit. They are not imported by the Worker. The Worker uses only the CLI's API client and version module.
