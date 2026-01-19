package middleware

import (
	"context"
	"errors"
	"net/http"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	"pennywise/gen/api/v1/apiv1connect"
	"pennywise/http/helpers"
	"pennywise/log"
	"time"

	"connectrpc.com/authn"
	"connectrpc.com/connect"
)

type key int

const (
	SessionContextToken key = iota
	SessionContextUserId
)

func SessionMiddleware() *authn.Middleware {
	allowList := map[string]struct{}{
		"/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo": {},
		"/grpc.reflection.v1.ServerReflection/ServerReflectionInfo":      {},
		apiv1connect.AuthServiceLoginWithPasswordProcedure:               {},
		apiv1connect.UserServiceUserRegisterProcedure:                    {},
	}

	authenticate := func(ctx context.Context, req *http.Request) (any, error) {
		// Infer the procedure from the request URL.
		procedure, ok := authn.InferProcedure(req.URL)
		if !ok {
			return nil, connect.NewError(connect.CodeInternal, errors.New("Procedure not found"))
		}

		if _, ok := allowList[procedure]; ok {
			return nil, nil // no authentication required
		}

		cookie, err := req.Cookie(helpers.SessionCookie)
		if err != nil {
			err := authn.Errorf("invalid authorization")
			return nil, err
		}

		hashedToken := helpers.HashSessionToken(cookie.Value)
		session, err := db.ReadQueries.GetSessionByHash(ctx, hashedToken)
		if err != nil {
			return nil, authn.Errorf("invalid authorization")
		}

		// Check if session has expired
		now := time.Now()
		if session.ExpiredAt.Time.Before(now) {
			logger := log.FromContext(ctx)
			logger.Warn("session expired", "session_id", session.ID, "user_id", session.UserID, "expired_at", session.ExpiredAt.Time)
			return nil, authn.Errorf("session expired")
		}

		// Renew session if it's expiring within the next 12 hours
		renewalThreshold := 12 * time.Hour
		timeUntilExpiry := session.ExpiredAt.Time.Sub(now)
		if timeUntilExpiry < renewalThreshold {
			newExpiredAt := now.Add(24 * time.Hour)
			err = db.WriteQueries.UpdateSession(ctx, database.UpdateSessionParams{
				ID:        session.ID,
				Token:     session.Token,
				UpdatedAt: overrides.TextTime{Time: now},
				ExpiredAt: overrides.TextTime{Time: newExpiredAt},
			})
			if err != nil {
				logger := log.FromContext(ctx)
				logger.Error("failed to renew session", "error", err, "session_id", session.ID, "user_id", session.UserID)
				// Don't fail the request if renewal fails, just log the error
			} else {
				logger := log.FromContext(ctx)
				logger.Debug("session renewed", "session_id", session.ID, "user_id", session.UserID, "new_expired_at", newExpiredAt)
				// Update the session object to reflect the new expiration
				session.ExpiredAt = overrides.TextTime{Time: newExpiredAt}
				session.UpdatedAt = overrides.TextTime{Time: now}
			}
		}

		// The request is authenticated!
		return session, nil
	}

	return authn.NewMiddleware(authenticate)
}
