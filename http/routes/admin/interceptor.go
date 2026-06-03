package admin

import (
	"context"
	"fmt"

	"pennywise/db"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"

	"connectrpc.com/connect"
)

// AdminInterceptor rejects requests from non-admin users. It is applied only to
// AdminService, so it gates every current and future admin method without
// per-handler checks.
func AdminInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			session := helpers.GetSessionInfo(ctx)

			user, err := db.ReadQueries.GetUserById(ctx, session.UserID)
			if err != nil {
				log.FromContext(ctx).Error("failed to load user for admin check", "error", err, "user_id", session.UserID)
				return nil, connect.NewError(connect.CodeInternal, err)
			}

			if apiv1.UserRole(user.Role) != apiv1.UserRole_USER_ROLE_ADMIN {
				return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("admin access required"))
			}

			return next(ctx, req)
		}
	}
}
