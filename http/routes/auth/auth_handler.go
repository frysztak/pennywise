package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"time"

	"connectrpc.com/connect"
	"github.com/alexedwards/argon2id"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
)

var (
	ErrInvalidPassword = connect.NewError(connect.CodeInvalidArgument, errors.New("invalid password"))
)

func (s *AuthService) LoginWithPassword(ctx context.Context, r *apiv1.LoginWithPasswordRequest) (*apiv1.LoginWithPasswordResponse, error) {
	user, err := db.Queries.GetUserByEmail(ctx, r.Email)
	if err != nil {
		return nil, ErrInvalidPassword
	}

	match, err := argon2id.ComparePasswordAndHash(r.Password, *user.PasswordHash)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if !match {
		return nil, ErrInvalidPassword
	}

	session, err := db.Queries.CreateSession(ctx, database.CreateSessionParams{
		ID:        uuid.NewString(),
		Token:     helpers.GenerateSessionKey(),
		UserID:    user.ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		ExpiredAt: time.Now().Add(24 * time.Hour),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err = helpers.SetConnectCookie(ctx, helpers.SessionCookie, session.Token); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.LoginWithPasswordResponse{
		Id:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     apiv1.UserRole(user.Role),
	}, nil
}

func (s *AuthService) Logout(ctx context.Context, r *emptypb.Empty) (*emptypb.Empty, error) {
	session := helpers.GetSessionInfo(ctx)
	err := db.Queries.DeleteSession(ctx, session.ID)

	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err = helpers.ClearConnectCookie(ctx, helpers.SessionCookie); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &emptypb.Empty{}, nil
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
