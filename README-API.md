# AI Mentor K-12 API (server-side)

This Worker powers the dedicated AI Mentor tutor for mathematics grades 1–12.

## What it does
- Calls the OpenAI Responses API from the server, not from the browser.
- Keeps the API key in a Cloudflare Worker secret named `OPENAI_API_KEY`.
- Supports text and image inputs (JPG/PNG/WEBP).
- Adapts explanations to a selected grade, or infers the grade when set to auto.
- Includes age-appropriate math-only instructions and input/output moderation.
- Does not request response storage (`store: false`).

## Before enabling it for students
A parent, school administrator, or other responsible adult must own/manage the API and Cloudflare accounts, set spending limits, review privacy settings, and configure the secrets. Do not paste keys into source code, the browser, or chat.

## Required GitHub Actions secrets
In the repository, open Settings → Secrets and variables → Actions → New repository secret and add:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `OPENAI_API_KEY`

Then open Actions → Deploy AI Mentor K-12 API → Run workflow. The Worker will be deployed as `ai-mentor-toan10-api` on the Cloudflare account's `workers.dev` subdomain.

Copy the deployed Worker URL from the Wrangler deployment log and add `/api/tutor` to it. In the website, open Gia sư AI → AI Mentor riêng · Toán 1–12, paste that HTTPS endpoint, then save.

The health endpoint is `/health`.

## Security notes
- The Worker allows the GitHub Pages origin for this project only.
- It validates payload size and image MIME type, caps history and output length, and applies a best-effort per-isolate request limit. Add a Cloudflare WAF rate-limiting rule for POST `/api/tutor` before broad public use.
- Do not collect students' names, school names, addresses, phone numbers, account credentials, or other personal information.
- The model can still make mistakes; students should verify results with teachers/textbooks.
- OpenAI moderation and model responses are sent to the configured provider for processing. Review the provider's current data and safety terms before enabling for students under 18.
