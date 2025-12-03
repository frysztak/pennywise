package db

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"pennywise/config"
	sqlc "pennywise/db/database"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

// Global variables to hold the database and queries
var (
	DB      *sql.DB
	Queries *sqlc.Queries
)

func InitDB() error {
	db, err := sql.Open("sqlite", config.Config.DBPath)
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

	if err := goose.SetDialect("sqlite"); err != nil {
		panic(err)
	}

	if err := goose.Up(DB, "schema"); err != nil {
		panic(err)
	}
}
