const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const env = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = env.match(/VITE_GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch[1].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function testInsight(modelName, text) {
  const categories = 'Funeral", "Legal", "Utilities", "Maintenance", "Sale", "Bank", "Internal Transfer", "Travel", "Staff Salary", "Dad Biz payments", "Mom payment';
  const prompt = `
You are a financial parsing assistant. The user is managing an estate ledger.
Extract the following details from the text:
- amount: The monetary value (number only, no currency symbols).
- type: Either "income" or "expense" (outgoing money is expense, incoming is income).
- category: You MUST first try to fit the transaction into one of the existing categories listed below.
  Only create a brand-new category if you are at least 99% certain the transaction cannot 
  reasonably belong to ANY existing category — even loosely. When in doubt, pick the closest match.
  Existing categories: "${categories}".
  If and only if you are certain none fit, invent a concise new category (2-3 words max).
- is_new_category: true if you created a brand-new category not in the existing list, false otherwise.
- recipient: If this is an "Internal Transfer", the name of the recipient (e.g., "rakant" or "rikant"). Otherwise null.
- description: A brief summary of the transaction.
- date: The date of the transaction in YYYY-MM-DD format (assume today's date is 2026-04-27 if not specified).

Text: "${text}"

Respond ONLY with a valid JSON object.
`;

  console.log(`\n--- [INSIGHT TIER] Testing Model: ${modelName} ---`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const raw = response.text();
    console.log("Raw Response:");
    console.log(raw);
  } catch (e) {
    console.error(`❌ ${modelName} FAILED:`, e.message);
  }
}

const input = "Paid 2.36L to CA Maitin to settle all audit dues for EEPL and EDPL";
const insightModels = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

async function run() {
  for (const m of insightModels) {
    await testInsight(m, input);
  }
}

run();
