const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const env = fs.readFileSync('.env.local', 'utf8');
const apiKey = env.match(/VITE_GEMINI_API_KEY=(.*)/)[1].trim();
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
    let logStr = "";
    const models = [
        'gemini-3.1-flash-lite-preview',
        'gemini-3-flash-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
    ];
    for(const m of models) {
        try {
            logStr += "Trying " + m + "\n";
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("hello");
            logStr += "Success with " + m + "\n\n";
        } catch(e) {
            logStr += "Failed with " + m + ": " + e.message + "\n\n";
        }
    }
    fs.writeFileSync('logs.txt', logStr);
}
run();
