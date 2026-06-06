[parallel]
dev: web storybook api

web:
    cd web && \
    npm run dev

storybook:
   cd web && \
   npm run storybook

api:
    go tool air -- -dev

gen:
  go generate && \
  cd web && npm run buf:generate

[parallel]
screenshots: web api-demo screenshot-script

api-demo:
    DB_PATH=.db-demo.sqlite3 AUTH_SECRET="${AUTH_SECRET:-screenshot-demo-secret}" LOG_LEVEL=warn \
    go run main.go -dev

screenshot-script:
    node web/scripts/screenshots.mjs

test-api:
    go test -race -covermode=atomic -coverpkg=./... -coverprofile=coverage.out $(go list ./... | grep -v /node_modules)

test-web:
    cd web && npx vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text

e2e-build:
    cd web && npm run build -- --sourcemap inline
    go build -cover -o pennywise-e2e .

e2e *args: e2e-build
    rm -rf .e2e-coverage && mkdir -p .e2e-coverage
    cd web && GOCOVERDIR="{{justfile_directory()}}/.e2e-coverage" npx playwright test {{args}}

e2e-coverage:
    go tool covdata textfmt -i=.e2e-coverage -o e2e-coverage.out
    go tool covdata percent -i=.e2e-coverage
