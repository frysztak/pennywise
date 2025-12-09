package main

import (
	"embed"
	"flag"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"pennywise/config"
	"pennywise/db"
	"pennywise/http/router"

	"github.com/olivere/vite"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

//go:embed all:web/dist
var dist embed.FS

//go:embed all:web/public
var public embed.FS

func main() {
	var (
		isDev = flag.Bool("dev", false, "run in development mode")
	)
	flag.Parse()

	err := config.InitConfig()
	if err != nil {
		log.Fatalf("Failed to parse config: %v", err)
	}

	err = db.InitDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.CloseDB()

	db.RunMigrations()

	mux := http.NewServeMux()
	setupVite(*isDev, mux)
	router.InitRouter(mux)

	addr := ":3333"
	log.Printf("Starting server on %v\n", addr)
	http.ListenAndServe(addr, h2c.NewHandler(mux, &http2.Server{}))
}

func setupVite(isDev bool, mux *http.ServeMux) {
	var appFS, publicFS fs.FS
	if isDev {
		appFS = os.DirFS("./web")
		publicFS = os.DirFS("./web/public")
	} else {
		distFS, err := fs.Sub(dist, "dist")
		if err != nil {
			log.Fatalf("creating sub-filesystem for 'dist' directory: %v", err)
		}
		appFS = distFS

		publicSub, err := fs.Sub(public, "public")
		if err != nil {
			log.Fatalf("creating sub-filesystem for 'public' directory: %v", err)
		}
		publicFS = publicSub
	}

	// Handle requests for Vite-managed assets.
	mux.Handle("/assets/", http.FileServerFS(appFS))

	// Register the endpoints that get served by the frontend.
	fePaths := []string{
		"/",
		"/index.html",
		"/about",
		"/auth/register",
		"/auth/login",
		"/dashboard",
		"/group/{id}",
	}
	feHandler := FrontendHandler(isDev, appFS, publicFS, fePaths...)
	for _, page := range fePaths {
		mux.HandleFunc(page, feHandler)
	}
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

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		viteFragment, err := vite.HTMLFragment(viteConfig)
		if err != nil {
			http.Error(w, "Error instantiating vite fragment", http.StatusInternalServerError)
			return
		}

		tmpl, err := template.New("index").Parse(indexTmpl)
		if err != nil {
			http.Error(w, "Error parsing template", http.StatusInternalServerError)
			return
		}

		if err = tmpl.Execute(w, map[string]interface{}{
			"Title":   "Homepage",
			"Vite":    viteFragment,
			"Scripts": template.HTML(`<script>console.log("Hello from the backend!")</script>`),
		}); err != nil {
			http.Error(w, "Error executing template", http.StatusInternalServerError)
			return
		}
	})
}

var indexTmpl = `<!doctype html>
<html lang="en" class="h-full scroll-smooth">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>{{ .Title }}</title>
	{{ .Vite.Tags }}
 </head>
  <body class="min-h-screen antialiased">
    <div id="root"></div>
	{{ .Scripts }}
  </body>
</html>
`

//go:generate sqlc generate
//go:generate buf generate
