package avatar

import (
	"database/sql"
	"net/http"

	"pennywise/db"
	"pennywise/log"
)

// HandleAvatar serves user avatars from the database
func HandleAvatar(w http.ResponseWriter, r *http.Request) {
	logger := log.Logger()

	// Extract user ID from path parameter
	userID := r.PathValue("userId")
	if userID == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	logger.Debug("serving avatar", "userId", userID)

	// Fetch the avatar from database
	avatar, err := db.ReadQueries.GetUserAvatar(r.Context(), userID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Avatar not found", http.StatusNotFound)
		} else {
			logger.Error("failed to fetch avatar", "error", err, "userId", userID)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	if avatar.AvatarData == nil || len(avatar.AvatarData) == 0 {
		http.Error(w, "Avatar not found", http.StatusNotFound)
		return
	}

	// Serve the stored avatar
	if avatar.AvatarMimeType != nil && *avatar.AvatarMimeType != "" {
		w.Header().Set("Content-Type", *avatar.AvatarMimeType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	w.Header().Set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
	w.WriteHeader(http.StatusOK)
	w.Write(avatar.AvatarData)
}
