package helpers

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
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

func SetCookie(w http.ResponseWriter, r *http.Request, name, value string) {
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		MaxAge:   int((365 * 24 * time.Hour).Seconds()),
		Secure:   r.TLS != nil,
		HttpOnly: true,
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
