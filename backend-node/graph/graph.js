import { StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { classifyIntent } from "../agents/router.js";
import { nameChangeAgent } from "../agents/nameChange.js";
import { bankAccountChangeAgent } from "../agents/bankAccountChange.js";
import { insuranceProductAgent } from "../agents/insuranceProduct.js";

// TypeScript types removed for JS version
// GraphState is now just a plain object

function addMessage(state, message) {
  return { ...state, messages: [...state.messages, message] };
}

async function routerNode(state) {
  const last = state.messages[state.messages.length - 1];
  const userText = last?.content?.toString() ?? "";
  const intent = await classifyIntent(userText);
  return { intent };
}

async function nameChangeNode(state) {
  const history = state.messages.map((m) => `${m._getType()}: ${m.content}`);
  const question = state.messages[state.messages.length - 1].content;
  const { answer, citations } = await nameChangeAgent(question, history);
  return { answer, citations };
}

async function bankNode(state) {
  const history = state.messages.map((m) => `${m._getType()}: ${m.content}`);
  const question = state.messages[state.messages.length - 1].content;
  const { answer, citations } = await bankAccountChangeAgent(question, history);
  return { answer, citations };
}

async function insuranceNode(state) {
  const history = state.messages.map((m) => `${m._getType()}: ${m.content}`);
  const question = state.messages[state.messages.length - 1].content;
  const { answer, citations } = await insuranceProductAgent(question, history);
  return { answer, citations };
}

function respondNode(state) {
  const answer = state.answer ?? "I'm not sure yet. Could you clarify?";
  return {
    messages: [...state.messages, new AIMessage(answer)],
  };
}

export function buildGraph() {
  const graph = new StateGraph({
    channels: {
      messages: { value: (x, y) => [...(x ?? []), ...(y ?? [])], default: [] },
      intent: null,
      answer: null,
      citations: null,
    },
  });

  graph.addNode("router", routerNode);
  graph.addNode("name", nameChangeNode);
  graph.addNode("bank", bankNode);
  graph.addNode("insurance", insuranceNode);
  graph.addNode("respond", respondNode);

  graph.addEdge(START, "router");

  graph.addConditionalEdges("router", async (state) => {
    switch (state.intent) {
      case "name_change":
        return "name";
      case "bank_account_change":
        return "bank";
      case "insurance_product":
        return "insurance";
      default:
        return "respond";
    }
  });

  graph.addEdge("name", "respond");
  graph.addEdge("bank", "respond");
  graph.addEdge("insurance", "respond");
  graph.addEdge("respond", END);

  return graph.compile();
}
