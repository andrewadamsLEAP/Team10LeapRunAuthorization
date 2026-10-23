# Site-help chatbot

## Local setup

Run `npm install`, then `npm run start:dev` from this application directory.
The existing database and JWT settings are still required by the main app;
the chat module itself does not use either. Existing authentication is unchanged.
No extra npm dependencies are required: the Gemini adapter uses Node's native fetch.

Add server-only variables to your ignored `.env` (never to Angular environment files):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | Google AI Studio key. Required only for Gemini. Never commit or share it. |
| `CHAT_PROVIDER` | `gemini` when a key exists, otherwise `faq` | Set `faq` to disable every external AI request, even if a key exists. |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Replaceable model ID; verify availability for your project. |

Restart Nest after changing environment variables. Existing `PORT` defaults to 3000.
For Angular, set the existing `FE_PORT` setting to the full allowed origin,
such as `http://localhost:4200` (not just a port number).
Container deployments must inject these server variables explicitly; localhost
and file paths inside a container refer to that container, not the developer host.

## Angular contract

`POST http://localhost:3000/chat/message`, Content-Type: application/json.
This is public site help: authentication is not required. Do not attach tokens
or account data to chat requests. Render `reply` as text (Angular interpolation),
not raw HTML. Do not log message bodies in Angular, proxies, or analytics.

Request:

```json
{ "message": "How do I create an account?" }
```

Successful response (HTTP 200):

```json
{
  "reply": "Use the registration form to create your account...",
  "sources": ["account-setup"],
  "fallback": false,
  "mode": "gemini"
}
```

The example reply is illustrative; generated text varies. `sources` contains
approved FAQ IDs, not model-generated citations. `fallback: true` means local
FAQ output, unsupported-question guidance, or a privacy/safety refusal was used.
`mode` is `faq` or `gemini`; the same JSON contract is used for both.
Unknown questions return HTTP 200 with no sources and:
"I don’t know the answer to that yet. I can help with registration, signing in, password requirements, holdings, orders, transactions, and basic site troubleshooting. Please ask about one of those, or contact the site support team."

Validation errors are HTTP 400 with a safe NestJS message. Only `message` is
accepted; reject extra fields, empty input, over 1000 UTF-16 code units or 4000
UTF-8 bytes, and invalid control characters. The default Express JSON body limit
also applies before controller validation. HTTP 429 includes `Retry-After`.
Provider errors, quotas, missing keys, invalid model IDs, timeouts and blocked or
malformed output return local FAQ answers, never raw provider errors.

## Knowledge approval and privacy

The source document is `src/chat/site-help.ts`. Only `approved: true` entries can
be returned or sent to Gemini. Entries cover account requirements verified in
NestJS plus general explanations of holdings, orders, transactions, balances,
password recovery, browser troubleshooting and support. General guidance is
allowed without pretending to know exact site workflows. Exact Angular routes,
menu names, filters, recovery features, and order rules remain unverified and
are explicitly qualified. Review actual UI steps with the site owner before
adding precise navigation instructions.
Add locally matched terms when adding topics. Supply the team's real support
contact in approved content when available; none has been invented.

Topic matching uses local keyword/phrase matching, not an AI search or a
guarantee of semantic understanding. Multiple matched help topics can be combined;
unknown topics fall back to support. Ordinary numbers, email addresses, and
mentions of balances are not automatic refusals; they are never sent externally.
Explicit credential disclosures receive a privacy warning. Gemini generates a
conversational rewrite of matched public answers;
it does NOT receive the original user message or conversation history. Follow-up
questions must name their topic again. This privacy-first design intentionally
limits open-ended conversation. Do not add raw user text to provider prompts.

Neither chat service nor provider has database, account, order, or trading tools.
No passwords, JWTs, balances, holdings, transaction records, request headers, or
user message text are included in AI payloads. Sensitive/advice requests detected
locally get a safety response. Detection is defense-in-depth, not a guarantee;
privacy is enforced by the provider's public-FAQ-only input boundary. No chat
bodies or provider exceptions are logged or retained by this module.

System instructions constrain generation but are NOT a guarantee of factuality.
Generated text can still hallucinate: use FAQ-only mode if exact approved wording
is mandatory, and review output before production. No unapproved topic is sent.

## Abuse controls and deployment

- 10 requests per IP per 60-second fixed window (includes invalid requests).
- Bounded local rate-limit map, 10,000 IPs, expired entries removed on requests.
- At most 30 provider calls per minute and 4 concurrent per Nest process.
- 8-second provider timeout, 300 output tokens, no retries, no paid search/tools.
- Unknown/draft topics never consume AI quota.

These limits are in-memory and reset on restart. Before multiple replicas or
public production deployment, use shared Redis/gateway rate limits and a project
budget. Shared NAT IPs share a limit. Forwarded headers are not trusted by
default; configure only known proxy hops explicitly in Express or enforce limits
at your trusted ingress. CORS is not authentication or an abuse-control boundary.

## Gemini limits and costs

Checked against Google's documentation on 2026-10-23. The selected
`gemini-2.5-flash-lite` model lists free-tier input/output at no charge where
available. Paid text input is listed at $0.10 per million tokens and output at
$0.40 per million tokens. Model availability, rates and terms can change.
Free-tier content may be used to improve Google's products; paid-tier terms
differ. Only public approved help content leaves this application.

Quotas are per Google project (not per API key): requests/minute, tokens/minute
and requests/day. Check your actual limits in AI Studio; no fixed free quota is
promised here. Billing-enabled usage can incur costs. The local limiter is not
a billing cap across replicas or other apps. Configure project budgets/quotas.

- Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Quotas: https://ai.google.dev/gemini-api/docs/rate-limits
- Active project limits: https://aistudio.google.com/rate-limit
- Terms: https://ai.google.dev/gemini-api/terms

## Testing and replacement

Run `npm test` for the chat HTTP/provider tests, `npm run test:e2e` for existing
auth regressions, and `npm run build`. Chat tests isolate ChatModule and use no
database or live API key. Provider HTTP requests are mocked: tests incur no
Gemini costs. A live project/key/model request must still be verified locally.

To switch providers, implement `ChatProvider.rewrite(entry)` and replace its
binding in ChatModule. It must accept only public approved FAQ content, return
plain text or null for fallback, and handle failures without logging secrets.
Angular's endpoint and response fields do not change.