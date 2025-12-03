package config

import (
	"github.com/caarlos0/env/v11"
	_ "github.com/joho/godotenv/autoload"
)

type config struct {
	DBPath           string `env:"DB_PATH,notEmpty"`
	JWTSecret        string `env:"JWT_SECRET,notEmpty"`
	OIDCIssuer       string `env:"OIDC_ISSUER"`
	OIDCClientId     string `env:"OIDC_CLIENT_ID"`
	OIDCClientSecret string `env:"OIDC_CLIENT_SECRET"`
	OIDCRedirectUrl  string `env:"OIDC_REDIRECT_URL"`
}

// Global variables to hold the config
var (
	Config *config
)

func InitConfig() error {
	c := config{}

	err := env.Parse(&c)
	Config = &c

	return err
}
