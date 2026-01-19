package helpers

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"pennywise/config"
	"time"

	"connectrpc.com/connect"
)

const (
	SessionCookie = "pennywise-access-token"
)

func GenerateSessionKey() string {
	key := rand.Text()
	return key
}

// HashSessionToken creates an HMAC-SHA256 hash of a session token.
// The hash is stored in the database, while the plain token is sent to the client.
func HashSessionToken(token string) string {
	h := hmac.New(sha256.New, []byte(config.Config.AuthSecret))
	h.Write([]byte(token))
	return hex.EncodeToString(h.Sum(nil))
}

func SetCookie(w http.ResponseWriter, r *http.Request, name, value string) {
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		MaxAge:   int((365 * 24 * time.Hour).Seconds()),
		Secure:   r.TLS != nil,
		HttpOnly: true,
		Path:     "/",
	}
	http.SetCookie(w, c)
}

func SetConnectCookie(ctx context.Context, name string, value string) error {
	callInfo, ok := connect.CallInfoForHandlerContext(ctx)
	if !ok {
		return errors.New("can't access headers: no CallInfo for handler context")
	}

	c := &http.Cookie{
		Name:     name,
		Value:    value,
		MaxAge:   int((365 * 24 * time.Hour).Seconds()),
		Secure:   true,
		HttpOnly: true,
		Path:     "/",
	}
	callInfo.ResponseHeader().Set("Set-Cookie", c.String())
	return nil
}

func ClearConnectCookie(ctx context.Context, name string) error {
	callInfo, ok := connect.CallInfoForHandlerContext(ctx)
	if !ok {
		return errors.New("can't access headers: no CallInfo for handler context")
	}

	c := &http.Cookie{
		Name:     name,
		Value:    rand.Text(),
		Secure:   true,
		HttpOnly: true,
		Expires:  time.Unix(0, 0),
		Path:     "/",
	}
	callInfo.ResponseHeader().Set("Set-Cookie", c.String())
	return nil
}
