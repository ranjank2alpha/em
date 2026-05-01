const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const env = fs.readFileSync('.env.local', 'utf8');
const apiKey = env.match(/VITE_GEMINI_API_KEY=(.*)/)[1].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function testWaterfall(text) {
  console.log(`\n🔍 Testing WATERFALL for: "${text}"`);
  
  const prompt = `
  Extract these details as JSON from: "${text}"
  - amount (number)
  - type (income/expense)
  - category (one word)
  - description (short)
  - date (YYYY-MM-DD, assume today is 2026-03-22)
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
      console.log(`  Trying ${modelName}...`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const output = (await result.response).text();
      console.log(`  ✅ SUCCESS with ${modelName}!`);
      console.log(`  Output: ${output.trim()}`);
      return;
    } catch (e) {
      console.warn(`  ❌ FAILED ${modelName}: ${e.message}`);
    }
  }
}

testWaterfall("Paid 14814 for Mom and R-Dad's flight on 21st March 2026 from Patna-Delhi");
