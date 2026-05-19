// Package splitwise reads a Splitwise CSV export and produces a migrate.Plan
// that can be applied to a Pennywise database. The file is fully parsed during
// Open; subsequent calls perform no I/O.
package splitwise

import (
	"context"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"pennywise/migrate"
)

// SourceName is the identifier used to select this backend from the CLI.
const SourceName = "splitwise"

// expenseRow is an internal representation of a single Splitwise CSV data row.
type expenseRow struct {
	Date        time.Time
	Description string
	Amount      float64
	Currency    string
	// Shares holds the per-member net balance change (negative = paid, positive = owes).
	// Index corresponds to Source.members.
	Shares []float64
}

// Source is a fully-parsed Splitwise CSV export. It implements migrate.Source.
type Source struct {
	projectID       string
	projectName     string
	defaultCurrency string
	members         []string    // column header names, in file order
	expenses        []expenseRow
}

// Open parses a Splitwise CSV export file. All data is read during Open.
func Open(path string) (*Source, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open splitwise csv: %w", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.TrimLeadingSpace = true
	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("parse csv: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("csv is empty")
	}

	// Header: Data,Opis,Kategoria,Koszt,Waluta,<member1>,<member2>,...
	header := records[0]
	if len(header) < 6 {
		return nil, fmt.Errorf("csv header has %d columns, expected at least 6 (date, desc, category, cost, currency, ≥1 member)", len(header))
	}
	members := make([]string, len(header)-5)
	for i, name := range header[5:] {
		members[i] = strings.TrimSpace(name)
	}

	projectName := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))

	var expenses []expenseRow
	for i, rec := range records[1:] {
		if isAllEmpty(rec) {
			continue
		}
		// Pad short rows so index access is safe.
		for len(rec) < len(header) {
			rec = append(rec, "")
		}

		dateStr := strings.TrimSpace(rec[0])
		if dateStr == "" {
			continue
		}
		amtStr := strings.TrimSpace(rec[3])
		if amtStr == "" {
			// Balance summary rows (e.g. "Całkowite saldo") have no cost value.
			continue
		}

		date, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			return nil, fmt.Errorf("row %d: parse date %q: %w", i+2, dateStr, err)
		}
		amount, err := strconv.ParseFloat(amtStr, 64)
		if err != nil {
			return nil, fmt.Errorf("row %d: parse amount %q: %w", i+2, amtStr, err)
		}
		currency := strings.TrimSpace(rec[4])
		if currency == "" {
			return nil, fmt.Errorf("row %d: missing currency", i+2)
		}

		shares := make([]float64, len(members))
		for j := range members {
			s := strings.TrimSpace(rec[5+j])
			if s == "" {
				continue
			}
			v, err := strconv.ParseFloat(s, 64)
			if err != nil {
				return nil, fmt.Errorf("row %d, member %d: parse share %q: %w", i+2, j, s, err)
			}
			shares[j] = v
		}

		expenses = append(expenses, expenseRow{
			Date:        date,
			Description: strings.TrimSpace(rec[1]),
			Amount:      amount,
			Currency:    currency,
			Shares:      shares,
		})
	}

	return &Source{
		projectID:       projectName,
		projectName:     projectName,
		defaultCurrency: mostFrequentCurrency(expenses),
		members:         members,
		expenses:        expenses,
	}, nil
}

// Name implements migrate.Source.
func (s *Source) Name() string { return SourceName }

// Close is a no-op; the CSV is fully read during Open.
func (s *Source) Close() error { return nil }

// Projects implements migrate.Source.
func (s *Source) Projects(_ context.Context) ([]migrate.ProjectInfo, error) {
	return []migrate.ProjectInfo{s.projectInfo()}, nil
}

// Project implements migrate.Source.
func (s *Source) Project(_ context.Context, id string) (*migrate.ProjectInfo, error) {
	if id != s.projectID {
		return nil, fmt.Errorf("project %q not found (only %q is available)", id, s.projectID)
	}
	info := s.projectInfo()
	return &info, nil
}

func (s *Source) projectInfo() migrate.ProjectInfo {
	return migrate.ProjectInfo{
		ID:              s.projectID,
		Name:            s.projectName,
		DefaultCurrency: s.defaultCurrency,
		MemberCount:     len(s.members),
		RecordCount:     len(s.expenses),
	}
}

// Persons implements migrate.Source. SourceIDs are the column indices (0, 1, …)
// so they are stable regardless of member name encoding.
func (s *Source) Persons(_ context.Context, projectID string) ([]migrate.PersonInfo, error) {
	if projectID != s.projectID {
		return nil, fmt.Errorf("project %q not found", projectID)
	}
	out := make([]migrate.PersonInfo, len(s.members))
	for i, name := range s.members {
		out[i] = migrate.PersonInfo{
			SourceID: strconv.Itoa(i),
			Name:     name,
		}
	}
	return out, nil
}

// Build implements migrate.Source.
func (s *Source) Build(
	ctx context.Context,
	projectID string,
	resolved *migrate.Resolved,
	opts migrate.BuildOptions,
) (*migrate.Plan, error) {
	if projectID != s.projectID {
		return nil, fmt.Errorf("project %q not found", projectID)
	}
	return build(s.projectName, s.defaultCurrency, s.members, s.expenses, resolved, opts)
}

func isAllEmpty(rec []string) bool {
	for _, s := range rec {
		if strings.TrimSpace(s) != "" {
			return false
		}
	}
	return true
}

func mostFrequentCurrency(rows []expenseRow) string {
	freq := make(map[string]int, 4)
	for _, r := range rows {
		freq[r.Currency]++
	}
	best, bestN := "EUR", 0
	for c, n := range freq {
		if n > bestN || (n == bestN && c < best) {
			best, bestN = c, n
		}
	}
	return best
}
