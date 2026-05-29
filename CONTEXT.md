# K2Alpha Expense Manager — Project Context

## Overview
K2Alpha Expense Manager is a specialized, secure financial tracking application designed to manage business expenses. It allows partners (Ranjan and Ashish) to log transactions using natural language, view segmented ledgers, and query the financial history using AI.

## Technology Stack
- **Frontend**: React + Vite
- **Styling**: Vanilla CSS (Premium Dark Mode customized with the `k2alpha.ai` color palette)
- **Icons**: Lucide-React
- **Backend/Database**: Supabase (PostgreSQL with RLS and schema-only database setup)
- **AI Engine**: Google Generative AI (Gemini & Gemma Dual-Tier). 
  - **NLP Parser**: Uses the **Insight Tier (Gemini)** for maximum reliability and formatting adherence.
  - **Query Engine**: Uses Gemma (Protocol) for filter spec generation and Gemini (Insight) for data analysis.

## Core Features
1. **NLP Logging**: Log expenses via a single text area (e.g., "Paid 20k to Ashish for Salaries"). The Insight Tier parses these into structured data.
2. **Dual-Tier Querying**:
   - **Protocol Tier (Gemma)**: Analyzes natural language questions to generate a precise filter spec (dates, categories, amounts).
   - **Insight Tier (Gemini)**: Provides natural language answers based on the filtered transaction data.
3. **Virtual Ledgers**: Individual views for "Ranjan" and "Ashish" which normalize internal transfers into Income/Expense entries for that specific user, alongside a global "K2Alpha" combined ledger.
4. **AI Audit**: A server-side utility (`audit_categories.cjs`) that reviews transaction history to suggest categorization improvements.
5. **Interactive Help**: An AI-powered search for the internal User Guide.

## Environment & Secrets
- `VITE_SUPABASE_URL`: Supabase project URL (`https://fwxjlyrlifypwohpwfri.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key for client authentication.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin privileges.
- `VITE_GEMINI_API_KEY`: Custom Gemini API key for AI engine waterfalls.

## Deployment Status
- Hosted on Vercel: **`https://em.k2alpha.ai`** (and aliased to **`https://k2em.vercel.app`**).
- Database hosted on Supabase (RLS enabled).
- DNS configured via Cloudflare (Proxy turned off for Vercel SSL validation).

## Recent Upgrades & Fixes
- **Rebranding & Domain Migration**: Successfully migrated from old estate ledger to K2Alpha Expense Tracker. Hosted on custom subdomain `em.k2alpha.ai`.
- **Identity Transition**: Reconfigured logins and dropdown selectors to **`ranjan@k2alpha.ai`** and **`ashish.karan@k2alpha.ai`**.
- **Branding Color Palette**: Integrated `k2alpha.ai` exact theme variables (space dark `#080C14`, sky blue `#38BDF8`, and amber gold `#C9A84C`) with sky blue focused glows.
- **Email Parser Hardening**: Corrected the username extractor bug. Replaced `session.user.email.split('.')[0]` with `session.user.email.split('@')[0].split('.')[0]` so that double-part emails like `ashish.karan@k2alpha.ai` resolve to `'ashish'` perfectly.
- **Taxonomy Restructuring**: Swapped the old estate categorization with a modern 12-category business expense taxonomy (SaaS, AI APIs, Payroll, workspace, etc.).

## Pending Tasks
- [ ] Implement robust error handling for 429 Quota Exceeded errors.
- [ ] Add visualization (charts) for monthly expense trends.
- [ ] Restore/Optimize Protocol Tier for NLP once Gemma 4 stability improves.
