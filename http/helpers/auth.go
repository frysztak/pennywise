package helpers

import (
	"context"
	"pennywise/db/database"

	"connectrpc.com/authn"
)

func GetSessionInfo(ctx context.Context) database.Session {
	return authn.GetInfo(ctx).(database.Session)
}
