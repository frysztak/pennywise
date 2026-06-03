package admin

import (
	"context"
	"fmt"

	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/log"
	"pennywise/settings"

	"connectrpc.com/connect"
)

type AdminService struct{}

func NewAdminService() *AdminService {
	return &AdminService{}
}

func (s *AdminService) ListUsers(ctx context.Context, r *apiv1.ListUsersRequest) (*apiv1.ListUsersResponse, error) {
	logger := log.FromContext(ctx)

	users, err := db.ReadQueries.GetUsers(ctx)
	if err != nil {
		logger.Error("failed to list users", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	responseUsers := make([]*apiv1.User, 0, len(users))
	for _, user := range users {
		responseUsers = append(responseUsers, &apiv1.User{
			Id:       user.ID,
			Username: user.Username,
			Email:    user.Email,
			Role:     apiv1.UserRole(user.Role),
		})
	}

	return &apiv1.ListUsersResponse{Users: responseUsers}, nil
}

func (s *AdminService) UpdateUserRole(ctx context.Context, r *apiv1.UpdateUserRoleRequest) (*apiv1.UpdateUserRoleResponse, error) {
	logger := log.FromContext(ctx)

	// Guard against demoting the last remaining admin (covers self-demotion).
	if r.Role != apiv1.UserRole_USER_ROLE_ADMIN {
		current, err := db.ReadQueries.GetUserById(ctx, r.UserId)
		if err != nil {
			logger.Error("failed to load user for role update", "error", err, "user_id", r.UserId)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		if apiv1.UserRole(current.Role) == apiv1.UserRole_USER_ROLE_ADMIN {
			adminCount, err := db.ReadQueries.CountAdmins(ctx)
			if err != nil {
				logger.Error("failed to count admins", "error", err)
				return nil, connect.NewError(connect.CodeInternal, err)
			}
			if adminCount <= 1 {
				return nil, connect.NewError(connect.CodeFailedPrecondition, fmt.Errorf("cannot remove the last admin"))
			}
		}
	}

	user, err := db.WriteQueries.UpdateUserRole(ctx, database.UpdateUserRoleParams{
		ID:   r.UserId,
		Role: int64(r.Role),
	})
	if err != nil {
		logger.Error("failed to update user role", "error", err, "user_id", r.UserId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user role updated", "user_id", user.ID, "role", user.Role)

	return &apiv1.UpdateUserRoleResponse{
		User: &apiv1.User{
			Id:       user.ID,
			Username: user.Username,
			Email:    user.Email,
			Role:     apiv1.UserRole(user.Role),
		},
	}, nil
}

func (s *AdminService) SetCurrencies(ctx context.Context, r *apiv1.SetCurrenciesRequest) (*apiv1.SetCurrenciesResponse, error) {
	logger := log.FromContext(ctx)

	saved, err := settings.SetCurrencies(ctx, r.Currencies)
	if err != nil {
		logger.Error("failed to set currencies", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("currencies updated", "count", len(saved))

	return &apiv1.SetCurrenciesResponse{Currencies: saved}, nil
}

func (s *AdminService) GetReceiptPrompt(ctx context.Context, r *apiv1.GetReceiptPromptRequest) (*apiv1.GetReceiptPromptResponse, error) {
	return &apiv1.GetReceiptPromptResponse{
		Prompt: settings.GetReceiptPrompt(ctx),
	}, nil
}

func (s *AdminService) SetReceiptPrompt(ctx context.Context, r *apiv1.SetReceiptPromptRequest) (*apiv1.SetReceiptPromptResponse, error) {
	logger := log.FromContext(ctx)

	if err := settings.SetReceiptPrompt(ctx, r.Prompt); err != nil {
		logger.Error("failed to set receipt prompt", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("receipt prompt updated")

	return &apiv1.SetReceiptPromptResponse{Prompt: r.Prompt}, nil
}
