# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pennywise is a full-stack expense tracking and splitting application built with Go and React. It uses Connect RPC (gRPC-like protocol) for API communication between the backend and frontend.

**Key Features:**
- Multi-currency expense tracking and splitting with weighted shares
- Money transfer recording between group members
- Real-time balance calculations integrating expenses and transfers
- Group activity feed combining all financial transactions
- Database-backed session tokens with HTTP-only cookies

**Tech Stack:**
- Backend: Go 1.25+, Connect RPC, SQLite
- Frontend: React 19, TypeScript, Vite, TanStack Router, TanStack Query, Tailwind CSS v4
- Database: SQLite with sqlc for type-safe queries
- API: Protocol Buffers (protobuf) with Connect RPC
- Logging: Structured logging with slog and tint (colored output)

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

**HTTP Router:** `http/router/routes.go` registers all Connect RPC service handlers with:
- Session middleware for authentication
- Logging interceptor for request tracking
- Validation interceptor using buf.validate

**Services:** Service implementations are in `http/routes/{service}/`:
- `auth/` - Authentication (login, registration)
- `user/` - User management (profile, settings)
- `admin/` - Admin operations (placeholder)
- `group/` - Group management (create, edit, delete, member weights, activity)
- `expense/` - Expense tracking (CRUD operations)
- `transfer/` - Money transfers between group members (CRUD operations)

**Middleware & Interceptors:**
- `http/middleware/session.go` - Session authentication via database lookup for all endpoints except login/register
- `log/middleware.go` - Request logging with unique request IDs, user tracking, duration, and error codes

**Logging Infrastructure:**
- `log/logger.go` - Global slog-based logger with configurable level and format
- `log/context.go` - Context-aware logging (use `log.FromContext(ctx)` in handlers)
- Supports colored text output (via tint) or JSON format
- All requests automatically logged with request ID, procedure, user ID, duration, and error codes

**Database Layer:**
- `db/db.go` - Database initialization and migration runner
- `db/schema/` - SQL migration files (Goose migrations)
- `db/queries/` - SQL queries (sqlc format with named @parameters)
- `db/database/` - Generated sqlc code (type-safe database queries)

**Business Logic:**
- `calc/balance.go` - Group balance calculations with:
  - Weighted expense splitting per currency
  - Transfer processing (sender balance increases, receiver decreases)
  - Multi-currency support with separate balances per currency

**Helpers:**
- `http/helpers/auth.go` - GetSessionInfo() for extracting user from context
- `http/helpers/cookies.go` - SetConnectCookie() and ClearConnectCookie() for session management

**Configuration:** `config/config.go` loads environment variables from `.env` file:
- `DB_PATH` - SQLite database file path (default: "pennywise.db")
- `AUTH_SECRET` - Secret key for authentication (required)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: "info")
- `LOG_FORMAT` - Log format: text (colored), json (default: "text")
- OIDC settings (optional, partially implemented)

### Frontend Structure

Located in `web/`:
- `src/` - React application source
- Entry: HTML template generated in `main.go` (see `indexTmpl` at main.go:184) with Vite integration
- Uses TanStack Router with file-based routing and auto code splitting
- Uses TanStack Query with Connect Query for type-safe API calls
- Shadcn/ui components built on Radix UI primitives
- Tailwind CSS v4 for styling

**Key Frontend Directories:**
- `src/components/group/` - Group management UI (activity table, balance cards, modals)
- `src/components/transfer/` - Transfer creation and editing modal
- `src/components/ui/` - Shadcn/ui reusable components
- `src/hooks/` - Custom React hooks for state management and modal control
- `src/lib/` - Utilities (currencies list, cn() helper)
- `src/routes/` - TanStack Router file-based routes
- `src/gen/` - Generated Connect Query clients and types

**Authentication:**
- `src/auth.tsx` - AuthProvider with React context
- Automatic auth state restoration via userInfo query
- Protected routes using TanStack Router's beforeLoad

**Custom Hooks:**
- `use-expense-modal.ts`, `use-transfer-modal.ts` - Modal state management
- `use-delete-expense-modal.ts`, `use-delete-transfer-modal.ts`, `use-delete-group-modal.ts`
- `use-add-member-modal.ts`, `use-edit-group-modal.ts`
- `use-group-mutations.ts` - Group CRUD operations with optimistic updates
- `use-mobile.ts` - Responsive design breakpoint detection
- `use-delete-confirmation.ts` - Generic confirmation dialog hook

**Key Pages:**
- `routes/_pathlessLayout/dashboard.tsx` - Group overview cards
- `routes/_pathlessLayout/group/$groupId.tsx` - Comprehensive group detail page with:
  - Balance summary cards
  - Member balances table with per-currency breakdowns
  - Unified activity feed (expenses + transfers)
  - Modals for expense/transfer CRUD, member management, group editing

### API Layer

**Protocol Buffers:**
- Definitions: `proto/api/v1/*.proto` (auth, user, admin, group, expense, transfer)
- Go code: `gen/api/v1/` (generated server stubs)
- TypeScript client: `web/src/gen/` (generated Connect Query hooks)

**Connect RPC:** Uses Connect protocol (gRPC-compatible) over HTTP. Services are defined in protobuf and handlers implement the generated interfaces.

**Validation:** Protobuf field validation using buf.validate:
- UUID validation on all ID fields
- Amount > 0.0 for expenses and transfers
- Currency min_len = 2
- Email format validation
- Password requirements

**Code Generation Flow:**
1. Write `.proto` files in `proto/api/v1/`
2. Run `buf generate` to generate Go server stubs and TypeScript clients
3. Implement service handlers in `http/routes/{service}/`
4. Use generated Connect Query hooks in React components

### Database

**SQLite with sqlc:**
1. Write SQL schema migrations in `db/schema/` (Goose format)
2. Write SQL queries in `db/queries/` (sqlc format with named @parameters)
3. Run `sqlc generate` to create type-safe Go code
4. Use `db.WriteQueries` for write operations, `db.ReadQueries` for read operations

**Key Tables:**
- `users` - User accounts with email, password hash
- `expense_groups` - Groups with name, description, default_currency, creator_id
- `group_members` - User membership with weights for expense splitting
- `expenses` - Expense records with payer, amount (cents), currency, beneficiaries (JSON array)
- `transfers` - Money transfers with sender_id, receiver_id, amount (cents), currency
- `recurring_expenses` - Future feature (table exists but not fully implemented)

**Amount Storage:** All monetary amounts stored as integers (cents) for precision.

**Global Variables:**
- `db.WriteDB` - Write connection pool (1 connection for SQLite)
- `db.ReadDB` - Read connection pool (scales with CPU count)
- `db.WriteQueries` - sqlc query interface for writes (INSERT, UPDATE, DELETE)
- `db.ReadQueries` - sqlc query interface for reads (SELECT)
- `config.Config` - Application configuration
- `log.Logger` - Global logger instance

### Session Management

Opaque token authentication stored in HTTP-only cookies. Session middleware:
- Validates tokens via database lookup
- Injects user context for authenticated endpoints
- Allowlist in `session.go` defines public endpoints (Login, Register)
- Use `helpers.GetSessionInfo(ctx)` to extract user ID from context

### Development vs Production

The backend serves two modes:
- **Development** (`-dev` flag): Proxies to Vite dev server at localhost:5173
- **Production**: Serves embedded static files from `web/dist`

Hot reload is provided by Air (backend) and Vite (frontend).

### Logging Best Practices

**In HTTP Handlers:**
```go
logger := log.FromContext(ctx) // Gets logger with request ID and user ID
logger.Info("processing request", "groupId", req.GroupId)
logger.Error("failed to create expense", "error", err)
```

**Request Logging:** All requests automatically logged with:
- Unique request ID
- Procedure name (e.g., "pennywise.api.v1.ExpenseService/CreateExpense")
- User ID (if authenticated)
- Duration in milliseconds
- Error code (if error occurred)

## Key Patterns

### Database Access
Use separate query interfaces for reads and writes (sqlc-generated code). Queries use named parameters for clarity:

**Write Operations** (use `db.WriteQueries`):
```go
expense, err := db.WriteQueries.CreateExpense(ctx, database.CreateExpenseParams{
    GroupID:       req.GroupId,
    PayerID:       userID,
    Amount:        int64(req.Amount * 100), // Convert to cents
    // ...
})
```

**Read Operations** (use `db.ReadQueries`):
```go
expenses, err := db.ReadQueries.GetGroupExpenses(ctx, groupId)
```

**Transactions** (use `db.WriteDB.BeginTx`):
```go
tx, err := db.WriteDB.BeginTx(ctx, nil)
defer tx.Rollback()
qtx := db.WriteQueries.WithTx(tx)
// ... perform operations with qtx
tx.Commit()
```

**Connection Pool Details:**
- Write pool: 1 connection (SQLite limitation)
- Read pool: NumCPU connections (parallel reads in WAL mode)

### API Handlers
Connect RPC handlers return `(*Response, error)` and use context for session info:
```go
func (s *Service) CreateExpense(ctx context.Context, req *connect.Request[v1.CreateExpenseRequest]) (*connect.Response[v1.CreateExpenseResponse], error) {
    logger := log.FromContext(ctx)
    userID, err := helpers.GetSessionInfo(ctx)
    // ...
}
```

### Balance Calculation
The `calc` package computes weighted expense splits and transfer balances:
- Processes both expenses and transfers
- Multi-currency support (separate balances per currency)
- Weighted splitting based on group member weights
- Transfers: sender balance increases, receiver balance decreases

### Group Activity Feed
`GetGroupActivity` returns a unified, chronologically sorted list of:
- Expenses (with payer, beneficiaries, amount)
- Transfers (with sender, receiver, amount)
- Sorted by date DESC, then created_at DESC

### Error Handling
Use `connect.NewError()` for RPC errors with proper codes:
```go
return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid credentials"))
return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("not a group member"))
return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid currency"))
```

### Utilities

**Backend:**
- `utils.PtrFrom[T](value T)` - Create pointers to values of any type
- `utils.JSONStringToSlice()` - Parse JSON arrays from database TEXT fields
- `utils.SliceToJSONString()` - Serialize slices to JSON for database storage

**Frontend:**
- `src/lib/currencies.ts` - List of 30 common currencies with labels
- `src/lib/utils.ts` - cn() helper for conditional Tailwind classes
- Custom hooks for modal state management and API mutations

### Validation
All API requests validated via buf.validate in protobuf definitions. Validation interceptor automatically returns proper error codes for invalid requests.

## Common Development Workflows

### Adding a New API Endpoint

1. Define the RPC method in the appropriate `.proto` file in `proto/api/v1/`
2. Add request/response validation rules using buf.validate
3. Run `just gen` to generate Go and TypeScript code
4. Implement the handler in `http/routes/{service}/`
5. Add database queries to `db/queries/` if needed
6. Run `sqlc generate` if queries were added
7. Use the generated Connect Query hook in React components

### Adding a Database Migration

1. Create new migration in `db/schema/` following Goose format: `YYYYMMDDHHMMSS_description.sql`
2. Write SQL for `-- +goose Up` and `-- +goose Down` sections
3. Add corresponding queries to `db/queries/` for the new tables/columns
4. Run `sqlc generate` to regenerate type-safe query code
5. Update handlers to use new queries

### Multi-Currency Handling

- Store amounts as integers (cents) in the database
- Convert to cents on write: `int64(amount * 100)`
- Convert from cents on read: `float64(dbAmount) / 100`
- Group balances are computed per currency separately
- Default currency can be set per group but all currencies are supported

### Frontend State Management

- Use TanStack Query for server state (expenses, transfers, groups)
- Use custom hooks for UI state (modals, dialogs)
- Optimistic updates for mutations (see `use-group-mutations.ts`)
- React Context for authentication state (`src/auth.tsx`)
