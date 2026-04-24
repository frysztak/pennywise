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
