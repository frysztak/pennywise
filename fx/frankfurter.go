// Package fx looks up historical foreign-exchange rates from an external
// provider. The rate is only ever used to *pre-fill* a conversion's rate input
// — it is never trusted blindly and the user can always override or enter a rate
// manually. Conversions persist the rate they were created with, so settlement
// math never depends on a live API call at read time.
package fx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"pennywise/config"
)

// userAgent identifies Pennywise to the FX provider so operators can see who's
// hitting their API and reach out if needed.
const userAgent = "Pennywise/1.0 (+https://github.com/frysztak/pennywise)"

// Rate is a single exchange-rate lookup result.
type Rate struct {
	// Value is the multiplier such that 1 FromCurrency = Value ToCurrency.
	Value float64
	// Date is the business day the rate is actually sourced from. Providers snap
	// to the nearest prior business day, which may differ from the requested day.
	Date time.Time
}

// Provider resolves a historical exchange rate for a given day.
type Provider interface {
	GetRate(ctx context.Context, from, to string, date time.Time) (Rate, error)
}

// New returns the configured FX provider. Only Frankfurter is implemented; the
// FX_API_KEY config is reserved for a future keyed provider.
func New() Provider {
	return NewFrankfurter(config.Config.FXBaseURL)
}

// Frankfurter is a Provider backed by frankfurter.dev (ECB data, keyless).
// Historical rates are immutable, so results are cached in memory by
// (from, to, date).
type Frankfurter struct {
	baseURL string
	client  *http.Client

	mu    sync.Mutex
	cache map[string]Rate
}

func NewFrankfurter(baseURL string) *Frankfurter {
	return &Frankfurter{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 10 * time.Second},
		cache:   make(map[string]Rate),
	}
}

type frankfurterResponse struct {
	Amount float64            `json:"amount"`
	Base   string             `json:"base"`
	Date   string             `json:"date"`
	Rates  map[string]float64 `json:"rates"`
}

func (f *Frankfurter) GetRate(ctx context.Context, from, to string, date time.Time) (Rate, error) {
	// Same-currency conversions are pointless but answer trivially.
	if from == to {
		return Rate{Value: 1, Date: date}, nil
	}

	day := date.Format("2006-01-02")
	key := from + "|" + to + "|" + day

	f.mu.Lock()
	if r, ok := f.cache[key]; ok {
		f.mu.Unlock()
		return r, nil
	}
	f.mu.Unlock()

	endpoint := fmt.Sprintf("%s/%s?base=%s&symbols=%s",
		f.baseURL, day, url.QueryEscape(from), url.QueryEscape(to))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Rate{}, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := f.client.Do(req)
	if err != nil {
		return Rate{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Rate{}, fmt.Errorf("fx provider returned status %d", resp.StatusCode)
	}

	var body frankfurterResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Rate{}, err
	}

	value, ok := body.Rates[to]
	if !ok {
		return Rate{}, fmt.Errorf("fx provider did not return a rate for %s", to)
	}

	rateDate, err := time.Parse("2006-01-02", body.Date)
	if err != nil {
		rateDate = date
	}

	rate := Rate{Value: value, Date: rateDate}

	f.mu.Lock()
	f.cache[key] = rate
	f.mu.Unlock()

	return rate, nil
}
