package avatar

import (
	"errors"
	"io/fs"
	"net/http"

	"pennywise/http/helpers"
	"pennywise/log"
	"pennywise/storage"
)

// HandleAvatar serves user avatars from filesystem blob storage.
func HandleAvatar(w http.ResponseWriter, r *http.Request) {
	logger := log.Logger()

	userID := r.PathValue("userId")
	if userID == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	logger.Debug("serving avatar", "userId", userID)

	img, err := storage.Blobs.LoadAvatar(userID)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			http.Error(w, "Avatar not found", http.StatusNotFound)
		} else {
			logger.Error("failed to load avatar", "error", err, "userId", userID)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	helpers.ServeImage(w, r, img)
}
