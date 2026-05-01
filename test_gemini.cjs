const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const env = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = env.match(/VITE_GEMINI_API_KEY=(.*)/);
if (!apiKeyMatch) {
  console.error("VITE_GEMINI_API_KEY not found in .env.local");
  process.exit(1);
}
const apiKey = apiKeyMatch[1].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  const text = 'Paid $500 for the funeral home yesterday';
  const prompt = `
  Extract these details from: "${text}"
  - amount (number)
...
  Respond only in a valid JSON object.
  `;

  const fallbackChain = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];

  for (const modelName of fallbackChain) {
    try {
      console.log(`Trying ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      console.log(`✅ GEMINI PARSED RESULT (${modelName}):`);
      console.log(response.text());
      return;
    } catch (e) {
      console.error(`❌ ${modelName} Error:`, e.message);
    }
  }
  console.error("All models failed.");
}

run();
