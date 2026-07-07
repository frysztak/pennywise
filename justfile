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

# Cut a release: stamp CHANGELOG's [Unreleased] section as <version>, commit, tag, push.
release version:
    #!/usr/bin/env bash
    set -euo pipefail
    ver="{{version}}"
    if ! [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "error: version must be X.Y.Z (got '$ver')" >&2
        exit 1
    fi
    if [[ -n "$(git status --porcelain)" ]]; then
        echo "error: working tree is dirty; commit or stash first" >&2
        exit 1
    fi
    if git rev-parse -q --verify "refs/tags/v$ver" >/dev/null; then
        echo "error: tag v$ver already exists" >&2
        exit 1
    fi
    if ! grep -qxF '## [Unreleased]' CHANGELOG.md; then
        echo "error: no '## [Unreleased]' section in CHANGELOG.md" >&2
        exit 1
    fi
    date="$(date +%F)"
    awk -v ver="$ver" -v date="$date" '
        !done && $0 == "## [Unreleased]" {
            print "## [Unreleased]"; print ""
            print "## [" ver "] - " date
            done=1; next
        }
        { print }
    ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
    git add CHANGELOG.md
    git commit -m "chore(release): v$ver"
    git tag "v$ver"
    git push origin HEAD "v$ver"
    echo "released v$ver"

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
