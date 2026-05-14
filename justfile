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
