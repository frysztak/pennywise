package log

import (
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/lmittmann/tint"
)

// Global logger instance
var logger *slog.Logger

// Init initializes the global logger based on configuration
func Init(level, format string) {
	var handler slog.Handler

	// Parse log level
	logLevel := parseLevel(level)

	// Create handler based on format
	switch strings.ToLower(format) {
	case "json":
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: logLevel,
		})
	default: // "text" or anything else - use tint for colored output
		handler = tint.NewHandler(os.Stdout, &tint.Options{
			Level:      logLevel,
			TimeFormat: time.Kitchen, // 3:04PM format
		})
	}

	logger = slog.New(handler)
	slog.SetDefault(logger)
}

// parseLevel converts string level to slog.Level
func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Logger returns the global logger instance
func Logger() *slog.Logger {
	if logger == nil {
		// Fallback if Init was not called
		logger = slog.Default()
	}
	return logger
}

// Convenience functions for direct logging
func Debug(msg string, args ...any) {
	Logger().Debug(msg, args...)
}

func Info(msg string, args ...any) {
	Logger().Info(msg, args...)
}

func Warn(msg string, args ...any) {
	Logger().Warn(msg, args...)
}

func Error(msg string, args ...any) {
	Logger().Error(msg, args...)
}
