package log

import (
	"context"
	"time"

	"connectrpc.com/authn"
	"connectrpc.com/connect"
	"github.com/google/uuid"
	"pennywise/db/database"
)

type requestIDKey string

const RequestIDKey requestIDKey = "request_id"

// LoggingInterceptor returns a Connect interceptor that logs requests and responses
func LoggingInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			start := time.Now()

			// Generate request ID
			requestID := uuid.New().String()
			ctx = context.WithValue(ctx, RequestIDKey, requestID)

			// Create logger with request context
			logFields := []any{
				"request_id", requestID,
				"procedure", req.Spec().Procedure,
			}

			// Try to get user_id from session (if authenticated)
			sessionInfo := authn.GetInfo(ctx)
			if sessionInfo != nil {
				if session, ok := sessionInfo.(database.Session); ok {
					logFields = append(logFields, "user_id", session.UserID)
				}
			}

			logger := Logger().With(logFields...)

			// Add logger to context
			ctx = WithLogger(ctx, logger)

			// Log incoming request
			logger.Debug("incoming request")

			// Call the actual handler
			resp, err := next(ctx, req)

			// Calculate duration
			duration := time.Since(start)

			// Log response
			if err != nil {
				// Extract Connect error details
				connectErr := connect.CodeOf(err)
				logger.Error("request failed",
					"error", err.Error(),
					"code", connectErr.String(),
					"duration_ms", duration.Milliseconds(),
				)
			} else {
				logger.Info("request completed",
					"duration_ms", duration.Milliseconds(),
				)
			}

			return resp, err
		}
	}
}

// GetRequestID retrieves the request ID from context
func GetRequestID(ctx context.Context) string {
	if id, ok := ctx.Value(RequestIDKey).(string); ok {
		return id
	}
	return ""
}
