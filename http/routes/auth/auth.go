package auth

import (
	"context"
	"log"
	"pennywise/config"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/jwtauth/v5"
	"golang.org/x/oauth2"
)

var (
	OAuth2Config *oauth2.Config
	OIDCProvider *oidc.Provider
	OIDCVerifier *oidc.IDTokenVerifier
	TokenAuth    *jwtauth.JWTAuth
)

type AuthService struct{}

func NewAuthService() *AuthService {
	return &AuthService{}
}

func InitAuth() {
	tokenAuth := jwtauth.New("HS256", []byte(config.Config.JWTSecret), nil)
	TokenAuth = tokenAuth

	if config.Config.OIDCIssuer != "" {
		ctx := context.Background()
		provider, err := oidc.NewProvider(ctx, config.Config.OIDCIssuer)
		if err != nil {
			log.Fatal(err)
		}
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
