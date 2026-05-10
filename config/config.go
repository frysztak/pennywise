package config

import (
	"github.com/caarlos0/env/v11"
	_ "github.com/joho/godotenv/autoload"
)

type config struct {
	DBPath               string `env:"DB_PATH,notEmpty"`
	AuthSecret           string `env:"AUTH_SECRET,notEmpty"`
	Port                 string `env:"PORT" envDefault:"3333"`
	OIDCIssuer           string `env:"OIDC_ISSUER"`
	OIDCClientId         string `env:"OIDC_CLIENT_ID"`
	OIDCClientSecret     string `env:"OIDC_CLIENT_SECRET"`
	OIDCRedirectUrl      string `env:"OIDC_REDIRECT_URL"`
	RegistrationEnabled  bool   `env:"REGISTRATION_ENABLED" envDefault:"true"`
	PasswordLoginEnabled bool   `env:"PASSWORD_LOGIN_ENABLED" envDefault:"true"`
	OpenAIBaseUrl        string `env:"OPENAI_BASE_URL"`
	OpenAIAPIKey         string `env:"OPENAI_API_KEY"`
	OpenAIOCRModel       string `env:"OPENAI_OCR_MODEL"`
	LogLevel             string `env:"LOG_LEVEL" envDefault:"info"`
	LogFormat            string `env:"LOG_FORMAT" envDefault:"text"`
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

// OIDCEnabled returns true if all required OIDC configuration values are set
func (c *config) OIDCEnabled() bool {
	return c.OIDCIssuer != "" &&
		c.OIDCClientId != "" &&
		c.OIDCClientSecret != "" &&
		c.OIDCRedirectUrl != ""
}
