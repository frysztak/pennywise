# Stage 1: Build frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /app/web

# Copy package files and install dependencies
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copy frontend source and build
COPY web/ ./
RUN npm run build
RUN rm dist/assets/*.map

# Stage 2: Build backend
FROM golang:1.26-alpine AS backend-builder

# Install build dependencies for CGO (required by go-sqlite3)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy go mod files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/web/dist ./web/dist

# Build the binary with CGO enabled. APP_VERSION is baked in via -ldflags;
# CI passes a tag (v1.2.3) or dev-<short sha>, default keeps local builds buildable.
ARG APP_VERSION=dev
RUN CGO_ENABLED=1 go build -ldflags="-s -w -X main.Version=${APP_VERSION}" -o pennywise .

# Stage 3: Runtime
FROM alpine:3.23

# Install runtime dependencies for SQLite
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy the binary from builder
COPY --from=backend-builder /app/pennywise .

# Create data directory for SQLite database
RUN mkdir -p /data

# Default environment variables
ENV DB_PATH=/data/pennywise.db
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json

EXPOSE 3333

# Run the application
CMD ["./pennywise"]
