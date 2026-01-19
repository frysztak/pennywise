package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"log"
	"net/http"
	"pennywise/config"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	logPkg "pennywise/log"
	userPkg "pennywise/http/routes/user"
	"time"

	"connectrpc.com/connect"
	"github.com/alexedwards/argon2id"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
)

var (
	OAuth2Config *oauth2.Config
	OIDCProvider *oidc.Provider
	OIDCVerifier *oidc.IDTokenVerifier
	TokenAuth    *jwtauth.JWTAuth

	ErrInvalidPassword = connect.NewError(connect.CodeInvalidArgument, errors.New("invalid password"))
)

// OIDCClaims represents the claims extracted from an OIDC ID token
type OIDCClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Subject       string `json:"sub"`
}

type AuthService struct{}

func NewAuthService() *AuthService {
	return &AuthService{}
}

func InitOIDCAuth() {
	if config.Config.OIDCIssuer != "" {
		ctx := context.Background()
		provider, err := oidc.NewProvider(ctx, config.Config.OIDCIssuer)
		if err != nil {
			log.Fatal(err)
		}
		OIDCProvider = provider

		oidcConfig := &oidc.Config{
			ClientID: config.Config.OIDCClientId,
		}

		verifier := provider.Verifier(oidcConfig)
		OIDCVerifier = verifier

		oauth2Config := oauth2.Config{
			ClientID:     config.Config.OIDCClientId,
			ClientSecret: config.Config.OIDCClientSecret,
			RedirectURL:  config.Config.OIDCRedirectUrl,

			// Discovery returns the OAuth2 endpoints.
			Endpoint: provider.Endpoint(),

			// "openid" is a required scope for OpenID Connect flows.
			Scopes: []string{oidc.ScopeOpenID, "profile", "email"},
		}
		OAuth2Config = &oauth2Config
	}
}

func (s *AuthService) LoginWithPassword(ctx context.Context, r *apiv1.LoginWithPasswordRequest) (*apiv1.LoginWithPasswordResponse, error) {
	logger := logPkg.FromContext(ctx)

	user, err := db.ReadQueries.GetUserByEmail(ctx, r.Email)
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

	plainToken := helpers.GenerateSessionKey()
	hashedToken := helpers.HashSessionToken(plainToken)

	_, err = db.WriteQueries.CreateSession(ctx, database.CreateSessionParams{
		ID:        uuid.NewString(),
		Token:     hashedToken,
		UserID:    user.ID,
		CreatedAt: overrides.TextTime{Time: time.Now()},
		UpdatedAt: overrides.TextTime{Time: time.Now()},
		ExpiredAt: overrides.TextTime{Time: time.Now().Add(24 * time.Hour)},
	})
	if err != nil {
		logger.Error("failed to create session", "error", err, "user_id", user.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err = helpers.SetConnectCookie(ctx, helpers.SessionCookie, plainToken); err != nil {
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
	logger := logPkg.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	err := db.WriteQueries.DeleteSession(ctx, session.ID)
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
}

func HandlerOIDCCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logger := logPkg.FromContext(ctx)

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

	// Extract claims from ID token
	var claims OIDCClaims
	if err := idToken.Claims(&claims); err != nil {
		logger.Error("failed to parse ID token claims", "error", err)
		http.Error(w, "Failed to parse ID token claims", http.StatusInternalServerError)
		return
	}

	// If email not in ID token, fetch from userinfo endpoint
	if claims.Email == "" {
		userInfo, err := OIDCProvider.UserInfo(ctx, oauth2.StaticTokenSource(oauth2Token))
		if err != nil {
			logger.Error("failed to fetch userinfo", "error", err)
			http.Error(w, "Failed to fetch user info", http.StatusInternalServerError)
			return
		}
		if err := userInfo.Claims(&claims); err != nil {
			logger.Error("failed to parse userinfo claims", "error", err)
			http.Error(w, "Failed to parse user info claims", http.StatusInternalServerError)
			return
		}
	}

	if claims.Email == "" {
		logger.Warn("no email claim found in ID token or userinfo", "subject", claims.Subject)
		http.Error(w, "Email claim not found", http.StatusBadRequest)
		return
	}

	// Check if user exists, if not create them
	user, err := db.ReadQueries.GetUserByEmail(ctx, claims.Email)
	if err != nil {
		// User doesn't exist, create them
		username := claims.Name
		if username == "" {
			username = claims.Email // Fallback to email if name is not provided
		}

		user, err = db.WriteQueries.CreateUser(ctx, database.CreateUserParams{
			ID:           uuid.NewString(),
			Email:        claims.Email,
			Username:     username,
			PasswordHash: nil, // OIDC users don't have a password
			CreatedAt:    overrides.TextTime{Time: time.Now()},
			Role:         int64(apiv1.UserRole_USER_ROLE_REGULAR),
		})
		if err != nil {
			logger.Error("failed to create OIDC user", "error", err, "email", claims.Email)
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}

		userPkg.SetDefaultAvatar(ctx, user.ID, user.Email)
		logger.Info("created new OIDC user", "user_id", user.ID, "email", user.Email)
	}

	plainToken := helpers.GenerateSessionKey()
	hashedToken := helpers.HashSessionToken(plainToken)

	_, err = db.WriteQueries.CreateSession(ctx, database.CreateSessionParams{
		ID:        uuid.NewString(),
		Token:     hashedToken,
		UserID:    user.ID,
		CreatedAt: overrides.TextTime{Time: time.Now()},
		UpdatedAt: overrides.TextTime{Time: time.Now()},
		ExpiredAt: overrides.TextTime{Time: time.Now().Add(24 * time.Hour)},
	})
	if err != nil {
		logger.Error("failed to create session for OIDC user", "error", err, "user_id", user.ID)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	helpers.SetCookie(w, r, helpers.SessionCookie, plainToken)

	logger.Info("OIDC login successful", "user_id", user.ID, "email", user.Email)

	// Redirect to dashboard
	http.Redirect(w, r, "/dashboard", http.StatusFound)
}
