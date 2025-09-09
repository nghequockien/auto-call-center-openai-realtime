// ragtools.js
import { AzureKeyCredential } from "@azure/core-auth";
import { SearchClient } from "@azure/search-documents";
import { DefaultAzureCredential } from "@azure/identity";
import { Tool, ToolResult, ToolResultDirection } from "./rtmt.js";

/**
 * Build a SearchClient using either API key or AAD.
 */
function createSearchClient({ endpoint, indexName, apiKey }) {
  if (apiKey) {
    return new SearchClient(
      endpoint,
      indexName,
      new AzureKeyCredential(apiKey),
      {
        userAgentOptions: { userAgentPrefix: "RTMiddleTier" },
      }
    );
  }
  const cred = new DefaultAzureCredential();
  // Warm up Entra token (optional)
  // NOTE: JS SearchClient will request tokens on demand.
  return new SearchClient(endpoint, indexName, cred, {
    userAgentOptions: { userAgentPrefix: "RTMiddleTier" },
  });
}

const searchToolSchema = {
  type: "function",
  name: "search",
  description:
    "Search the knowledge base. The KB is in Japanese; translate if needed. " +
    "Results appear as a source name in square brackets followed by text, ending with '-----' per result.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const groundingToolSchema = {
  type: "function",
  name: "report_grounding",
  description:
    "Report which KB sources (citations) were used. Sources appear in square brackets before each KB passage.",
  parameters: {
    type: "object",
    properties: {
      sources: {
        type: "array",
        items: { type: "string" },
        description:
          "List of source names from the last statement actually used; omit unused ones.",
      },
    },
    required: ["sources"],
    additionalProperties: false,
  },
};

/**
 * Hybrid + optional vector query using the JS SDK.
 * - vectorQueries expects an array with { text, kNearestNeighbors, fields } for vectorizable text.
 *   (See @azure/search-documents JS samples for vector search.) [5](https://learn.microsoft.com/en-us/azure/search/samples-javascript)
 */
async function searchToolImpl(
  searchClient,
  {
    semanticConfiguration,
    identifierField,
    contentField,
    embeddingField,
    useVectorQuery,
  },
  args
) {
  const vectorQueries = [];
  if (useVectorQuery) {
    vectorQueries.push({
      text: args.query,
      kNearestNeighbors: 50,
      fields: embeddingField,
    });
  }

  const searchOptions = {
    top: 5,
    select: [identifierField, contentField],
    vectorQueries: vectorQueries.length ? vectorQueries : undefined,
  };

  if (semanticConfiguration) {
    searchOptions.queryType = "semantic";
    searchOptions.semanticSearchOptions = {
      configurationName: semanticConfiguration,
    };
  } else {
    searchOptions.queryType = "simple";
  }

  const results = await searchClient.search(args.query, searchOptions);

  let text = "";
  for await (const r of results.results) {
    const doc = r.document;
    console.log(doc);
    text += ` [${doc[identifierField]}]: ${doc[contentField]}\n-----\n`;
  }

  return new ToolResult(text, ToolResultDirection.TO_SERVER);
}

/**
 * Fetch source chunks for grounding (citations).
 * The Python sample uses a search over the identifier field (keyword analyzer) rather than filter. [3](https://github.com/Azure-Samples/aisearch-openai-rag-audio/blob/main/app/backend/ragtools.py)
 */
async function reportGroundingToolImpl(
  searchClient,
  { identifierField, titleField, contentField },
  args
) {
  const safe = (s) => /^[a-zA-Z0-9_\=\-]+$/.test(s);
  const sources = (args.sources || []).filter(safe);
  if (!sources.length) {
    return new ToolResult({ sources: [] }, ToolResultDirection.TO_CLIENT);
  }

  const list = sources.join(" OR ");

  const results = await searchClient.search(list, {
    queryType: "full",
    searchFields: [identifierField],
    select: [identifierField, titleField, contentField],
    top: sources.length,
  });

  const docs = [];
  for await (const r of results.results) {
    const d = r.document;
    docs.push({
      chunk_id: d[identifierField],
      title: d[titleField],
      chunk: d[contentField],
    });
  }

  return new ToolResult({ sources: docs }, ToolResultDirection.TO_CLIENT);
}

/**
 * Attach both tools to the RT middle tier instance.
 */
export function attachRagTools(rtmt, config) {
  const searchClient = createSearchClient({
    endpoint: config.searchEndpoint,
    indexName: config.searchIndex,
    apiKey: config.searchApiKey,
  });

  rtmt.attachTool(
    "search",
    new Tool(
      (args) => searchToolImpl(searchClient, config, args),
      searchToolSchema
    )
  );

  rtmt.attachTool(
    "report_grounding",
    new Tool(
      (args) => reportGroundingToolImpl(searchClient, config, args),
      groundingToolSchema
    )
  );
}
