import { z } from "zod";
import { chatModel } from "../llm/azureOpenAI.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const IntentSchema = z.object({
  intent: z.enum([
    "name_change",
    "bank_account_change",
    "insurance_product",
    "unknown",
  ]),
  rationale: z.string().optional(),
});

const ROUTER_SYSTEM = `
You are the router. Classify the user's first utterance into one of:
- name_change
- bank_account_change
- insurance_product
If you are unsure, use "unknown".
Return ONLY a JSON object with keys: intent, rationale.`;

const ROUTER_PROMPT = ChatPromptTemplate.fromMessages([
  ["system", ROUTER_SYSTEM],
  ["user", "{utterance}"],
]);

export async function classifyIntent(utterance) {
  const model = chatModel();
  // Strongly nudge JSON output
  const prompt = ROUTER_PROMPT;
  const res = await prompt.pipe(model).invoke({ utterance });
  const text = String(res.content);

  try {
    const parsed = JSON.parse(text);
    return IntentSchema.parse(parsed).intent;
  } catch {
    // fallback: naive keyword routing
    const u = utterance.toLowerCase();
    if (u.includes("name") || u.includes("rename") || u.includes("married"))
      return "name_change";
    if (
      u.includes("bank") ||
      u.includes("account") ||
      u.includes("iban") ||
      u.includes("payment")
    )
      return "bank_account_change";
    if (
      u.includes("insurance") ||
      u.includes("plan") ||
      u.includes("coverage") ||
      u.includes("premium")
    )
      return "insurance_product";
    return "unknown";
  }
}
