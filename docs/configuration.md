# Configuration

Deployment-level settings are controlled by the environment variables below. In
development they can be placed in a `.env` file at the repository root (loaded
automatically); in production set them on the container (see the Docker section in
the [README](../README.md)). Some settings are managed in-app instead, via the
admin page.

## Core

| Variable      | Required | Default | Description |
| ------------- | -------- | ------- | ----------- |
| `AUTH_SECRET` | **Yes**  | —       | Secret key used to sign/verify session tokens. Generate with `openssl rand -hex 32`. |
| `DB_PATH`     | **Yes**  | —       | Path to the SQLite database file. The Docker image sets this to `/data/pennywise.db`. |
| `STORAGE_PATH`| No       | `/data` | Directory for uploaded files (avatars, group images). |
| `PORT`        | No       | `3333`  | Port the HTTP server listens on. |
| `SESSION_DURATION` | No  | `24h`   | How long a session stays valid. Accepts Go duration strings (e.g. `72h`, `30m`). |

## Authentication

| Variable                 | Required | Default | Description |
| ------------------------ | -------- | ------- | ----------- |
| `REGISTRATION_ENABLED`   | No       | `true`  | Allow new users to self-register. Set to `false` to lock down sign-ups. |
| `PASSWORD_LOGIN_ENABLED` | No       | `true`  | Enable email/password login. Set to `false` to force OIDC-only login. |

## OIDC (Single Sign-On)

OIDC is enabled only when **all four** of `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
`OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URL` are set. See the OIDC section in the
[README](../README.md) for a full provider setup example.

| Variable             | Required | Default | Description |
| -------------------- | -------- | ------- | ----------- |
| `OIDC_ISSUER`        | For OIDC | —       | Issuer URL of your identity provider (e.g. `https://auth.example.com`). |
| `OIDC_CLIENT_ID`     | For OIDC | —       | Client ID registered with the provider. |
| `OIDC_CLIENT_SECRET` | For OIDC | —       | Client secret registered with the provider. |
| `OIDC_REDIRECT_URL`  | For OIDC | —       | Callback URL, e.g. `https://pennywise.example.com/auth/oidc/callback`. |
| `OIDC_PROVIDER_NAME` | No       | —       | Controls the label/brand icon on the "Continue with …" button. Recognized (case-insensitive): `authelia`, `authentik`, `keycloak`. Any other string renders a generic key icon with that label. Unset shows "Continue with OIDC". |

## Receipt Scanning (AI OCR)

Receipt scanning is enabled only when **both** `OPENAI_API_KEY` and
`OPENAI_OCR_MODEL` are set. Any OpenAI-compatible vision endpoint works (including
a local [Ollama](https://ollama.com/) instance) — see the Receipt Scanning section
in the [README](../README.md).

| Variable          | Required   | Default | Description |
| ----------------- | ---------- | ------- | ----------- |
| `OPENAI_API_KEY`  | For OCR    | —       | API key for the vision model. Use any non-empty value (e.g. `ollama`) for local endpoints that don't require auth. |
| `OPENAI_OCR_MODEL`| For OCR    | —       | Vision model to use for OCR (e.g. `gpt-5-mini`, `gemma3:4b`). |
| `OPENAI_BASE_URL` | No         | —       | Override the API base URL to point at a compatible endpoint (e.g. `http://ollama:11434/v1`). Defaults to OpenAI's API. |

## Currency Conversion (Exchange Rates)

Conversions pre-fill their exchange rate from an FX provider. The rate is only a
suggestion — it can be overridden or entered manually, and the value used is
stored on the conversion — so these settings are optional. See the Currency
Conversion section in the [README](../README.md).

| Variable      | Required | Default                          | Description |
| ------------- | -------- | -------------------------------- | ----------- |
| `FX_PROVIDER` | No       | `frankfurter`                    | Exchange-rate provider id. Only `frankfurter` is implemented. |
| `FX_BASE_URL` | No       | `https://api.frankfurter.dev/v1` | Provider base URL. Override to point at a self-hosted [Frankfurter](https://github.com/lineofflight/frankfurter) instance. |
| `FX_API_KEY`  | No       | —                                | Reserved for a future keyed provider; unused by Frankfurter. |

## Logging

| Variable     | Required | Default | Description |
| ------------ | -------- | ------- | ----------- |
| `LOG_LEVEL`  | No       | `info`  | Log verbosity: `debug`, `info`, `warn`, or `error`. The Docker image sets this to `info`. |
| `LOG_FORMAT` | No       | `text`  | Log output format: `text` (colored) or `json`. The Docker image sets this to `json`. |
