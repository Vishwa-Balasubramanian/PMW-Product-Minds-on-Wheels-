// Create or update the PMW conversational agent on ElevenLabs from the same prompt and tools as the OpenAI agent.
// Run: node --env-file=.env.local scripts/eleven-agent.ts   (prints ELEVENLABS_AGENT_ID; safe to re-run)
import { VOICE_PROMPT, VOICE_TOOLS, VOICE_TOOL_SCHEMAS } from "../lib/voice/config.ts";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Set ELEVENLABS_API_KEY (e.g. in .env.local).");
const API = "https://api.elevenlabs.io/v1/convai";
const AGENT_NAME = "PMW voice (Product Minds on Wheels)";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "xi-api-key": KEY!, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 1500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type Schema = Record<string, unknown>;
// ElevenLabs tool schemas: every property needs a description; keep only the keywords it understands.
function prop(name: string, p: Schema): Schema {
  const out: Schema = { type: p.type, description: (p.description as string) ?? name.replace(/_/g, " ") };
  if (p.enum) out.enum = p.enum;
  if (p.type === "array" && p.items) out.items = prop(`${name} item`, p.items as Schema);
  if (p.type === "object") {
    out.properties = Object.fromEntries(Object.entries((p.properties ?? {}) as Record<string, Schema>).map(([k, v]) => [k, prop(k, v)]));
    out.required = p.required ?? [];
  }
  return out;
}

const existingTools = await call<{ tools: { id: string; tool_config: { name: string } }[] }>("GET", "/tools");
const toolIds: string[] = [];
for (const name of VOICE_TOOLS) {
  const s = VOICE_TOOL_SCHEMAS[name];
  const tool_config = {
    type: "client", name, description: s.description, expects_response: true, response_timeout_secs: 20,
    parameters: { type: "object", properties: Object.fromEntries(Object.entries(s.properties as Record<string, Schema>).map(([k, v]) => [k, prop(k, v)])), required: s.required },
  };
  const found = existingTools.tools.find((t) => t.tool_config.name === name);
  const r = found
    ? await call<{ id: string }>("PATCH", `/tools/${found.id}`, { tool_config })
    : await call<{ id: string }>("POST", "/tools", { tool_config });
  toolIds.push(found?.id ?? r.id);
  console.log(`${found ? "updated" : "created"} tool ${name}`);
}

const conversation_config = {
  agent: {
    first_message: "Hi, PMW here. What would you like to look at?",
    language: "en",
    prompt: { prompt: VOICE_PROMPT, llm: process.env.ELEVENLABS_AGENT_LLM || "gemini-2.5-flash", temperature: 0.2, tool_ids: toolIds },
  },
  tts: { model_id: "eleven_flash_v2", voice_id: process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB" },
  turn: { turn_eagerness: "eager", speculative_turn: true },
  conversation: { max_duration_seconds: 600 },
};
// Private agent: the browser can only connect with a short-lived token minted by our server.
const platform_settings = { auth: { enable_auth: true } };

const agents = await call<{ agents: { agent_id: string; name: string }[] }>("GET", `/agents?search=${encodeURIComponent("PMW voice")}`);
const agent = agents.agents.find((a) => a.name === AGENT_NAME);
if (agent) {
  await call("PATCH", `/agents/${agent.agent_id}`, { name: AGENT_NAME, conversation_config, platform_settings });
  console.log(`updated agent\nELEVENLABS_AGENT_ID=${agent.agent_id}`);
} else {
  const created = await call<{ agent_id: string }>("POST", "/agents/create", { name: AGENT_NAME, conversation_config, platform_settings });
  console.log(`created agent\nELEVENLABS_AGENT_ID=${created.agent_id}`);
}
