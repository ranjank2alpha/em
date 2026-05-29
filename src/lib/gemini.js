import { GoogleGenerativeAI } from '@google/generative-ai';

// Global API Key (Supports ONLY 2.5 and 2.0+ models)
const GLOBAL_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GLOBAL_GEMINI_API_KEY);

const cleanJson = (text) => { try { const t = text.trim(); JSON.parse(t); return t; } catch (e) {} const blocks = []; let count = 0; let start = -1; for (let i = 0; i < text.length; i++) { if (text[i] === "{" || text[i] === "[") { if (count === 0) start = i; count++; } else if (text[i] === "}" || text[i] === "]") { count--; if (count === 0 && start !== -1) { blocks.push(text.substring(start, i + 1)); } } } for (let i = blocks.length - 1; i >= 0; i--) { try { JSON.parse(blocks[i]); return blocks[i]; } catch (e) {} } return text.replace(/```json|```/g, "").trim(); };

/**
 * Dual-Tier Waterfall for Gemini (Insight) and Gemma (Protocol) calls.
 * @param {string} prompt - The text prompt to send
 * @param {string} tier - "insight" for analysis | "protocol" for logic/workflow
 * @param {string} responseMimeType - "text/plain" or "application/json"
 */
async function callDualTierAI(prompt, tier = "protocol", responseMimeType = "text/plain") {
  const chains = {
    // INSIGHT TIER: Deep analysis, pattern recognition, long-context summaries
    "insight": [
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ],
    // PROTOCOL TIER: Fast logic, decision trees, workflow orchestration
    "protocol": [
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it'
    ]
  };
  
  const waterfall = chains[tier] || chains["protocol"];
  let lastError = null;
  
  for (const modelName of waterfall) {
    try {
      console.log(`AI Tier [${tier}]: Attempting ${modelName}...`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: { responseMimeType }
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error(`Safety filter blocked the response for ${modelName}`);
      }
      
      console.log(`AI Tier [${tier}]: Success with ${modelName}`);
      return response.text();
    } catch (error) {
      console.error(`${modelName} failed | Status: ${error.status} | Error: ${error.message}`);
      lastError = error;
      if (error.message.includes('400') || error.message.toLowerCase().includes('api key')) {
        break;
      }
    }
  }
  throw lastError || new Error(`All models in [${tier}] tier failed.`);
}

// ─── Parse NLP Transaction (Protocol Tier) ───────────────────────────────
export async function parseTransactionWithNLP(text, categories = []) {
  const categoryList = categories.length > 0
    ? categories.map(c => c.name).join('", "')
    : 'SaaS & Software", "AI & LLM APIs", "Professional Services", "Salaries & Payroll", "Travel & Lodging", "Client Entertainment", "Marketing & Ads", "Workspace & Co-working", "Internet & Telecom", "Hardware & Gadgets", "Internal Transfer", "Reimbursement';

  const prompt = `
You are a financial parsing assistant. The user is managing a business expense ledger.
Extract the following details from the text:
- amount: The monetary value (number only, no currency symbols).
- type: Either "income" or "expense" (outgoing money is expense, incoming is income).
- category: You MUST first try to fit the transaction into one of the existing categories listed below.
  Only create a brand-new category if you are at least 99% certain the transaction cannot 
  reasonably belong to ANY existing category — even loosely. When in doubt, pick the closest match.
  Existing categories: "${categoryList}".
  If and only if you are certain none fit, invent a concise new category (2-3 words max).
- is_new_category: true if you created a brand-new category not in the existing list, false otherwise.
- recipient: If this is an "Internal Transfer", the name of the recipient (e.g., "ranjan" or "ashish"). Otherwise null.
- description: A brief summary of the transaction.
- date: The date of the transaction in YYYY-MM-DD format (assume today's date is ${new Date().toLocaleDateString('en-CA')} if not specified).

Text: "${text}"

Respond ONLY with a valid JSON object.
`;

  try {
    const rawText = await callDualTierAI(prompt, "insight", "application/json");
    const data = JSON.parse(cleanJson(rawText));
    if (!data.amount || !data.type) throw new Error("Invalid parse result");
    return data;
  } catch (error) {
    console.error("NLP Parse failed:", error);
    throw error;
  }
}

// ─── Search User Guide (Protocol Tier) ───────────────────────────────────
export async function searchUserGuide(query, guideData) {
  const prompt = `
Search the following User Guide for the most relevant section matching the user's question.

User Question: "${query}"

User Guide Sections:
${JSON.stringify(guideData, null, 2)}

Respond ONLY with a valid JSON object matching this structure:
{
  "sectionId": "the_id_of_the_section",
  "reason": "Brief explanation of why this matches"
}
If no section matches clearly, return { "sectionId": null, "reason": "No match found" }.
`;

  try {
    const rawText = await callDualTierAI(prompt, "insight", "application/json");
    return JSON.parse(cleanJson(rawText));
  } catch (error) {
    console.error("Guide Search failed:", error);
    return { sectionId: null, reason: "Error searching guide" };
  }
}

// ─── Step 1: Generate Filter Spec (Protocol Tier — Gemma) ─────────────────
// Takes the user's natural language question and returns a structured filter
// spec the frontend can execute against Supabase. Sets fallback:true for
// complex queries that need the full dataset.
export async function generateFilterSpec(question, categories) {
  const categoryList = categories.map(c => c.name).join(', ');

  const prompt = `
You are a database query planner for a business expense ledger.

DATABASE SCHEMA:
Table: ledger
  - id: uuid
  - user_id: uuid (linked to profiles)
  - amount: numeric (INR)
  - type: "income" | "expense"
  - category: text — one of: ${categoryList}
  - description: text
  - transaction_date: date (YYYY-MM-DD)
  - transfer_to: uuid (for internal transfers between the two users)

Table: profiles
  - Known users: "Ranjan" (user 1), "Ashish" (user 2)

USER QUESTION: "${question}"

Your task: Determine if this question can be answered with a simple filtered fetch from the ledger,
or if it needs complex computation (GROUP BY, time-series, cross-user comparison, ranking, etc.).

If SIMPLE (single filter set): return fallback: false with the filters.
If COMPLEX (aggregation, ranking, comparison, "which month", "trend", etc.): return fallback: true.

Also detect if the user wants to download/export data: set download: true and suggest a filename.

Respond ONLY with valid JSON:
{
  "fallback": false,
  "filters": {
    "type": "income" | "expense" | null,
    "category": "exact category name" | null,
    "categories": ["cat1", "cat2"] | null,
    "user_name": "ranjan" | "ashish" | null,
    "transfer_to_name": "ranjan" | "ashish" | null,
    "date_from": "YYYY-MM-DD" | null,
    "date_to": "YYYY-MM-DD" | null,
    "amount_min": number | null,
    "amount_max": number | null
  },
  "download": false,
  "download_filename": null
}
`;

  try {
    const raw = await callDualTierAI(prompt, "protocol", "application/json");
    return JSON.parse(cleanJson(raw));
  } catch (error) {
    console.error("Filter spec generation failed:", error);
    // On failure, fall back to full dataset
    return { fallback: true, filters: {}, download: false, download_filename: null };
  }
}

// ─── Step 2: Answer Ledger Query (Insight Tier — Gemini) ──────────────────
// Takes the filtered data + original question and returns a natural language answer.
export async function answerLedgerQuery(question, data) {
  const prompt = `
You are a business expense assistant. Answer the user's question using ONLY the
transaction data provided below. Do not make up figures or infer data that is not present.
Format currency values in Indian Rupees (₹). Be concise and factual.
If the data is empty, say so clearly.

USER QUESTION: "${question}"

TRANSACTION DATA (${data.length} records):
${JSON.stringify(data.map(d => ({
  date: d.transaction_date,
  type: d.type,
  category: d.category,
  amount: d.amount,
  description: d.description,
  logged_by: d.profiles?.name || d.user_id,
  recipient: d.recipient?.name || d.transfer_to || null
})), null, 2)}

Provide a clear, helpful answer based strictly on the data above.
`;

  try {
    return await callDualTierAI(prompt, "insight", "text/plain");
  } catch (error) {
    console.error("Ledger query answer failed:", error);
    throw error;
  }
}
