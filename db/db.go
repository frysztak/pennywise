package db

import (
	"database/sql"
	"embed"
	"fmt"
	"net/url"
	"pennywise/config"
	sqlc "pennywise/db/database"
	"pennywise/log"
	"runtime"

	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
)

// Global variables to hold the database and queries
// Separate connection pools for reads and writes for optimal SQLite performance
var (
	// WriteDB is the write connection pool (max 1 connection for SQLite)
	WriteDB *sql.DB
	// ReadDB is the read connection pool (scales with CPU count)
	ReadDB *sql.DB

	// WriteQueries handles all write operations (INSERT, UPDATE, DELETE)
	WriteQueries *sqlc.Queries
	// ReadQueries handles all read operations (SELECT)
	ReadQueries *sqlc.Queries
)

func InitDB() error {
	// Build connection URL with SQLite best practices
	// WAL mode is essential for concurrent reads
	connectionUrlParams := make(url.Values)
	connectionUrlParams.Add("_txlock", "immediate")
	connectionUrlParams.Add("_journal_mode", "WAL")
	connectionUrlParams.Add("_busy_timeout", "5000")
	connectionUrlParams.Add("_synchronous", "NORMAL")
	connectionUrlParams.Add("_cache_size", "-16384") // 16MB cache (negative value = KB)
	connectionUrlParams.Add("_foreign_keys", "true")

	connectionUrl := fmt.Sprintf("file:%s?%s", config.Config.DBPath, connectionUrlParams.Encode())

	// Create write connection pool
	// SQLite only supports one concurrent writer, so limit to 1 connection
	writeDB, err := sql.Open("sqlite3", connectionUrl)
	if err != nil {
		return fmt.Errorf("could not open write db: %w", err)
	}

	writeDB.SetMaxOpenConns(1)
	writeDB.SetMaxIdleConns(1)
	writeDB.SetConnMaxLifetime(0) // Connections never expire

	if err := writeDB.Ping(); err != nil {
		return fmt.Errorf("could not connect to write db: %w", err)
	}

	// Create read connection pool
	// SQLite in WAL mode supports multiple concurrent readers
	// Scale with CPU count for optimal parallel query performance
	readDB, err := sql.Open("sqlite3", connectionUrl)
	if err != nil {
		return fmt.Errorf("could not open read db: %w", err)
	}

	numCPU := runtime.NumCPU()
	readDB.SetMaxOpenConns(numCPU)
	readDB.SetMaxIdleConns(numCPU)
	readDB.SetConnMaxLifetime(0) // Connections never expire

	if err := readDB.Ping(); err != nil {
		return fmt.Errorf("could not connect to read db: %w", err)
	}

	// Set global variables
	WriteDB = writeDB
	ReadDB = readDB

	// Initialize sqlc Queries with both connection pools
	WriteQueries = sqlc.New(WriteDB)
	ReadQueries = sqlc.New(ReadDB)

	log.Info("Successfully connected to database", "write_conns", 1, "read_conns", numCPU)
	return nil
}

func CloseDB() {
	// Checkpoint WAL to ensure all data is persisted to main database file
	if WriteDB != nil {
		log.Info("Checkpointing WAL before shutdown")
		if _, err := WriteDB.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
			log.Warn("Failed to checkpoint WAL", "error", err)
		}

		if err := WriteDB.Close(); err != nil {
			log.Error("Error closing write database", "error", err)
		} else {
			log.Info("Write database connection closed")
		}
	}

	if ReadDB != nil {
		if err := ReadDB.Close(); err != nil {
			log.Error("Error closing read database", "error", err)
		} else {
			log.Info("Read database connection closed")
		}
	}
}

//go:embed schema/*.sql
var embedMigrations embed.FS

// GetMigrationFS returns the embedded migration filesystem for testing
func GetMigrationFS() embed.FS {
	return embedMigrations
}

func RunMigrations() {
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite3"); err != nil {
		panic(err)
	}

	if err := goose.Up(WriteDB, "schema"); err != nil {
		panic(err)
	}
}
