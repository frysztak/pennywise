package user

import (
	"context"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"time"

	"connectrpc.com/connect"
	"github.com/alexedwards/argon2id"
	"github.com/google/uuid"
)

type UserService struct{}

func NewUserService() *UserService {
	return &UserService{}
}

func (s *UserService) UserRegister(ctx context.Context, r *apiv1.UserRegisterRequest) (*apiv1.UserRegisterResponse, error) {
	logger := log.FromContext(ctx)

	hash, err := argon2id.CreateHash(r.Password, argon2id.DefaultParams)
	if err != nil {
		logger.Error("failed to hash password", "error", err, "email", r.Email)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	user, err := db.Queries.CreateUser(ctx, database.CreateUserParams{
		ID:           uuid.NewString(),
		Email:        r.Email,
		Username:     r.Username,
		PasswordHash: &hash,
		CreatedAt:    time.Now(),
		Role:         int64(apiv1.UserRole_USER_ROLE_REGULAR),
	})
	if err != nil {
		logger.Error("failed to create user", "error", err, "email", r.Email, "username", r.Username)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user registered successfully", "user_id", user.ID, "email", user.Email, "username", user.Username)

	return &apiv1.UserRegisterResponse{
		Id:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     apiv1.UserRole(user.Role),
	}, nil
}

func (s *UserService) UserInfo(ctx context.Context, r *apiv1.UserInfoRequest) (*apiv1.UserInfoResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)
	user, err := db.Queries.GetUserById(ctx, session.UserID)

	if err != nil {
		logger.Error("failed to get user info", "error", err, "user_id", session.UserID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user info retrieved", "user_id", user.ID)

	return &apiv1.UserInfoResponse{
		Id:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     apiv1.UserRole(user.Role),
	}, nil
}

func (s *UserService) GetUsers(ctx context.Context, r *apiv1.GetUsersRequest) (*apiv1.GetUsersResponse, error) {
	logger := log.FromContext(ctx)
	users, err := db.Queries.GetUsers(ctx)

	if err != nil {
		logger.Error("failed to get users", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	var responseUsers []*apiv1.GetUsersResponse_User
	for _, user := range users {
		responseUsers = append(responseUsers, &apiv1.GetUsersResponse_User{
			Id:       user.ID,
			Username: user.Username,
			Email:    user.Email,
		})
	}

	logger.Info("users retrieved", "count", len(users))

	return &apiv1.GetUsersResponse{
		Users: responseUsers,
	}, nil
}
