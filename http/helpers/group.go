package helpers

import (
	"context"
	"errors"
	"pennywise/db"
	apiv1 "pennywise/gen/api/v1"

	"connectrpc.com/connect"
)

// AssertGroupNotArchived returns a FailedPrecondition error if the group is
// archived. Archived groups are read-only, so every write handler that mutates
// a group or its contents should call this before performing the mutation.
func AssertGroupNotArchived(ctx context.Context, groupID string) error {
	archived, err := db.ReadQueries.IsGroupArchivedByGroupId(ctx, groupID)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}
	if archived {
		return connect.NewError(connect.CodeFailedPrecondition, errors.New("group is archived"))
	}
	return nil
}

// IsAdmin reports whether the given user has the admin role.
func IsAdmin(ctx context.Context, userID string) (bool, error) {
	user, err := db.ReadQueries.GetUserById(ctx, userID)
	if err != nil {
		return false, err
	}
	return apiv1.UserRole(user.Role) == apiv1.UserRole_USER_ROLE_ADMIN, nil
}
