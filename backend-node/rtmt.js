// rtmt.js
import WebSocket from "ws";
import {
  getBearerTokenProvider,
  DefaultAzureCredential,
} from "@azure/identity";

export class ToolResultDirection {
  static TO_SERVER = 1;
  static TO_CLIENT = 2;
}

export class ToolResult {
  constructor(text, destination) {
    this.text = text;
    this.destination = destination;
  }
  toText() {
    if (this.text == null) return "";
    return typeof this.text === "string"
      ? this.text
      : JSON.stringify(this.text);
  }
}

export class Tool {
  constructor(target, schema) {
    this.target = target; // async (args) => ToolResult
    this.schema = schema; // JSON schema describing the tool
  }
}

class RTToolCall {
  constructor(toolCallId, previousId) {
    this.toolCallId = toolCallId;
    this.previousId = previousId;
  }
}

/**
 * RTMiddleTier: forwards WS frames and runs server-side "tools" on function calls.
 * Mirrors the Python app/backend/rtmt.py logic.  [2](https://github.com/Azure-Samples/aisearch-openai-rag-audio/blob/main/app/backend/rtmt.py)
 */
export class RTMiddleTier {
  constructor({
    endpoint,
    deployment,
    credentials,
    voiceChoice,
    apiVersion,
    systemMessage,
  }) {
    this.endpoint = endpoint; // wss://<aoai>.openai.azure.com
    this.deployment = deployment;
    this.voiceChoice = voiceChoice || null;
    this.apiVersion = apiVersion || "2024-10-01-preview";
    this.tools = {}; // name -> Tool
    this._toolsPending = new Map();
    this.systemMessage = systemMessage || "You are a helpful assistant.";

    if (credentials && credentials.apiKey) {
      this._apiKey = credentials.apiKey;
      this._tokenProvider = null;
    } else {
      // Use AAD (DefaultAzureCredential)
      this._apiKey = null;
      const cred = credentials?.aadCred || new DefaultAzureCredential();
      this._tokenProvider = getBearerTokenProvider(
        cred,
        "https://cognitiveservices.azure.com/.default"
      ); // returns a function that yields a fresh token string [4](https://devblogs.microsoft.com/azure-sdk/introducing-azure-openai-realtime-api-support-in-javascript/)
      // warm-up
      void this._tokenProvider();
    }
  }

  attachTool(name, tool) {
    this.tools[name] = tool;
  }

  /**
   * Connects to Azure OpenAI Realtime WS and pipes messages both ways.
   * `clientSocket` is the Fastify WS for the browser client.
   */
  connect(clientSocket, requestHeaders = {}) {
    const url = new URL(
      "/openai/realtime",
      this.endpoint.replace(/^http/i, "ws")
    );
    url.searchParams.set("api-version", this.apiVersion);
    url.searchParams.set("deployment", this.deployment);

    const headers = {};
    if (requestHeaders["x-ms-client-request-id"]) {
      headers["x-ms-client-request-id"] =
        requestHeaders["x-ms-client-request-id"];
    }

    const openServerSocket = async () => {
      if (this._apiKey) {
        headers["api-key"] = this._apiKey;
      } else if (this._tokenProvider) {
        headers["Authorization"] = `Bearer ${await this._tokenProvider()}`;
      }

      const serverSocket = new WebSocket(url.toString(), { headers });

      // Forward: client -> server
      clientSocket.on("message", async (data) => {
        if (typeof data !== "string") data = data.toString("utf8");
        // Prcoess for getting session update
        const message = JSON.parse(data);
        if (message?.type === "session.getting") {
          const instructionsMsg = await this._processGettingMessageInstruction(
            data
          );
          serverSocket.send(instructionsMsg);

          //const playMsg = await this._processPlayGettingMessage(data);
          //serverSocket.send(playMsg);
        } else {
          const newMsg = await this._processMessageToServer(data);
          if (newMsg) serverSocket.send(newMsg);
        }
      });

      clientSocket.on("close", () => {
        try {
          serverSocket.close();
        } catch {}
      });

      // Forward: server -> client
      serverSocket.on("message", async (data) => {
        if (typeof data !== "string") data = data.toString("utf8");
        const newMsg = await this._processMessageToClient(
          data,
          clientSocket,
          serverSocket
        );
        if (newMsg) clientSocket.send(newMsg);
      });

      serverSocket.on("close", () => {
        try {
          clientSocket.close();
        } catch {}
      });

      serverSocket.on("error", (e) => {
        console.error("Realtime server socket error:", e);
        try {
          clientSocket.close();
        } catch {}
      });
    };

    openServerSocket().catch((err) => {
      console.error("Failed to open realtime server socket:", err);
      try {
        clientSocket.close();
      } catch {}
    });
  }

  async _processMessageToClient(msgText, clientSocket, serverSocket) {
    let message;
    try {
      message = JSON.parse(msgText);
    } catch {
      return msgText;
    }

    let updated = message;

    console.log(`_processMessageToClient ${message?.type}`);

    switch (message?.type) {
      case "session.created": {
        // Hide server-only config from client; set voice; disable tool exposure on the client.
        const session = message.session ?? {};
        session.instructions = "";
        session.tools = [];
        session.voice = this.voiceChoice || session.voice;
        session.tool_choice = "none";
        session.max_response_output_tokens = null;
        updated = { ...message, session };
        break;
      }
      case "response.output_item.added":
      case "response.function_call_arguments.delta":
      case "response.function_call_arguments.done":
        // Hide function-call plumbing from client.
        if (message?.item?.type === "function_call") return null;
        updated = message;
        break;
      case "conversation.item.created": {
        const item = message?.item;
        if (item?.type === "function_call") {
          const callId = item.call_id;
          if (!this._toolsPending.has(callId)) {
            this._toolsPending.set(
              callId,
              new RTToolCall(callId, message.previous_item_id)
            );
          }
          return null; // don’t leak function_call to client
        }
        if (item?.type === "function_call_output") {
          return null; // internal
        }
        break;
      }

      case "response.output_item.done": {
        const item = message?.item;
        console.log(`Output item done of type: ${item?.type}`);
        if (item?.type === "function_call") {
          // Invoke the matching tool and send function_call_output back to Azure OpenAI.
          const tool = this.tools[item.name];
          if (tool) {
            const args = JSON.parse(item.arguments || "{}");
            // Call the tool
            const result = await tool.target(args);

            // send function_call_output back to the model
            serverSocket.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: item.call_id,
                  output:
                    result.destination === ToolResultDirection.TO_SERVER
                      ? result.toText()
                      : "",
                },
              })
            );

            if (result.destination === ToolResultDirection.TO_CLIENT) {
              const toolCall = this._toolsPending.get(item.call_id);
              clientSocket.send(
                JSON.stringify({
                  type: "extension.middle_tier_tool_response",
                  previous_item_id: toolCall?.previousId,
                  tool_name: item.name,
                  tool_result: result.toText(),
                })
              );
            }
          }
          return null; // don’t forward raw function_call to client
        }
        break;
      }

      case "response.done": {
        if (this._toolsPending.size > 0) {
          this._toolsPending.clear();
          // Ask the server for another response after tools resolved
          serverSocket.send(JSON.stringify({ type: "response.create" }));
        }
        // Also strip function_call items from response.output if present (like Python)
        if (message.response?.output) {
          const filtered = message.response.output.filter(
            (o) => o.type !== "function_call"
          );
          if (filtered.length !== message.response.output.length) {
            updated = {
              ...message,
              response: { ...message.response, output: filtered },
            };
          }
        }
        break;
      }

      default:
        break;
    }

    return JSON.stringify(updated);
  }

  async _processMessageToServer(msgText) {
    let message;
    try {
      message = JSON.parse(msgText);
    } catch {
      return msgText;
    }

    console.log(`_processMessageToServer ${message?.type}`);

    switch (message?.type) {
      case "session.update": {
        const session = message.session ?? {};
        // Server enforces tools + auto tool_choice when tools exist
        session.instructions = this.systemMessage;
        session.tool_choice =
          Object.keys(this.tools).length > 0 ? "auto" : "none";
        session.tools = Object.values(this.tools).map((t) => t.schema);
        session.modalities = ["text", "audio"];
        session.input_audio_transcription = { model: "whisper-1" };
        if (this.voiceChoice) session.voice = this.voiceChoice;
        console.log(JSON.stringify({ ...message, session }));
        return JSON.stringify({ ...message, session });
      }
      default:
        return msgText;
    }
  }
  async _processGettingMessageInstruction(msgText) {
    let message;
    try {
      message = JSON.parse(msgText);
      const gettingmessage = {};
      //gettingmessage.type = "session.update";
      gettingmessage.type = "response.create";

      const response = {};
      response.instructions =
        `あなたは日本語で対応するコールセンターのアシスタントです。\n` +
        `以下の指示に従ってください：\n` +
        `1. 最初に、次の挨拶文を一度だけ日本語で丁寧に話してください：\n` +
        `   「お待たせいたしました、${message.user_info.name} 様。\n` +
        `    本日は ${message.intent} に関するお問い合わせですね。\n` +
        `    よろしければ、詳細についてお伺いしてもよろしいでしょうか。」\n` +
        `2. 挨拶の後は、会話を続けて詳細を聞き取り、適切にサポートしてください。`;

      console.log(JSON.stringify({ ...gettingmessage, response }));
      return JSON.stringify({ ...gettingmessage, response });
    } catch {
      return msgText;
    }
  }
  async _processPlayGettingMessage(msgText) {
    let message;
    try {
      message = JSON.parse(msgText);
      const gettingmessage = {};
      gettingmessage.type = "response.create";

      const response = {};
      response.instructions =
        `customer_name: ${message.user_info.name}\n` +
        `intent: ${message.intent}\n`;
      response.modalities = ["audio", "text"];

      console.log(JSON.stringify({ ...gettingmessage, response }));
      return JSON.stringify({ ...gettingmessage, response });
    } catch {
      return msgText;
    }
  }
}
