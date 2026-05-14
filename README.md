<p align="center">
  <img src="https://raw.githubusercontent.com/frysztak/pennywise/refs/heads/main/web/public/logo.svg" width="128px" height="128px" alt="logo">
  <h1 align="center">Pennywise</h2>
  <p align="center">
    A self-hosted expense tracking and splitting application for groups. Keep track of shared expenses, record money transfers between members, and see who owes what at a glance.
  </p>
</p>


## Features

- **Expense Tracking** - Record expenses with multiple beneficiaries and weighted splits
- **Money Transfers** - Track payments between group members
- **Multi-Currency Support** - Handle expenses in different currencies with separate balance tracking
- **Real-Time Balances** - See who owes what, updated instantly as expenses and transfers are added
- **Activity Feed** - View all group transactions in one unified timeline
- **Group Management** - Create groups, invite members, and customize splitting weights
- **AI-based receipt scanning** - Automatically extract data from receipts

## Screenshots

<details>

<summary>Group View</summary>

![Group View](screenshots/group-view.png)

</details>

<details>

<summary>Dashboard</summary>

![Dashboard](screenshots/dashboard.png)

</details>


## Getting Started

### Prerequisites

- Go 1.25 or later
- Node.js 20 or later
- [just](https://github.com/casey/just) command runner

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/frysztak/pennywise.git
   cd pennywise
   ```

2. Install frontend dependencies:
   ```bash
   cd web && npm install && cd ..
   ```

3. Create a `.env` file with your configuration:
   ```
   AUTH_SECRET=your-secret-key-here
   ```

4. Start the development servers:
   ```bash
   just dev
   ```

   This starts both the Go backend (port 3333) and Vite dev server (port 5173) with hot reload.

5. Open http://localhost:3333 in your browser.

## Docker Setup

Add the following to your `compose.yaml`:

```yaml
services:
  pennywise:
    image: ghcr.io/frysztak/pennywise:latest
    restart: unless-stopped
    volumes:
      - /home/docker/pennywise/db:/data
    environment:
      - AUTH_SECRET=<...your key...>
```

Generate `AUTH_SECRET` using:

```bash
openssl rand -hex 32
```

## OIDC Setup

To enable OIDC authentication, add these environment variables to your container:

```yaml
environment:
  - OIDC_ISSUER=https://auth.example.com
  - OIDC_CLIENT_ID=pennywise
  - OIDC_CLIENT_SECRET=<...client secret...>
  - OIDC_REDIRECT_URL=https://pennywise.example.com/auth/oidc/callback
  - OIDC_PROVIDER_NAME=authelia
```

`OIDC_PROVIDER_NAME` is optional and only affects the login screen — it controls which name and brand icon the "Continue with …" button shows. Recognized values (case-insensitive): `authelia`, `authentik`, `keycloak`. Any other string renders with a generic key icon and the given label (e.g. `OIDC_PROVIDER_NAME="My SSO"`). Leave unset for a generic "Continue with OIDC" button.

You'll also need to configure your OIDC provider. Example configuration for Authelia:

```yaml
identity_providers:
  oidc:
    clients:
       - client_id: 'pennywise'
         client_name: 'Pennywise'
         client_secret: '<...client secret digest...>'
         public: false
         authorization_policy: 'one_factor'
         require_pkce: false
         pkce_challenge_method: ''
         redirect_uris:
           - 'https://pennywise.example.com/auth/oidc/callback'
         scopes:
           - 'openid'
           - 'profile'
           - 'email'
         response_types:
           - 'code'
         grant_types:
           - 'authorization_code'
         access_token_signed_response_alg: 'none'
         userinfo_signed_response_alg: 'none'
         token_endpoint_auth_method: 'client_secret_post'
```

Generate `OIDC_CLIENT_SECRET` and `client_secret` using:

```bash
docker run authelia/authelia:latest authelia crypto hash generate pbkdf2 --variant sha512 --random --random.length 72 --random.charset rfc3986
```

## Receipt Scanning (AI OCR)

Pennywise can extract expense details from receipt photos using any vision model. To enable it with OpenAI, set the following environment variables:

```yaml
environment:
  - OPENAI_API_KEY=<...your api key...>
  - OPENAI_OCR_MODEL=gpt-5.4-mini
```

### Ollama Example

You can also point Pennywise at a local [Ollama](https://ollama.com/) instance running a vision-capable model:

```yaml
environment:
  - OPENAI_BASE_URL=http://ollama:11434/v1
  - OPENAI_API_KEY=ollama
  - OPENAI_OCR_MODEL=gemma4:9b
```

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
