// server.js
import "dotenv/config";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyFormBody from "@fastify/formbody";
import { RTMiddleTier } from "./rtmt.js";
import { attachRagTools } from "./ragtools.js";
import { request } from "http";
import { parse } from "url";

const app = Fastify({ logger: true });
await app.register(fastifyWebsocket);
await app.register(fastifyFormBody);

const cfg = {
  // Azure OpenAI Realtime
  openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT, // wss://<*.openai.azure.com>
  openaiDeployment: process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT,
  openaiVoice: process.env.AZURE_OPENAI_REALTIME_VOICE_CHOICE || "alloy",
  openaiApiKey: process.env.AZURE_OPENAI_API_KEY || null,
  openaiApiVersion:
    process.env.AZURE_OPENAI_REALTIME_API_VERSION || "2024-10-01-preview",

  // Azure AI Search
  searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT,
  searchIndex: process.env.AZURE_SEARCH_INDEX,
  searchApiKey: process.env.AZURE_SEARCH_API_KEY || null,

  // RAG fields/config
  identifierField: process.env.AZURE_SEARCH_IDENTIFIER_FIELD || "ID",
  titleField: process.env.AZURE_SEARCH_TITLE_FIELD || "title",
  contentField: process.env.AZURE_SEARCH_CONTENT_FIELD || "chunk",
  embeddingField: process.env.AZURE_SEARCH_EMBEDDING_FIELD || "embedding",
  semanticConfiguration:
    process.env.AZURE_SEARCH_SEMANTIC_CONFIGURATION || null,
  useVectorQuery:
    (process.env.AZURE_SEARCH_USE_VECTOR_QUERY || "true").toLowerCase() ===
    "true",

  systemMessage:
    process.env.AZURE_OPENAI_SYSTEM_MESSAGE || "You are a helpful assistant.",
};

// Build credentials object for RTMiddleTier
const credentials = cfg.openaiApiKey
  ? { apiKey: cfg.openaiApiKey }
  : { aadCred: undefined }; // RTMiddleTier will create DefaultAzureCredential()

const rtmt = new RTMiddleTier({
  endpoint: cfg.openaiEndpoint,
  deployment: cfg.openaiDeployment,
  credentials,
  voiceChoice: cfg.openaiVoice,
  apiVersion: cfg.openaiApiVersion,
  systemMessage: cfg.systemMessage,
});

const authenticate = (request) => {
  const { token, id } = parse(request.url, true).query;
  console.log("Authenticating request with token:", token, "id:", id);
  // In a production app, validate the token here (e.g., check signature, expiry, etc.)
  if (!token || !id) {
    return false;
  }
  return true;
};

// Attach the RAG tools to the middle tier
attachRagTools(rtmt, cfg);

// Health check
app.get("/api/health", async () => ({ status: "ok" }));

// WebSocket endpoint (browser connects here)
app.get("/realtime", { websocket: true }, (connection, req) => {
  app.log.info("Client connected for realtime");
  // Note: in a production app, you should authenticate/authorize the user here
  // and pass an identity
  if (!authenticate(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const clientSocket = connection;
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  console.log("Request headers:", headers);

  rtmt.connect(clientSocket, headers);
});

const port = process.env.PORT || 8765;
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`VoiceRAG Node backend listening on http://localhost:${port}`);
});
