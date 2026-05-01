// Audit script — checks all existing ledger entries against the current category list
// AI Tier: INSIGHT (Gemini) — multi-record analysis and pattern recognition

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(
  'https://gwcbjhcufulfhbuphqtf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3Y2JqaGN1ZnVsZmhidXBocXRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMTE5NiwiZXhwIjoyMDg5Njk3MTk2fQ.HnrgcvjUfNsZpZUWoK5t_uHNhvdEjL3jAwN_654sKD0'
);

const genAI = new GoogleGenerativeAI('AIzaSyCmwn2taMBfaj3x3R4dYHL7CkTGbBJvN3o');

const cleanJson = (text) => { try { const t = text.trim(); JSON.parse(t); return t; } catch (e) {} const blocks = []; let count = 0; let start = -1; for (let i = 0; i < text.length; i++) { if (text[i] === "{" || text[i] === "[") { if (count === 0) start = i; count++; } else if (text[i] === "}" || text[i] === "]") { count--; if (count === 0 && start !== -1) { blocks.push(text.substring(start, i + 1)); } } } for (let i = blocks.length - 1; i >= 0; i--) { try { JSON.parse(blocks[i]); return blocks[i]; } catch (e) {} } return text.replace(/```json|```/g, "").trim(); };

async function callInsightTier(prompt) {
  const models = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  for (const modelName of models) {
    try {
      console.log(`[Insight] Trying ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      if (!response.candidates?.length) throw new Error('Blocked by safety filter');
      console.log(`[Insight] Success with ${modelName}`);
      return response.text();
    } catch (err) {
      console.error(`${modelName} failed: ${err.message}`);
      if (err.message.includes('400') || err.message.toLowerCase().includes('api key')) break;
    }
  }
  throw new Error('All Insight tier models failed');
}

async function runAudit() {
  // 1. Fetch current categories
  const { data: cats, error: catErr } = await supabase.from('categories').select('name').order('name');
  if (catErr) throw catErr;
  const categoryList = cats.map(c => c.name);
  console.log(`\nLoaded ${categoryList.length} categories:`, categoryList.join(', '));

  // 2. Fetch all ledger entries
  const { data: ledger, error: ledErr } = await supabase
    .from('ledger')
    .select('id, category, description, raw_text, type, amount')
    .order('transaction_date', { ascending: false });
  if (ledErr) throw ledErr;
  console.log(`\nLoaded ${ledger.length} ledger entries. Running audit...\n`);

  // 3. Send to Gemini for audit
  const prompt = `
You are an estate finance auditor. You are reviewing a ledger of transactions.

Current valid categories: ${JSON.stringify(categoryList)}

For each transaction below, assess:
1. Is the current category a reasonable fit for the description?
2. Would a DIFFERENT existing category be clearly better?
3. Does the description suggest a genuinely new category is needed that doesn't exist yet?

Apply a HIGH bar for suggesting new categories — only flag if you are 99% confident none of the existing ones fit.

Transactions:
${JSON.stringify(ledger.map(e => ({
  id: e.id,
  current_category: e.category,
  description: e.description || '',
  raw_text: e.raw_text || '',
  type: e.type,
  amount: e.amount
})), null, 2)}

Respond with a JSON array. Each item must have:
{
  "id": "transaction_id",
  "current_category": "...",
  "status": "ok" | "recategorize" | "new_category_needed",
  "suggested_category": "suggested category name or null if ok",
  "reason": "brief explanation"
}
Only include entries where status is NOT "ok" — skip entries that are fine.
If all entries are fine, return an empty array [].
`;

  const raw = await callInsightTier(prompt);
  const flags = JSON.parse(cleanJson(raw));

  console.log('====================================================');
  console.log('AUDIT RESULTS');
  console.log('====================================================');

  if (flags.length === 0) {
    console.log('✅ All entries look good — no recategorization needed.');
  } else {
    console.log(`⚠️  ${flags.length} entries flagged:\n`);
    flags.forEach((f, i) => {
      const entry = ledger.find(e => e.id === f.id);
      console.log(`--- Entry ${i + 1} ---`);
      console.log(`ID:          ${f.id}`);
      console.log(`Description: ${entry?.description || entry?.raw_text || 'N/A'}`);
      console.log(`Current:     ${f.current_category}`);
      console.log(`Status:      ${f.status}`);
      console.log(`Suggested:   ${f.suggested_category || 'N/A'}`);
      console.log(`Reason:      ${f.reason}`);
      console.log('');
    });
  }
}

runAudit().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
