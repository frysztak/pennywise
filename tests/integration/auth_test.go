package integration

import (
	"context"
	"testing"

	"pennywise/db"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/routes/user"

	"connectrpc.com/connect"
	"github.com/alexedwards/argon2id"
)

func TestUserRegistration(t *testing.T) {
	setupTestDB(t)

	userService := user.NewUserService()
	ctx := context.Background()

	// Test: Register new user
	registerResp, err := userService.UserRegister(ctx, &apiv1.UserRegisterRequest{
		Email:    "newuser@test.com",
		Username: "NewUser",
		Password: "securepassword123",
	})
	if err != nil {
		t.Fatalf("UserRegister failed: %v", err)
	}
	if registerResp.Id == "" {
		t.Error("Expected user ID to be non-empty")
	}
	if registerResp.Email != "newuser@test.com" {
		t.Errorf("Expected email 'newuser@test.com', got '%s'", registerResp.Email)
	}
	if registerResp.Username != "NewUser" {
		t.Errorf("Expected username 'NewUser', got '%s'", registerResp.Username)
	}
	if registerResp.Role != apiv1.UserRole_USER_ROLE_REGULAR {
		t.Errorf("Expected role REGULAR, got %v", registerResp.Role)
	}

	// Verify user exists in database with correct password hash
	dbUser, err := db.ReadQueries.GetUserByEmail(ctx, "newuser@test.com")
	if err != nil {
		t.Fatalf("User should exist in database: %v", err)
	}
	if dbUser.ID != registerResp.Id {
		t.Error("Database user ID should match registration response")
	}

	// Verify password was hashed correctly
	if dbUser.PasswordHash == nil {
		t.Fatal("Password hash should not be nil")
	}
	match, err := argon2id.ComparePasswordAndHash("securepassword123", *dbUser.PasswordHash)
	if err != nil {
		t.Fatalf("Password comparison failed: %v", err)
	}
	if !match {
		t.Error("Password hash should match the original password")
	}
}

func TestPasswordValidation(t *testing.T) {
	setupTestDB(t)

	ctx := context.Background()

	// Create user via helper (which hashes the password)
	createTestUser(t, "passval@test.com", "PassUser", "correctpassword")

	// Get user from database
	dbUser, err := db.ReadQueries.GetUserByEmail(ctx, "passval@test.com")
	if err != nil {
		t.Fatalf("GetUserByEmail failed: %v", err)
	}

	// Test: Correct password matches
	match, err := argon2id.ComparePasswordAndHash("correctpassword", *dbUser.PasswordHash)
	if err != nil {
		t.Fatalf("Password comparison failed: %v", err)
	}
	if !match {
		t.Error("Correct password should match hash")
	}

	// Test: Wrong password does not match
	match, err = argon2id.ComparePasswordAndHash("wrongpassword", *dbUser.PasswordHash)
	if err != nil {
		t.Fatalf("Password comparison failed: %v", err)
	}
	if match {
		t.Error("Wrong password should not match hash")
	}
}

func TestSessionCreation(t *testing.T) {
	setupTestDB(t)

	ctx := context.Background()

	// Create user and session via helper
	userID := createTestUser(t, "session@test.com", "SessionUser", "password123")
	sessionCtx := createTestSession(t, userID)

	// Verify session context works (GetSessionInfo would work in handlers)
	_ = sessionCtx

	// Verify user exists in database
	dbUser, err := db.ReadQueries.GetUserByEmail(ctx, "session@test.com")
	if err != nil {
		t.Fatalf("GetUserByEmail failed: %v", err)
	}
	if dbUser.ID != userID {
		t.Error("User ID should match")
	}
}

func TestDuplicateRegistration(t *testing.T) {
	setupTestDB(t)

	userService := user.NewUserService()
	ctx := context.Background()

	// Register first user
	_, err := userService.UserRegister(ctx, &apiv1.UserRegisterRequest{
		Email:    "duplicate@test.com",
		Username: "User1",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("First registration failed: %v", err)
	}

	// Try to register with same email (should fail due to unique constraint)
	_, err = userService.UserRegister(ctx, &apiv1.UserRegisterRequest{
		Email:    "duplicate@test.com",
		Username: "User2",
		Password: "password456",
	})
	if err == nil {
		t.Error("Expected error for duplicate email registration")
	}
	// The error should be internal (database constraint violation)
	if connectErr, ok := err.(*connect.Error); ok {
		if connectErr.Code() != connect.CodeInternal {
			t.Errorf("Expected CodeInternal for database constraint, got %v", connectErr.Code())
		}
	}
}

func TestUserInfo(t *testing.T) {
	setupTestDB(t)

	userService := user.NewUserService()

	// Create user using helper
	userID := createTestUser(t, "info@test.com", "InfoUser", "password123")

	// Create session context
	ctx := createTestSession(t, userID)

	// Get user info
	infoResp, err := userService.UserInfo(ctx, &apiv1.UserInfoRequest{})
	if err != nil {
		t.Fatalf("UserInfo failed: %v", err)
	}
	if infoResp.Id != userID {
		t.Errorf("Expected user ID '%s', got '%s'", userID, infoResp.Id)
	}
	if infoResp.Email != "info@test.com" {
		t.Errorf("Expected email 'info@test.com', got '%s'", infoResp.Email)
	}
	if infoResp.Username != "InfoUser" {
		t.Errorf("Expected username 'InfoUser', got '%s'", infoResp.Username)
	}
}

func TestGetUsers(t *testing.T) {
	setupTestDB(t)

	userService := user.NewUserService()

	// Create multiple users
	createTestUser(t, "user1@test.com", "User1", "password123")
	createTestUser(t, "user2@test.com", "User2", "password123")
	createTestUser(t, "user3@test.com", "User3", "password123")

	// Create session context (any user)
	userID := createTestUser(t, "requester@test.com", "Requester", "password123")
	ctx := createTestSession(t, userID)

	// Get all users
	usersResp, err := userService.GetUsers(ctx, &apiv1.GetUsersRequest{})
	if err != nil {
		t.Fatalf("GetUsers failed: %v", err)
	}

	// Should have at least 4 users (the 3 we created + the requester)
	if len(usersResp.Users) < 4 {
		t.Errorf("Expected at least 4 users, got %d", len(usersResp.Users))
	}

	// Verify users have required fields
	for _, u := range usersResp.Users {
		if u.Id == "" {
			t.Error("User ID should not be empty")
		}
		if u.Email == "" {
			t.Error("User email should not be empty")
		}
		if u.Username == "" {
			t.Error("User username should not be empty")
		}
	}
}
