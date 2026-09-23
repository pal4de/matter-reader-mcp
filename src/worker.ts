import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server";

export interface Env {
  MATTER_API_TOKEN: string;
  READ_ONLY?: string;
}
export default {
  async fetch(request: Request, env: Env, ctx: Pick<ExecutionContext, "access">): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") return new Response("Not found", {status:404});
    if (!ctx.access) return new Response("Unauthorized", {status:401});
    if (!env.MATTER_API_TOKEN)
      return new Response("Server configuration incomplete", {status:503});
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin && origin !== "https://chatgpt.com")
      return new Response("Forbidden origin", {status:403});
    if (request.method !== "POST") return new Response("Method not allowed", {status:405, headers:{Allow:"POST"}});
    const server = createServer(env.MATTER_API_TOKEN, env.READ_ONLY === "true");
    const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined, enableJsonResponse:true});
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    if (request.headers.get("mcp-method") === "server/discover") {
      try {
        console.log("MCP discovery response", {
          status: response.status,
          protocolVersion: request.headers.get("mcp-protocol-version"),
          rayId: request.headers.get("cf-ray"),
          body: await response.clone().text()
        });
      } catch {
        // Diagnostics must not replace an otherwise valid MCP response.
        console.warn("Unable to log MCP discovery response");
      }
    }
    return response;
  }
};
