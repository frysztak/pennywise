[parallel]
dev: web api

web:
    cd web && \
    npm run dev

api:
    go tool air -- -dev

gen:
  go generate && \
  cd web && npm run buf:generate
