package db

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"net/url"
	"pennywise/config"
	sqlc "pennywise/db/database"

	"github.com/pressly/goose/v3"
	_ "github.com/mattn/go-sqlite3"
)

// Global variables to hold the database and queries
var (
	DB      *sql.DB
	Queries *sqlc.Queries
)

func InitDB() error {
	// Build connection URL with SQLite best practices
	connectionUrlParams := make(url.Values)
	connectionUrlParams.Add("_txlock", "immediate")
	connectionUrlParams.Add("_journal_mode", "WAL")
	connectionUrlParams.Add("_busy_timeout", "5000")
	connectionUrlParams.Add("_synchronous", "NORMAL")
	connectionUrlParams.Add("_cache_size", "-16384") // 16MB cache (negative value = KB)
	connectionUrlParams.Add("_foreign_keys", "true")

	connectionUrl := fmt.Sprintf("file:%s?%s", config.Config.DBPath, connectionUrlParams.Encode())

	db, err := sql.Open("sqlite3", connectionUrl)
	if err != nil {
		return fmt.Errorf("could not open db: %w", err)
	}

	if err := db.Ping(); err != nil {
		return fmt.Errorf("could not connect to db: %w", err)
	}

	DB = db
	Queries = sqlc.New(DB) // Initialize sqlc Queries with the database connection

	log.Println("Successfully connected to the database")
	return nil
}

func CloseDB() {
	if DB != nil {
		DB.Close()
		log.Println("Database connection closed")
	}
}

//go:embed schema/*.sql
var embedMigrations embed.FS

func RunMigrations() {
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite3"); err != nil {
		panic(err)
	}

	if err := goose.Up(DB, "schema"); err != nil {
		panic(err)
	}
}
