# Estate Manager — Project Context

## Overview
Estate Manager is a specialized financial tracking application designed to manage the complexities of estate finance. It allows multiple users (e.g., family members, estate executors) to log transactions using natural language, view segmented ledgers, and query the financial history using AI.

## Technology Stack
- **Frontend**: React + Vite
- **Styling**: Vanilla CSS (Premium Dark Mode / Glassmorphism)
- **Icons**: Lucide-React
- **Backend/Database**: Supabase (PostgreSQL with RLS)
- **AI Engine**: Google Generative AI (Gemini & Gemma Dual-Tier). 
  - **NLP Parser**: Now uses the **Insight Tier (Gemini)** for maximum reliability and formatting adherence.
  - **Query Engine**: Uses Gemma (Protocol) for filter spec generation and Gemini (Insight) for data analysis.

## Core Features
1. **NLP Logging**: Log transactions via a single text area (e.g., "Paid 20k to Rikant for Staff Salary"). The Protocol Tier parses these into structured data.
2. **Dual-Tier Querying**:
   - **Protocol Tier (Gemma)**: Analyzes the question to generate a precise filter spec (dates, categories, amounts).
   - **Insight Tier (Gemini)**: Provides natural language answers based on the filtered transaction data.
3. **Virtual Ledgers**: Individual views for "Rakant" and "Rikant" which normalize internal transfers into Income/Expense entries for that specific user, alongside a global "Estate" view.
4. **AI Audit**: A server-side utility (`audit_categories.cjs`) that reviews transaction history to suggest categorization improvements.
5. **Interactive Help**: An AI-powered search for the internal User Guide.

## Environment & Secrets
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key for frontend use.
- `VITE_GEMINI_API_KEY`: Global API key for Gemini/Gemma waterfalls.

## Deployment Status
- Hosted on Vercel.
- Database hosted on Supabase.
- AI logic runs client-side for immediate feedback, with server-side auditing.

## Recent Fixes
- **JSON Parser Hardening**: Implemented an ultra-robust brace-counting extraction logic in `cleanJson` to handle AI responses that include markdown clutter or duplicated JSON blocks (common in Gemma 4).
- **NLP Waterfall Alignment**: Switched the NLP logging function from Gemma to the Gemini Insight Tier to resolve "Unexpected token" errors and improve parsing accuracy (e.g., handling "2.36L" correctly).

## Pending Tasks
- [ ] Implement robust error handling for 429 Quota Exceeded errors.
- [ ] Add visualization (charts) for monthly estate trends.
- [ ] Restore/Optimize Protocol Tier for NLP once Gemma 4 stability improves.
