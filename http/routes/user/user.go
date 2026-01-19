package user

import (
	"context"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"time"

	"connectrpc.com/connect"
	"github.com/alexedwards/argon2id"
	"github.com/google/uuid"
	"github.com/jonasdoesthings/plavatar/v3"
	"google.golang.org/protobuf/types/known/timestamppb"
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

	user, err := db.WriteQueries.CreateUser(ctx, database.CreateUserParams{
		ID:           uuid.NewString(),
		Email:        r.Email,
		Username:     r.Username,
		PasswordHash: &hash,
		CreatedAt:    overrides.TextTime{Time: time.Now()},
		Role:         int64(apiv1.UserRole_USER_ROLE_REGULAR),
	})
	if err != nil {
		logger.Error("failed to create user", "error", err, "email", r.Email, "username", r.Username)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	SetDefaultAvatar(ctx, user.ID, user.Email)

	logger.Info("user registered successfully", "user_id", user.ID, "email", user.Email, "username", user.Username)

	return &apiv1.UserRegisterResponse{
		Id:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     apiv1.UserRole(user.Role),
	}, nil
}

// generateDefaultAvatar creates a default avatar using plavatar library based on email
func generateDefaultAvatar(email string) ([]byte, error) {
	generator := plavatar.Generator{}
	options := &plavatar.Options{
		Name:         email, // Use email as seed for deterministic generation
		OutputShape:  plavatar.ShapeSquare,
		OutputFormat: plavatar.FormatSVG,
	}

	avatarBuffer, _, err := generator.GenerateAvatar(generator.Smiley, options)
	if err != nil {
		return nil, err
	}

	return avatarBuffer.Bytes(), nil
}

// SetDefaultAvatar generates and saves a default avatar for a user.
// Errors are logged but not returned - avatar generation is non-critical.
func SetDefaultAvatar(ctx context.Context, userID, email string) {
	logger := log.FromContext(ctx)

	avatarData, err := generateDefaultAvatar(email)
	if err != nil {
		logger.Error("failed to generate default avatar", "error", err, "user_id", userID)
		return
	}

	mimeType := "image/svg+xml"
	now := overrides.NullTextTime{Time: time.Now(), Valid: true}
	err = db.WriteQueries.UpdateUserAvatar(ctx, database.UpdateUserAvatarParams{
		ID:              userID,
		AvatarData:      avatarData,
		AvatarMimeType:  &mimeType,
		AvatarUpdatedAt: now,
	})
	if err != nil {
		logger.Error("failed to save default avatar", "error", err, "user_id", userID)
	}
}

func (s *UserService) UserInfo(ctx context.Context, r *apiv1.UserInfoRequest) (*apiv1.UserInfoResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)
	user, err := db.ReadQueries.GetUserById(ctx, session.UserID)

	if err != nil {
		logger.Error("failed to get user info", "error", err, "user_id", session.UserID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user info retrieved", "user_id", user.ID)

	response := &apiv1.UserInfoResponse{
		Id:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     apiv1.UserRole(user.Role),
	}

	// Add avatar_updated_at if present
	if user.AvatarUpdatedAt.Valid {
		response.AvatarUpdatedAt = timestamppb.New(user.AvatarUpdatedAt.Time)
	}

	return response, nil
}

func (s *UserService) GetUsers(ctx context.Context, r *apiv1.GetUsersRequest) (*apiv1.GetUsersResponse, error) {
	logger := log.FromContext(ctx)
	users, err := db.ReadQueries.GetUsers(ctx)

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

func (s *UserService) UploadAvatar(ctx context.Context, r *apiv1.UploadAvatarRequest) (*apiv1.UploadAvatarResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	now := overrides.NullTextTime{Time: time.Now(), Valid: true}
	err := db.WriteQueries.UpdateUserAvatar(ctx, database.UpdateUserAvatarParams{
		ID:              session.UserID,
		AvatarData:      r.AvatarData,
		AvatarMimeType:  &r.MimeType,
		AvatarUpdatedAt: now,
	})
	if err != nil {
		logger.Error("failed to upload avatar", "error", err, "user_id", session.UserID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("avatar uploaded successfully", "user_id", session.UserID, "size", len(r.AvatarData))

	return &apiv1.UploadAvatarResponse{}, nil
}
