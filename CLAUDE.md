# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pennywise is a full-stack expense tracking and splitting application built with Go and React. It uses Connect RPC (gRPC-like protocol) for API communication between the backend and frontend.

**Tech Stack:**
- Backend: Go 1.25+, Connect RPC, SQLite
- Frontend: React 19, TypeScript, Vite, TanStack Router, TanStack Query, Tailwind CSS
- Database: SQLite with sqlc for type-safe queries
- API: Protocol Buffers (protobuf) with Connect RPC

## Development Commands

### Full Stack Development
```bash
# Start both frontend and backend in parallel (recommended)
just dev

# Or individually:
just web  # Start Vite dev server (localhost:5173)
just api  # Start Go backend with hot reload (localhost:3333)
```

### Backend (Go)

**Build & Run:**
```bash
go run main.go           # Production mode
go run main.go -dev      # Development mode (uses Vite dev server)
go tool air -- -dev      # With hot reload (used by `just api`)
```

**Testing:**
```bash
go test ./...                    # Run all tests
go test ./calc -v                # Run tests in specific package
go test -run TestFunctionName    # Run specific test
```

**Code Generation:**
```bash
go generate              # Runs both sqlc and buf generate
sqlc generate            # Generate database code from queries
buf generate             # Generate protobuf/Connect code
```

### Frontend (Web)

From the `web/` directory:
```bash
npm run dev              # Start dev server
npm run build            # Build for production (runs tsc then vite build)
npm run lint             # Run ESLint
npm run buf:generate     # Generate protobuf client code
```

### All Code Generation
```bash
just gen  # Runs go generate + npm run buf:generate
```

## Architecture

### Backend Structure

**Entry Point:** `main.go` handles server initialization, Vite integration, and HTML template serving.

**HTTP Router:** `http/router/routes.go` registers all Connect RPC service handlers with session middleware and validation interceptors.

**Services:** Service implementations are in `http/routes/{service}/`:
- `auth/` - Authentication (login, registration)
- `user/` - User management
- `admin/` - Admin operations
- `group/` - Group management
- `expense/` - Expense tracking

**Middleware:** `http/middleware/session.go` handles JWT session authentication for all endpoints except login/register.

**Database Layer:**
- `db/db.go` - Database initialization and migration runner
- `db/schema/` - SQL migration files (Goose migrations)
- `db/queries/` - SQL queries (sqlc format)
- `db/database/` - Generated sqlc code (type-safe database queries)

**Business Logic:**
- `calc/balance.go` - Group expense balance calculations with weighted shares per currency

**Configuration:** `config/config.go` loads environment variables from `.env` file:
- `DB_PATH` - SQLite database file path
- `JWT_SECRET` - JWT signing secret
- OIDC settings (optional)

### Frontend Structure

Located in `web/`:
- `src/` - React application source
- Entry: `index.html` is served by Go backend with Vite integration
- Uses TanStack Router for routing
- Uses TanStack Query with Connect Query for API calls
- Shadcn/ui components with Radix UI primitives

### API Layer

**Protocol Buffers:**
- Definitions: `proto/api/v1/*.proto`
- Go code: `gen/api/v1/` (generated)
- TypeScript client: `web/src/gen/` (generated)

**Connect RPC:** Uses Connect protocol (gRPC-compatible) over HTTP. Services are defined in protobuf and handlers implement the generated interfaces.

**Code Generation Flow:**
1. Write `.proto` files in `proto/api/v1/`
2. Run `buf generate` to generate Go server stubs and TypeScript clients
3. Implement service handlers in `http/routes/{service}/`
4. Use generated clients in React with Connect Query

### Database

**SQLite with sqlc:**
1. Write SQL schema migrations in `db/schema/` (Goose format)
2. Write SQL queries in `db/queries/` (sqlc format)
3. Run `sqlc generate` to create type-safe Go code
4. Use `db.Queries` global for database operations

**Global Variables:**
- `db.DB` - Database connection
- `db.Queries` - sqlc query interface
- `config.Config` - Application configuration

### Session Management

JWT-based authentication stored in HTTP-only cookies. Session middleware validates tokens and injects user context for all authenticated endpoints. Allowlist in `session.go` defines public endpoints.

### Development vs Production

The backend serves two modes:
- **Development** (`-dev` flag): Proxies to Vite dev server at localhost:5173
- **Production**: Serves embedded static files from `web/dist`

Hot reload is provided by Air (backend) and Vite (frontend).

## Key Patterns

**Database Access:** Always use `db.Queries` for database operations (sqlc-generated code).

**API Handlers:** Connect RPC handlers return `(*Response, error)` and use context for session info.

**Balance Calculation:** The `calc` package computes weighted expense splits per currency. Weights are stored per group member.

**Error Handling:** Use `connect.NewError()` for RPC errors with proper codes (e.g., `connect.CodeUnauthenticated`).

**Utilities:**
- `utils.Ptr()` - Create pointers to values
- `utils.JSONStringToSlice()` - Parse JSON arrays from database TEXT fields
