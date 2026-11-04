# Libi security and data flow

## Model API boundary

The React renderer does not import the Google GenAI SDK and does not receive the provider API key. Libi sends messages only to the same-origin Aegis endpoint. The Express server reads GEMINI_API_KEY from its process environment and contacts the provider server-to-server. The repository includes a source-boundary regression test that fails if the provider SDK or key identifier enters the React source tree.

Never place the key in a VITE_-prefixed variable, URL, localStorage, a React component, a browser log, or a committed environment file. The root .env pattern is ignored by Git; .env.example contains empty placeholders only.

## What Libi can control

Libi does not receive OS, filesystem, password-manager, cookie-jar, shell, or arbitrary JavaScript tools. A small deterministic command parser recognizes a fixed list of UI/browser actions. It validates navigation destinations and returns a typed proposal. The user must press the confirmation control before the React application executes that one allowlisted action.

Model-generated text is never interpreted as JavaScript, HTML, a shell command, or a browser action. Unknown commands remain ordinary chat and do not execute.

## Privacy boundary

When GEMINI_API_KEY is configured, the text the user submits, a bounded excerpt of recent chat history, and limited current-page metadata (title plus origin/path without query or fragment) are sent from the Aegis server to Google Gemini. This is not local-only AI processing. Do not send passwords, access tokens, payment details, or private content unless the user has reviewed the provider's applicable privacy terms.

## Server protections

- Same-origin Aegis session cookie and per-session CSRF token on all state-changing application APIs.
- Libi input, history, page metadata, concurrency, and per-session request-rate limits.
- Provider credentials stay in the server process; provider errors do not return credential-bearing details to the browser.
- No model function-calling or external tools are enabled for Libi.

## Residual risks

Anyone who controls the Aegis server process/environment or compromises the server host may access the server-side provider key. Store it in a secret manager or protected environment, rotate it if exposed, and restrict the key's quota and permissions at the provider. Server-side storage prevents ordinary website JavaScript from reading the key, but it does not protect a compromised server.
