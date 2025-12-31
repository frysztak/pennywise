package middleware

import (
	"context"
	"errors"
	"net/http"
	"pennywise/db"
	"pennywise/gen/api/v1/apiv1connect"
	"pennywise/http/helpers"

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

		session, err := db.Queries.GetSessionByHash(ctx, cookie.Value)
		if err != nil {
			return nil, authn.Errorf("invalid authorization")
		}

		// TODO: check if session needs to be renewed

		// The request is authenticated!
		return session, nil
	}

	return authn.NewMiddleware(authenticate)
}
