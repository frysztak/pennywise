package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"time"

	"connectrpc.com/connect"
	"github.com/alexedwards/argon2id"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
)

var (
	ErrInvalidPassword = connect.NewError(connect.CodeInvalidArgument, errors.New("invalid password"))
)

func (s *AuthService) LoginWithPassword(ctx context.Context, r *apiv1.LoginWithPasswordRequest) (*apiv1.LoginWithPasswordResponse, error) {
	logger := log.FromContext(ctx)

	user, err := db.Queries.GetUserByEmail(ctx, r.Email)
	if err != nil {
		logger.Warn("login attempt failed - user not found", "email", r.Email)
		return nil, ErrInvalidPassword
	}

	match, err := argon2id.ComparePasswordAndHash(r.Password, *user.PasswordHash)
	if err != nil {
		logger.Error("password hash comparison error", "error", err, "user_id", user.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if !match {
		logger.Warn("login attempt failed - invalid password", "email", r.Email, "user_id", user.ID)
		return nil, ErrInvalidPassword
	}

	session, err := db.Queries.CreateSession(ctx, database.CreateSessionParams{
		ID:        uuid.NewString(),
		Token:     helpers.GenerateSessionKey(),
		UserID:    user.ID,
		CreatedAt: overrides.TextTime{Time: time.Now()},
		UpdatedAt: overrides.TextTime{Time: time.Now()},
		ExpiredAt: overrides.TextTime{Time: time.Now().Add(24 * time.Hour)},
	})
	if err != nil {
		logger.Error("failed to create session", "error", err, "user_id", user.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err = helpers.SetConnectCookie(ctx, helpers.SessionCookie, session.Token); err != nil {
		logger.Error("failed to set session cookie", "error", err, "user_id", user.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user logged in successfully", "user_id", user.ID, "email", user.Email)

	return &apiv1.LoginWithPasswordResponse{
		Id:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     apiv1.UserRole(user.Role),
	}, nil
}

func (s *AuthService) Logout(ctx context.Context, r *apiv1.LogoutRequest) (*apiv1.LogoutResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	err := db.Queries.DeleteSession(ctx, session.ID)
	if err != nil {
		logger.Error("failed to delete session", "error", err, "session_id", session.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err = helpers.ClearConnectCookie(ctx, helpers.SessionCookie); err != nil {
		logger.Error("failed to clear session cookie", "error", err, "session_id", session.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user logged out successfully", "user_id", session.UserID)

	return &apiv1.LogoutResponse{}, nil
}

func insertSession(r *http.Request) {
	db.Queries.CreateSession(r.Context(), database.CreateSessionParams{
		Token: helpers.GenerateSessionKey(),
	})

}

func setCallbackCookie(w http.ResponseWriter, r *http.Request, name, value string) {
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		MaxAge:   int(time.Hour.Seconds()),
		Secure:   r.TLS != nil,
		HttpOnly: true,
	}
	http.SetCookie(w, c)
}

func HandlerOIDCLogin(w http.ResponseWriter, r *http.Request) {
	state := rand.Text()
	nonce := rand.Text()
	setCallbackCookie(w, r, "state", state)
	setCallbackCookie(w, r, "nonce", nonce)

	http.Redirect(w, r, OAuth2Config.AuthCodeURL(state, oidc.Nonce(nonce)), http.StatusFound)

	// For debugging/example purposes, we generate and print
	// a sample jwt token with claims `user_id:123` here:
	// _, tokenString, _ := auth.TokenAuth.Encode(map[string]interface{}{"user_id": 123})
	// fmt.Printf("DEBUG: a sample jwt is %s\n\n", tokenString)
}

func HandlerOIDCCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state, err := r.Cookie("state")
	if err != nil {
		http.Error(w, "state not found", http.StatusBadRequest)
		return
	}
	if r.URL.Query().Get("state") != state.Value {
		http.Error(w, "state did not match", http.StatusBadRequest)
		return
	}

	oauth2Token, err := OAuth2Config.Exchange(ctx, r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "Failed to exchange token: "+err.Error(), http.StatusInternalServerError)
		return
	}
	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "No id_token field in oauth2 token.", http.StatusInternalServerError)
		return
	}
	idToken, err := OIDCVerifier.Verify(ctx, rawIDToken)
	if err != nil {
		http.Error(w, "Failed to verify ID Token: "+err.Error(), http.StatusInternalServerError)
		return
	}

	nonce, err := r.Cookie("nonce")
	if err != nil {
		http.Error(w, "nonce not found", http.StatusBadRequest)
		return
	}
	if idToken.Nonce != nonce.Value {
		http.Error(w, "nonce did not match", http.StatusBadRequest)
		return
	}

	// TODO: register user if needed
	// TODO: return JWT token
}
