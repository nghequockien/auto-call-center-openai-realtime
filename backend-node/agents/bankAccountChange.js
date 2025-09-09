import { chatModel } from "../llm/azureOpenAI.js";
import { makeRagPrompt } from "../knowledge/prompts/system_base.js";
import { BANK_ACCOUNT_CHANGE_INSTRUCTION } from "../knowledge/prompts/bankAccountChange_prompt.js";
import { retrieveDocs } from "../knowledge/retrievers/azureAISearchRetriever.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { formatContext } from "./format.js";

export async function bankAccountChangeAgent(question, history) {
  const index = process.env.AZURE_SEARCH_INDEX_BANK;
  const docs = await retrieveDocs(index, question, 6);
  const { text: context, citations } = formatContext(docs);

  const prompt = ChatPromptTemplate.fromTemplate(
    makeRagPrompt(BANK_ACCOUNT_CHANGE_INSTRUCTION)
  );
  const model = chatModel();
  const chain = prompt.pipe(model);

  const res = await chain.invoke({
    context,
    history: history.join("\n"),
    question,
  });

  return {
    answer: res.content,
    citations,
  };
}
