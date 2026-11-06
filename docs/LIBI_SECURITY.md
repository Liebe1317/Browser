# Libi security and data flow

## Model API boundary

The React renderer does not import the Google GenAI SDK and does not receive the provider API key. The Express server reads GEMINI_API_KEY from its environment and contacts Google Gemini server-to-server. A regression test fails if the provider SDK or key identifier enters the React source tree.

Never place the key in a VITE_-prefixed variable, URL, localStorage, a React component, a browser log, or a committed environment file. The root .env pattern is ignored by Git; .env.example contains empty placeholders only.

## Two-way interaction

- Libi can answer questions through the configured server-side model.
- Libi can search the web through a bounded server-side DuckDuckGo request and show validated HTTP(S) result cards. Result links open only after the user clicks.
- With the drawer open, Aegis asks the proxied page frame for a text-only snapshot. The snapshot is kept in React memory, capped at 12,000 characters, and removes script/style/form/input/button/frame/canvas content.
- Page text is **not** sent to Gemini unless the user checks "السماح بمشاركة نص الصفحة مع Gemini". The consent resets when the URL or active tab changes or the Libi drawer closes.
- Libi can propose fixed browser actions (navigate, tab/history, settings, bookmark, reader mode, zoom, scroll, theme). The user must confirm each proposal. It cannot run generated code or free-form scripts.
- Action parsing is deterministic and validates HTTP(S) navigation. There are no model function-calling tools.

## Untrusted page content

Web pages can contain prompt-injection text. The extracted page snapshot is tagged as untrusted JSON data in the model prompt. Libi is told to summarize/analyze it, not obey instructions found inside it. This is a mitigation, not a mathematical guarantee against prompt injection; do not let model text authorize privileged operations.

The page-frame bridge is message-based because proxied pages have opaque origins. The parent accepts page messages only from the active iframe window and only uses a strict set of message types. Iframe-provided content must always be considered untrusted.

## Privacy boundary

When GEMINI_API_KEY is configured, user chat text, bounded recent chat history, limited page metadata (title plus origin/path without query/fragment), and page text only after explicit consent may be sent from Aegis to Google Gemini. This is not local-only AI processing. Do not send passwords, access tokens, payment details or private content unless you have reviewed the provider's applicable terms.

Web search queries are sent to DuckDuckGo by the Aegis server. Returned result URLs are limited to HTTP(S) and revalidated before display/navigation.

## Server protections

- Same-origin Aegis session cookie and per-session CSRF token on all state-changing application APIs.
- Libi input/history/page metadata limits, per-session request caps, and global concurrency limits.
- Model credentials stay in the server process; provider errors do not return credential-bearing details to the browser.
- Page-control is a deterministic allowlist and every action requires user confirmation.
- No arbitrary filesystem, shell, password manager, cookies, downloads, or OS access is exposed to Libi.

## Residual risks

Anyone who controls the Aegis server process/environment or compromises the server host may access the provider API key. Store it in a secret manager or protected environment, rotate it if exposed, and restrict its quota at the provider. Server-side storage prevents ordinary website JavaScript from reading the key, but it does not protect a compromised server. Prompt injection remains an inherent risk for AI systems that consume untrusted web content.
