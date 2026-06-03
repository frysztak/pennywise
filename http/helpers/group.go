package helpers

import (
	"context"
	"errors"
	"pennywise/db"

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
