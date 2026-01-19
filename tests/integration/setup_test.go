package integration

import (
	"context"
	"database/sql"
	"pennywise/config"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	"pennywise/log"
	"testing"
	"time"

	"connectrpc.com/authn"
	"github.com/alexedwards/argon2id"
	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupTestDB(t *testing.T) {
	t.Helper()

	// Silence goose logging during tests
	goose.SetLogger(goose.NopLogger())

	// Use shared cache so multiple connections see the same in-memory DB
	connectionUrl := "file::memory:?cache=shared&_txlock=immediate&_journal_mode=WAL&_foreign_keys=true"

	writeDB, err := sql.Open("sqlite3", connectionUrl)
	if err != nil {
		t.Fatalf("failed to open write db: %v", err)
	}
	writeDB.SetMaxOpenConns(1)
	writeDB.SetMaxIdleConns(1)

	readDB, err := sql.Open("sqlite3", connectionUrl)
	if err != nil {
		t.Fatalf("failed to open read db: %v", err)
	}
	readDB.SetMaxOpenConns(4)
	readDB.SetMaxIdleConns(4)

	// Set global db variables
	db.WriteDB = writeDB
	db.ReadDB = readDB
	db.WriteQueries = database.New(writeDB)
	db.ReadQueries = database.New(readDB)

	// Run migrations from embedded SQL
	goose.SetBaseFS(db.GetMigrationFS())
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatalf("failed to set goose dialect: %v", err)
	}
	if err := goose.Up(writeDB, "schema"); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	// Initialize logger to discard output during tests
	log.Init("error", "text")

	// Initialize config for tests with registration enabled
	t.Setenv("DB_PATH", ":memory:")
	t.Setenv("AUTH_SECRET", "test-secret")
	if err := config.InitConfig(); err != nil {
		t.Fatalf("failed to init config: %v", err)
	}

	t.Cleanup(func() {
		writeDB.Close()
		readDB.Close()
	})
}

// createTestUser creates a user and returns their ID
func createTestUser(t *testing.T, email, username, password string) string {
	t.Helper()

	hash, err := argon2id.CreateHash(password, argon2id.DefaultParams)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	user, err := db.WriteQueries.CreateUser(context.Background(), database.CreateUserParams{
		ID:           uuid.NewString(),
		Email:        email,
		Username:     username,
		PasswordHash: &hash,
		CreatedAt:    overrides.TextTime{Time: time.Now()},
		Role:         1, // Regular user
	})
	if err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	return user.ID
}

// createTestGroup creates a group with the given creator and returns the group ID
func createTestGroup(t *testing.T, creatorID, name, currency string) string {
	t.Helper()

	description := "Test group description"
	group, err := db.WriteQueries.CreateGroup(context.Background(), database.CreateGroupParams{
		ID:              uuid.NewString(),
		Name:            name,
		Description:     &description,
		CreatedBy:       creatorID,
		CreatedAt:       overrides.TextTime{Time: time.Now()},
		DefaultCurrency: currency,
	})
	if err != nil {
		t.Fatalf("failed to create test group: %v", err)
	}

	// Add creator to the group
	_, err = db.WriteQueries.AddUserToGroup(context.Background(), database.AddUserToGroupParams{
		UserID:  creatorID,
		GroupID: group.ID,
		Weight:  1.0,
		AddedAt: overrides.TextTime{Time: time.Now()},
	})
	if err != nil {
		t.Fatalf("failed to add creator to group: %v", err)
	}

	return group.ID
}

// addUserToGroup adds a user to a group with the specified weight
func addUserToGroup(t *testing.T, userID, groupID string, weight float64) {
	t.Helper()

	_, err := db.WriteQueries.AddUserToGroup(context.Background(), database.AddUserToGroupParams{
		UserID:  userID,
		GroupID: groupID,
		Weight:  weight,
		AddedAt: overrides.TextTime{Time: time.Now()},
	})
	if err != nil {
		t.Fatalf("failed to add user to group: %v", err)
	}
}

// createTestSession creates a session for the user and returns a context with the session
func createTestSession(t *testing.T, userID string) context.Context {
	t.Helper()

	session, err := db.WriteQueries.CreateSession(context.Background(), database.CreateSessionParams{
		ID:        uuid.NewString(),
		Token:     uuid.NewString(),
		UserID:    userID,
		CreatedAt: overrides.TextTime{Time: time.Now()},
		UpdatedAt: overrides.TextTime{Time: time.Now()},
		ExpiredAt: overrides.TextTime{Time: time.Now().Add(24 * time.Hour)},
	})
	if err != nil {
		t.Fatalf("failed to create test session: %v", err)
	}

	// Inject session into context using authn middleware
	ctx := authn.SetInfo(context.Background(), session)
	return ctx
}

// amount converts a decimal value to smallest currency unit (e.g., 12.34 → 1234)
func amount(value float64) int64 {
	return int64(value * 100)
}

// fromCents converts cents to decimal for display
func fromCents(cents int64) float64 {
	return float64(cents) / 100
}
