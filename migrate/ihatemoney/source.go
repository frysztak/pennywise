// Package ihatemoney reads an ihatemoney SQLite database and produces a
// migrate.Plan that can be applied to a Pennywise database. The Source type
// is strictly read-only: callers open the database file in SQLite read-only
// + immutable mode so a stale snapshot cannot be mutated by accident.
package ihatemoney

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"pennywise/migrate"
)

// SourceName is the identifier used to select this backend from the CLI.
const SourceName = "ihatemoney"

// Options configures an ihatemoney Source. All fields are optional; defaults
// match what we shipped before the refactor.
type Options struct {
	// StrictReimbursement rejects (rather than fans out) multi-ower
	// reimbursements. Default false matches ihatemoney's own settlement
	// math, splitting by ower weight across multiple Pennywise transfers.
	StrictReimbursement bool
}

// Source is a handle to an ihatemoney SQLite database, opened read-only.
// It implements migrate.Source.
type Source struct {
	db   *sql.DB
	opts Options
}

// internal types — these mirror ihatemoney rows. They are deliberately
// unexported now that the package's public surface is the migrate.Source
// interface; only the build pipeline and tests still touch them directly.

type project struct {
	ID              string
	Name            string
	DefaultCurrency string
}

type person struct {
	ID        int64
	ProjectID string
	Name      string
	Weight    float64
	Activated bool
}

type bill struct {
	ID               int64
	PayerID          int64
	Amount           float64
	Date             time.Time
	CreationDate     time.Time
	What             string
	OriginalCurrency string // empty when null in source
	BillType         billType
}

type billType string

const (
	billTypeExpense       billType = "EXPENSE"
	billTypeReimbursement billType = "REIMBURSEMENT"
)

// Open opens path read-only. The connection is also marked `immutable=1`
// so SQLite skips locking entirely — we will never write to this DB.
func Open(path string, opts Options) (*Source, error) {
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
	return &Source{db: db, opts: opts}, nil
}

// Name implements migrate.Source.
func (s *Source) Name() string { return SourceName }

// Close releases the source connection.
func (s *Source) Close() error { return s.db.Close() }

// Projects implements migrate.Source.
func (s *Source) Projects(ctx context.Context) ([]migrate.ProjectInfo, error) {
	projects, err := s.projects(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]migrate.ProjectInfo, 0, len(projects))
	for _, p := range projects {
		persons, err := s.persons(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		bills, err := s.bills(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, migrate.ProjectInfo{
			ID:              p.ID,
			Name:            p.Name,
			DefaultCurrency: p.DefaultCurrency,
			MemberCount:     len(persons),
			RecordCount:     len(bills),
		})
	}
	return out, nil
}

// Project implements migrate.Source.
func (s *Source) Project(ctx context.Context, id string) (*migrate.ProjectInfo, error) {
	p, err := s.project(ctx, id)
	if err != nil {
		return nil, err
	}
	persons, err := s.persons(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	bills, err := s.bills(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	return &migrate.ProjectInfo{
		ID:              p.ID,
		Name:            p.Name,
		DefaultCurrency: p.DefaultCurrency,
		MemberCount:     len(persons),
		RecordCount:     len(bills),
	}, nil
}

// Persons implements migrate.Source.
func (s *Source) Persons(ctx context.Context, projectID string) ([]migrate.PersonInfo, error) {
	ps, err := s.persons(ctx, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]migrate.PersonInfo, len(ps))
	for i, p := range ps {
		out[i] = migrate.PersonInfo{
			SourceID: strconv.FormatInt(p.ID, 10),
			Name:     p.Name,
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
	proj, err := s.project(ctx, projectID)
	if err != nil {
		return nil, err
	}
	persons, err := s.persons(ctx, projectID)
	if err != nil {
		return nil, err
	}
	bills, err := s.bills(ctx, projectID)
	if err != nil {
		return nil, err
	}
	billIDs := make([]int64, len(bills))
	for i, b := range bills {
		billIDs[i] = b.ID
	}
	owers, err := s.billOwers(ctx, billIDs)
	if err != nil {
		return nil, err
	}
	return build(proj, persons, bills, owers, resolved, buildOpts{
		Shared: opts,
		Strict: s.opts.StrictReimbursement,
	})
}

// --- raw SQLite readers ----------------------------------------------------

func (s *Source) projects(ctx context.Context) ([]project, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, default_currency FROM project ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("query projects: %w", err)
	}
	defer rows.Close()

	out := []project{}
	for rows.Next() {
		var p project
		if err := rows.Scan(&p.ID, &p.Name, &p.DefaultCurrency); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Source) project(ctx context.Context, id string) (*project, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, default_currency FROM project WHERE id = ?`, id)
	var p project
	if err := row.Scan(&p.ID, &p.Name, &p.DefaultCurrency); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("project %q not found in source database", id)
		}
		return nil, err
	}
	return &p, nil
}

func (s *Source) persons(ctx context.Context, projectID string) ([]person, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, name, weight, activated
		FROM person
		WHERE project_id = ?
		ORDER BY id`, projectID)
	if err != nil {
		return nil, fmt.Errorf("query persons: %w", err)
	}
	defer rows.Close()

	out := []person{}
	for rows.Next() {
		var p person
		if err := rows.Scan(&p.ID, &p.ProjectID, &p.Name, &p.Weight, &p.Activated); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Source) bills(ctx context.Context, projectID string) ([]bill, error) {
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

	out := []bill{}
	for rows.Next() {
		var b bill
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

func (s *Source) billOwers(ctx context.Context, billIDs []int64) (map[int64][]int64, error) {
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
// lower-case string) to our canonical billType. Anything unknown is treated
// as EXPENSE, since the field was added late and older rows are all expenses.
func normalizeBillType(s string) billType {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "REIMBURSEMENT", "BILLTYPE.REIMBURSEMENT":
		return billTypeReimbursement
	default:
		return billTypeExpense
	}
}
