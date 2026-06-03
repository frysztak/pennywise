// Package settings provides typed read/write access to the DB-backed
// app_settings key-value store (currencies, OCR prompt). It centralizes
// JSON (de)serialization, normalization, and fallbacks so HTTP handlers
// stay thin.
package settings

import (
	"context"
	"encoding/json"
	"strings"

	"pennywise/ai"
	"pennywise/db"
	"pennywise/db/database"
)

const (
	KeyCurrencies       = "currencies"
	KeyReceiptOCRPrompt = "receipt_ocr_prompt"
)

// DefaultCurrencies is the fallback list used when the DB row is missing or
// empty. It mirrors the codes seeded by the app_settings migration.
var DefaultCurrencies = []string{
	"USD", "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "CNY", "HKD", "SGD",
	"SEK", "KRW", "NOK", "NZD", "MXN", "INR", "RUB", "BRL", "ZAR", "TRY",
	"DKK", "PLN", "THB", "CZK", "ILS", "HUF", "CLP", "PHP", "AED", "ARS",
}

// GetCurrencies returns the configured currency list, falling back to
// DefaultCurrencies if the setting is missing, empty, or unparseable.
func GetCurrencies(ctx context.Context) []string {
	value, err := db.ReadQueries.GetSetting(ctx, KeyCurrencies)
	if err != nil {
		return DefaultCurrencies
	}

	var currencies []string
	if err := json.Unmarshal([]byte(value), &currencies); err != nil || len(currencies) == 0 {
		return DefaultCurrencies
	}
	return currencies
}

// SetCurrencies normalizes (trim, upper-case, dedup) and persists the list.
// Returns the normalized list that was saved.
func SetCurrencies(ctx context.Context, currencies []string) ([]string, error) {
	normalized := NormalizeCurrencies(currencies)

	encoded, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}

	if err := db.WriteQueries.UpsertSetting(ctx, database.UpsertSettingParams{
		Key:   KeyCurrencies,
		Value: string(encoded),
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

// NormalizeCurrencies trims and upper-cases each code, dropping blanks and
// duplicates while preserving first-seen order.
func NormalizeCurrencies(currencies []string) []string {
	seen := make(map[string]struct{}, len(currencies))
	normalized := make([]string, 0, len(currencies))
	for _, c := range currencies {
		code := strings.ToUpper(strings.TrimSpace(c))
		if code == "" {
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		normalized = append(normalized, code)
	}
	return normalized
}

// GetReceiptPrompt returns the configured OCR prompt, falling back to the
// ai.ReceiptOCRPrompt const if the setting is missing or empty.
func GetReceiptPrompt(ctx context.Context) string {
	value, err := db.ReadQueries.GetSetting(ctx, KeyReceiptOCRPrompt)
	if err != nil || strings.TrimSpace(value) == "" {
		return ai.ReceiptOCRPrompt
	}
	return value
}

// SetReceiptPrompt persists the OCR prompt.
func SetReceiptPrompt(ctx context.Context, prompt string) error {
	return db.WriteQueries.UpsertSetting(ctx, database.UpsertSettingParams{
		Key:   KeyReceiptOCRPrompt,
		Value: prompt,
	})
}
