// Package ihatemoney reads an ihatemoney SQLite database and produces a
// Plan that can be applied to a Pennywise database. The Source type is
// strictly read-only: callers open the database file in SQLite read-only
// + immutable mode so a stale snapshot cannot be mutated by accident.
package ihatemoney

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Source is a handle to an ihatemoney SQLite database, opened read-only.
type Source struct {
	db *sql.DB
}

// Project mirrors the ihatemoney `project` row we care about. Fields not
// represented in Pennywise (password, contact_email, logging_preference)
// are intentionally omitted.
type Project struct {
	ID              string
	Name            string
	DefaultCurrency string
}

// Person mirrors the ihatemoney `person` row.
type Person struct {
	ID        int64
	ProjectID string
	Name      string
	Weight    float64
	Activated bool
}

// Bill mirrors the ihatemoney `bill` row. `OriginalCurrency` is nullable in
// older databases — callers fall back to the project's default currency.
type Bill struct {
	ID               int64
	PayerID          int64
	Amount           float64
	Date             time.Time
	CreationDate     time.Time
	What             string
	OriginalCurrency string // empty when null in source
	BillType         BillType
}

// BillType is the kind of an ihatemoney bill. Older databases store these
// as the Python enum name ("EXPENSE", "REIMBURSEMENT"); we normalize on read.
type BillType string

const (
	BillTypeExpense       BillType = "EXPENSE"
	BillTypeReimbursement BillType = "REIMBURSEMENT"
)

// Open opens path read-only. The connection is also marked `immutable=1`
// so SQLite skips locking entirely — we will never write to this DB.
func Open(path string) (*Source, error) {
	q := url.Values{}
	q.Add("mode", "ro")
	q.Add("immutable", "1")
	q.Add("_query_only", "true")

	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?%s", path, q.Encode()))
	if err != nil {
		return nil, fmt.Errorf("open ihatemoney db: %w", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping ihatemoney db: %w", err)
	}
	return &Source{db: db}, nil
}

// Close releases the source connection.
func (s *Source) Close() error { return s.db.Close() }

// Projects returns every project in the source database.
func (s *Source) Projects(ctx context.Context) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, default_currency FROM project ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("query projects: %w", err)
	}
	defer rows.Close()

	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.DefaultCurrency); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Project fetches a single project by ID (the ihatemoney slug).
func (s *Source) Project(ctx context.Context, id string) (*Project, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, default_currency FROM project WHERE id = ?`, id)
	var p Project
	if err := row.Scan(&p.ID, &p.Name, &p.DefaultCurrency); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("project %q not found in source database", id)
		}
		return nil, err
	}
	return &p, nil
}

// Persons returns every person belonging to a project.
func (s *Source) Persons(ctx context.Context, projectID string) ([]Person, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, name, weight, activated
		FROM person
		WHERE project_id = ?
		ORDER BY id`, projectID)
	if err != nil {
		return nil, fmt.Errorf("query persons: %w", err)
	}
	defer rows.Close()

	out := []Person{}
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.ID, &p.ProjectID, &p.Name, &p.Weight, &p.Activated); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Bills returns every bill belonging to a project, ordered by creation time.
func (s *Source) Bills(ctx context.Context, projectID string) ([]Bill, error) {
	// `bill` joins to `person` to filter by project — bills have no
	// direct project_id column in ihatemoney.
	rows, err := s.db.QueryContext(ctx, `
		SELECT b.id, b.payer_id, b.amount, b.date, b.creation_date,
		       b.what, b.original_currency, b.bill_type
		FROM bill b
		JOIN person p ON p.id = b.payer_id
		WHERE p.project_id = ?
		ORDER BY b.creation_date, b.id`, projectID)
	if err != nil {
		return nil, fmt.Errorf("query bills: %w", err)
	}
	defer rows.Close()

	out := []Bill{}
	for rows.Next() {
		var b Bill
		var date, created string
		var currency sql.NullString
		var btype string
		if err := rows.Scan(&b.ID, &b.PayerID, &b.Amount, &date, &created,
			&b.What, &currency, &btype); err != nil {
			return nil, err
		}
		b.Date, err = parseIHMTime(date)
		if err != nil {
			return nil, fmt.Errorf("bill %d: parse date %q: %w", b.ID, date, err)
		}
		b.CreationDate, err = parseIHMTime(created)
		if err != nil {
			return nil, fmt.Errorf("bill %d: parse creation_date %q: %w", b.ID, created, err)
		}
		if currency.Valid {
			b.OriginalCurrency = currency.String
		}
		b.BillType = normalizeBillType(btype)
		out = append(out, b)
	}
	return out, rows.Err()
}

// BillOwers returns the person IDs that owe each bill, keyed by bill ID.
// Order within each slice is stable on person ID.
func (s *Source) BillOwers(ctx context.Context, billIDs []int64) (map[int64][]int64, error) {
	out := make(map[int64][]int64, len(billIDs))
	if len(billIDs) == 0 {
		return out, nil
	}

	// SQLite caps positional params; chunk to be safe even for huge projects.
	const chunk = 500
	for start := 0; start < len(billIDs); start += chunk {
		end := min(start+chunk, len(billIDs))
		batch := billIDs[start:end]

		placeholders := strings.Repeat("?,", len(batch))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]any, len(batch))
		for i, id := range batch {
			args[i] = id
		}

		q := fmt.Sprintf(`
			SELECT bill_id, person_id
			FROM billowers
			WHERE bill_id IN (%s)
			ORDER BY bill_id, person_id`, placeholders)
		rows, err := s.db.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("query billowers: %w", err)
		}
		for rows.Next() {
			var bid, pid int64
			if err := rows.Scan(&bid, &pid); err != nil {
				rows.Close()
				return nil, err
			}
			out[bid] = append(out[bid], pid)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

// parseIHMTime tolerates the two common formats ihatemoney emits: SQLAlchemy's
// "YYYY-MM-DD HH:MM:SS(.ffffff)?" for datetimes and "YYYY-MM-DD" for dates.
func parseIHMTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	formats := []string{
		"2006-01-02 15:04:05.000000",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"2006-01-02",
		time.RFC3339,
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized time format: %q", s)
}

// normalizeBillType maps ihatemoney's stored value (Python enum name or
// lower-case string) to our canonical BillType. Anything unknown is treated
// as EXPENSE, since the field was added late and older rows are all expenses.
func normalizeBillType(s string) BillType {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "REIMBURSEMENT", "BILLTYPE.REIMBURSEMENT":
		return BillTypeReimbursement
	default:
		return BillTypeExpense
	}
}
