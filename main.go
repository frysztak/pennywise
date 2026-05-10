package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io/fs"
	stdlog "log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"pennywise/config"
	"pennywise/db"
	"pennywise/http/router"
	"pennywise/log"
	"runtime/debug"
	"sync"
	"syscall"
	"time"

	"github.com/olivere/vite"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

//go:embed all:web/dist
var dist embed.FS

//go:embed all:web/public
var public embed.FS

//go:embed web/index.gohtml
var indexTmpl string

// Version is the app build version. Override at build time with
//
//	go build -ldflags "-X main.Version=v0.14.2"
//
// Otherwise it falls back to VCS info embedded by the Go toolchain.
var Version = "dev"

var versionOnce sync.Once

func appVersion() string {
	versionOnce.Do(func() {
		if Version != "dev" {
			return
		}
		info, ok := debug.ReadBuildInfo()
		if !ok {
			return
		}
		var revision, modified string
		for _, s := range info.Settings {
			switch s.Key {
			case "vcs.revision":
				revision = s.Value
			case "vcs.modified":
				modified = s.Value
			}
		}
		if revision == "" {
			return
		}
		if len(revision) > 7 {
			revision = revision[:7]
		}
		Version = revision
		if modified == "true" {
			Version += "-dirty"
		}
	})
	return Version
}

func main() {
	var (
		isDev = flag.Bool("dev", false, "run in development mode")
	)
	flag.Parse()

	err := config.InitConfig()
	if err != nil {
		stdlog.Fatalf("Failed to parse config: %v", err)
	}

	// Initialize logger
	log.Init(config.Config.LogLevel, config.Config.LogFormat)

	err = db.InitDB()
	if err != nil {
		stdlog.Fatalf("Failed to connect to database: %v", err)
	}

	db.RunMigrations()

	mux := http.NewServeMux()
	setupVite(*isDev, mux)
	router.InitRouter(mux)

	// Create HTTP server
	addr := fmt.Sprintf(":%s", config.Config.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: h2c.NewHandler(mux, &http2.Server{}),
	}

	// Channel to listen for shutdown signals
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	// Start server in a goroutine
	serverErrors := make(chan error, 1)
	go func() {
		log.Info("Starting server", "addr", addr, "dev_mode", *isDev)
		serverErrors <- srv.ListenAndServe()
	}()

	// Wait for shutdown signal or server error
	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			stdlog.Fatalf("Server error: %v", err)
		}
	case sig := <-shutdown:
		log.Info("Received shutdown signal", "signal", sig)

		// Create context with timeout for graceful shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		// Attempt graceful shutdown
		if err := srv.Shutdown(ctx); err != nil {
			log.Error("Failed to gracefully shutdown server", "error", err)
			if err := srv.Close(); err != nil {
				log.Error("Failed to force close server", "error", err)
			}
		} else {
			log.Info("Server shutdown gracefully")
		}

		// Close database connections
		db.CloseDB()
	}
}

func setupVite(isDev bool, mux *http.ServeMux) {
	var appFS, publicFS fs.FS
	if isDev {
		appFS = os.DirFS("./web")
		publicFS = os.DirFS("./web/public")
	} else {
		distFS, err := fs.Sub(dist, "web/dist")
		if err != nil {
			stdlog.Fatalf("creating sub-filesystem for 'dist' directory: %v", err)
		}
		appFS = distFS

		publicSub, err := fs.Sub(public, "web/public")
		if err != nil {
			stdlog.Fatalf("creating sub-filesystem for 'public' directory: %v", err)
		}
		publicFS = publicSub
	}

	// Handle requests for Vite-managed assets.
	mux.Handle("/assets/", http.FileServerFS(appFS))

	// Register the endpoints that get served by the frontend.
	fePaths := []string{
		"/{$}",
		"/index.html",
		"/about",
		"/auth/register",
		"/auth/login",
		"/dashboard",
		"/group/{id}",
		"/scan-receipt",
		"/debug-error",
	}
	feHandler := FrontendHandler(isDev, appFS, publicFS, fePaths...)
	for _, page := range fePaths {
		mux.HandleFunc(page, feHandler)
	}

	// Catch-all for static files (favicons, manifest, etc.)
	// In dev mode, public files are in a separate directory; in prod, Vite copies them to dist
	mux.HandleFunc("/{path...}", func(w http.ResponseWriter, r *http.Request) {
		if isDev {
			// Try publicFS first for files like logo.svg, favicon.ico, etc.
			filePath := filepath.Base(r.URL.Path)
			if f, err := publicFS.Open(filePath); err == nil {
				f.Close()
				http.ServeFileFS(w, r, publicFS, filePath)
				return
			}
		}
		http.FileServerFS(appFS).ServeHTTP(w, r)
	})
}

// FrontendConfig holds configuration values passed to the frontend
type FrontendConfig struct {
	OIDCEnabled            bool   `json:"oidcEnabled"`
	OIDCProviderName       string `json:"oidcProviderName,omitempty"`
	RegistrationEnabled    bool   `json:"registrationEnabled"`
	PasswordLoginEnabled   bool   `json:"passwordLoginEnabled"`
	ReceiptScanningEnabled bool   `json:"receiptScanningEnabled"`
	AppVersion             string `json:"appVersion"`
}

func FrontendHandler(isDev bool, appFS, publicFS fs.FS, paths ...string) http.HandlerFunc {
	viteConfig := vite.Config{
		FS:           appFS,
		IsDev:        isDev,
		ViteTemplate: vite.React,
	}
	if isDev {
		viteConfig.ViteURL = "http://localhost:5173"
	}

	// Build frontend config and serialize to JSON
	feConfig := FrontendConfig{
		OIDCEnabled:            config.Config.OIDCEnabled(),
		OIDCProviderName:       config.Config.OIDCProviderName,
		RegistrationEnabled:    config.Config.RegistrationEnabled,
		PasswordLoginEnabled:   config.Config.PasswordLoginEnabled,
		ReceiptScanningEnabled: config.Config.ReceiptScanningEnabled(),
		AppVersion:             appVersion(),
	}
	configJSON, err := json.Marshal(feConfig)
	if err != nil {
		stdlog.Fatalf("Failed to marshal frontend config: %v", err)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, path := range paths {
			if r.Pattern == path {
				viteFragment, err := vite.HTMLFragment(viteConfig)
				if err != nil {
					stdlog.Fatalf("Error instantiating vite fragment: %v", err)
					http.Error(w, "Error instantiating vite fragment", http.StatusInternalServerError)
					return
				}

				tmpl, err := template.New("index").Parse(indexTmpl)
				if err != nil {
					stdlog.Fatalf("Error parsing template: %v", err)
					http.Error(w, "Error parsing template", http.StatusInternalServerError)
					return
				}

				if err = tmpl.Execute(w, map[string]any{
					"Vite":       viteFragment,
					"ConfigJSON": template.JS(configJSON),
				}); err != nil {
					stdlog.Fatalf("Error executing template: %v", err)
					http.Error(w, "Error executing template", http.StatusInternalServerError)
					return
				}
				return
			}
		}

		// Serve the public files generated by Vite. By default, these files are
		// referenced in the DOM with a root-relative URL format (e.g. '/file.ext').
		http.ServeFileFS(w, r, publicFS, filepath.Base(r.URL.Path))
	})
}

//go:generate sqlc generate
//go:generate buf generate
