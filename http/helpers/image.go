package helpers

import (
	"net/http"
	"strconv"

	"pennywise/storage"
)

// ServeImage writes a storage.ImageFile to the response with ETag and cache headers.
func ServeImage(w http.ResponseWriter, r *http.Request, img *storage.ImageFile) {
	etag := `"` + strconv.FormatInt(img.Mtime.Unix(), 10) + `"`
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", img.ContentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("ETag", etag)
	w.Write(img.Data)
}
