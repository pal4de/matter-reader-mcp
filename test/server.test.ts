import { afterEach, expect, test, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server";
import worker from "../src/worker";

afterEach(() => vi.unstubAllGlobals());
async function connect(readOnly = false) {
  const server = createServer("secret",readOnly);
  const client = new Client({name:"test",version:"1"});
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return {client, close: async () => {await client.close(); await server.close();}};
}
test("all 17 tools and read-only filtering", async () => {
  for (const readOnly of [false,true]) {
    const s = await connect(readOnly);
    const {tools} = await s.client.listTools();
    expect(tools).toHaveLength(readOnly ? 8 : 17);
    if(readOnly) {
      expect(tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
      expect((await s.client.callTool({name:"items_delete",arguments:{id:"itm_1"}})).isError).toBe(true);
    }
    await s.close();
  }
});
test("preserves false/zero updates, rejects unsafe ids and empty updates",async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"itm_1"})));
  vi.stubGlobal("fetch",fetch);
  const s = await connect();
  await s.client.callTool({name:"items_update",arguments:{id:"itm_1",favorite:false,progress:0}});
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({is_favorite:false,reading_progress:0});
  expect((await s.client.callTool({name:"items_delete",arguments:{id:"../me"}})).isError).toBe(true);
  expect((await s.client.callTool({name:"items_update",arguments:{id:"itm_1"}})).isError).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  await s.close();
});
test("204 responses and upstream errors become MCP results",async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null,{status:204}))
    .mockResolvedValueOnce(new Response(JSON.stringify({error:{code:"rate_limited",message:"Slow down"}}),{status:429}));
  vi.stubGlobal("fetch",fetch);
  const s = await connect();
  expect((await s.client.callTool({name:"items_delete",arguments:{id:"itm_1"}})).structuredContent).toEqual({ok:true});
  const result = await s.client.callTool({name:"account",arguments:{}});
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).toContain("rate_limited");
  expect(fetch).toHaveBeenCalledTimes(2);
  await s.close();
});
test("requests without Access context fail even with forged authentication headers", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const headers of [new Headers(), new Headers({"Cf-Access-Jwt-Assertion":"forged", Authorization:"Bearer forged"})]) {
    const request = new Request("https://example.com/mcp", {method:"POST", headers});
    expect((await worker.fetch(request, {MATTER_API_TOKEN:"secret"}, {})).status).toBe(401);
  }
  expect(fetch).not.toHaveBeenCalled();
});

const accessContext = {
  access: {aud:"test-app", getIdentity: async () => { throw new Error("Identity lookup is not needed"); }}
} satisfies Pick<ExecutionContext, "access">;

test("Access-authenticated HTTP requests can call Matter; other origins remain blocked", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({object:"account", id:"account_1"})));
  vi.stubGlobal("fetch", fetch);
  const request = (origin?: string) => new Request("https://example.com/mcp", {
    method:"POST",
    headers:{"Content-Type":"application/json", Accept:"application/json, text/event-stream", ...(origin ? {Origin:origin} : {})},
    body:JSON.stringify({jsonrpc:"2.0", id:1, method:"tools/call", params:{name:"account", arguments:{}}})
  });
  const env = {MATTER_API_TOKEN:"secret"};
  const response = await worker.fetch(request(), env, accessContext);
  expect(response.status).toBe(200);
  expect((await response.json() as {result:{structuredContent:unknown}}).result.structuredContent)
    .toEqual({object:"account", id:"account_1"});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("https://api.getmatter.com/public/v1/me");
  expect((await worker.fetch(request("https://evil.example"), env, accessContext)).status).toBe(403);
  expect((await worker.fetch(request(), {MATTER_API_TOKEN:""}, accessContext)).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(1);
});
