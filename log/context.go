package log

import (
	"context"
	"log/slog"
)

type contextKey string

const loggerKey contextKey = "logger"

// WithLogger adds a logger to the context
func WithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerKey, logger)
}

// FromContext retrieves a logger from the context
// If no logger is found, returns the global logger
func FromContext(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(loggerKey).(*slog.Logger); ok {
		return logger
	}
	return Logger()
}

// WithFields adds fields to the logger in the context
func WithFields(ctx context.Context, args ...any) context.Context {
	logger := FromContext(ctx)
	return WithLogger(ctx, logger.With(args...))
}
