// migrate-ihatemoney imports an ihatemoney SQLite database into Pennywise.
//
//	migrate-ihatemoney inspect --ihatemoney-db <path> [--project <slug>]
//	migrate-ihatemoney plan    --ihatemoney-db <path> --project <slug> --mapping <file>
//	migrate-ihatemoney apply   --ihatemoney-db <path> --project <slug> --mapping <file>
//
// Stop the Pennywise server before running `apply` — SQLite only allows a
// single writer at a time.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"text/tabwriter"

	"pennywise/config"
	"pennywise/db"
	"pennywise/log"
	"pennywise/migrate/ihatemoney"
)

const usage = `migrate-ihatemoney: import an ihatemoney project into Pennywise

usage:
  migrate-ihatemoney inspect --ihatemoney-db <path> [--project <slug>]
  migrate-ihatemoney plan    --ihatemoney-db <path> --project <slug> --mapping <file> [--strict-reimbursement]
  migrate-ihatemoney apply   --ihatemoney-db <path> --project <slug> --mapping <file> [--strict-reimbursement]

Stop the Pennywise server before running 'apply' — SQLite is single-writer.
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	var err error
	switch cmd {
	case "inspect":
		err = runInspect(args)
	case "plan":
		err = runPlan(args, false)
	case "apply":
		err = runApply(args)
	case "-h", "--help", "help":
		fmt.Print(usage)
		return
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n%s", cmd, usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

// --- inspect ---------------------------------------------------------------

func runInspect(args []string) error {
	fs := flag.NewFlagSet("inspect", flag.ExitOnError)
	srcPath := fs.String("ihatemoney-db", "", "path to ihatemoney SQLite database")
	project := fs.String("project", "", "project slug; if omitted, lists all projects")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *srcPath == "" {
		return errors.New("--ihatemoney-db is required")
	}

	ctx := context.Background()
	src, err := ihatemoney.Open(*srcPath)
	if err != nil {
		return err
	}
	defer src.Close()

	if *project == "" {
		return printProjectList(ctx, src)
	}
	return printMappingSkeleton(ctx, src, *project)
}

func printProjectList(ctx context.Context, src *ihatemoney.Source) error {
	projects, err := src.Projects(ctx)
	if err != nil {
		return err
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tNAME\tDEFAULT_CURRENCY\tPERSONS\tBILLS")
	for _, p := range projects {
		persons, _ := src.Persons(ctx, p.ID)
		bills, _ := src.Bills(ctx, p.ID)
		fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\n",
			p.ID, p.Name, p.DefaultCurrency, len(persons), len(bills))
	}
	return w.Flush()
}

func printMappingSkeleton(ctx context.Context, src *ihatemoney.Source, projectID string) error {
	proj, err := src.Project(ctx, projectID)
	if err != nil {
		return err
	}
	persons, err := src.Persons(ctx, projectID)
	if err != nil {
		return err
	}
	skel := ihatemoney.MappingSkeleton(proj, persons)

	// Use a local type with no `omitempty` on user_email/user_id so the
	// fields appear in the output ready to fill in. `_ihm_name` is a hint
	// only — the loader ignores unknown fields.
	type personEntry struct {
		IhmName   string `json:"_ihm_name"`
		IhmID     int64  `json:"ihm_id"`
		UserEmail string `json:"user_email"`
		UserID    string `json:"user_id,omitempty"`
	}
	entries := make([]personEntry, len(persons))
	for i, p := range persons {
		entries[i] = personEntry{IhmName: p.Name, IhmID: p.ID}
	}

	// `_comment` is a hint for the operator; unknown fields are ignored by
	// the loader, so the file is safe to feed straight back into `plan`.
	out, err := json.MarshalIndent(struct {
		Comment       string        `json:"_comment"`
		ProjectName   string        `json:"projectName"`
		CreatorUserID string        `json:"creatorUserId"`
		Persons       []personEntry `json:"persons"`
	}{
		Comment:       "Fill creatorUserId and user_email for each person, then run `plan`. _ihm_name is a hint only.",
		ProjectName:   skel.ProjectName,
		CreatorUserID: "",
		Persons:       entries,
	}, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}

// --- plan ------------------------------------------------------------------

func runPlan(args []string, fromApply bool) error {
	_, err := buildPlan(args, fromApply)
	return err
}

// commonPlanArgs is everything plan & apply need.
type commonPlanArgs struct {
	srcPath  string
	project  string
	mapping  string
	strictRb bool
}

func parsePlanArgs(name string, args []string) (commonPlanArgs, error) {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	srcPath := fs.String("ihatemoney-db", "", "path to ihatemoney SQLite database")
	project := fs.String("project", "", "project slug to import")
	mapping := fs.String("mapping", "", "path to mapping JSON file")
	strict := fs.Bool("strict-reimbursement", false,
		"reject multi-ower reimbursements instead of fanning them out")
	if err := fs.Parse(args); err != nil {
		return commonPlanArgs{}, err
	}
	if *srcPath == "" || *project == "" || *mapping == "" {
		return commonPlanArgs{}, errors.New("--ihatemoney-db, --project, --mapping are required")
	}
	return commonPlanArgs{
		srcPath: *srcPath, project: *project, mapping: *mapping, strictRb: *strict,
	}, nil
}

// buildPlan loads source + mapping, validates against the live Pennywise DB,
// runs the transform, and prints the summary. Returned plan can be applied.
func buildPlan(args []string, quiet bool) (*ihatemoney.Plan, error) {
	a, err := parsePlanArgs("plan", args)
	if err != nil {
		return nil, err
	}

	if err := bootstrapDB(); err != nil {
		return nil, err
	}

	ctx := context.Background()

	src, err := ihatemoney.Open(a.srcPath)
	if err != nil {
		return nil, err
	}
	defer src.Close()

	proj, err := src.Project(ctx, a.project)
	if err != nil {
		return nil, err
	}
	persons, err := src.Persons(ctx, a.project)
	if err != nil {
		return nil, err
	}
	bills, err := src.Bills(ctx, a.project)
	if err != nil {
		return nil, err
	}
	billIDs := make([]int64, len(bills))
	for i, b := range bills {
		billIDs[i] = b.ID
	}
	owers, err := src.BillOwers(ctx, billIDs)
	if err != nil {
		return nil, err
	}

	m, err := ihatemoney.LoadMapping(a.mapping)
	if err != nil {
		return nil, err
	}
	resolved, err := ihatemoney.Validate(ctx, persons, m)
	if err != nil {
		return nil, err
	}

	plan, err := ihatemoney.Build(proj, persons, bills, owers, resolved,
		ihatemoney.BuildOptions{StrictReimbursement: a.strictRb})
	if err != nil {
		return nil, err
	}

	if !quiet {
		printSummary(plan)
	}
	return plan, nil
}

func printSummary(p *ihatemoney.Plan) {
	fmt.Printf("Plan summary for group %q (new id: %s)\n", p.Group.Name, p.GroupID)
	fmt.Printf("  Members:   %d\n", len(p.Members))
	fmt.Printf("  Currencies: %v\n", p.Currencies)

	// Per-currency totals.
	type stats struct {
		expenses, expenseCents int64
		transfers, txCents     int64
	}
	perCurrency := map[string]*stats{}
	for _, e := range p.Expenses {
		s := perCurrency[e.Expense.Currency]
		if s == nil {
			s = &stats{}
			perCurrency[e.Expense.Currency] = s
		}
		s.expenses++
		s.expenseCents += e.Payer.Amount
	}
	for _, t := range p.Transfers {
		s := perCurrency[t.Currency]
		if s == nil {
			s = &stats{}
			perCurrency[t.Currency] = s
		}
		s.transfers++
		s.txCents += t.Amount
	}

	currencies := make([]string, 0, len(perCurrency))
	for c := range perCurrency {
		currencies = append(currencies, c)
	}
	sort.Strings(currencies)

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "  CURRENCY\tEXPENSES\tEXPENSE_TOTAL\tTRANSFERS\tTRANSFER_TOTAL")
	for _, c := range currencies {
		s := perCurrency[c]
		fmt.Fprintf(w, "  %s\t%d\t%.2f\t%d\t%.2f\n",
			c, s.expenses, float64(s.expenseCents)/100, s.transfers, float64(s.txCents)/100)
	}
	w.Flush()

	if len(p.Warnings) > 0 {
		fmt.Printf("\nWarnings (%d):\n", len(p.Warnings))
		for _, wr := range p.Warnings {
			fmt.Printf("  - %s\n", wr)
		}
	}
}

// --- apply -----------------------------------------------------------------

func runApply(args []string) error {
	plan, err := buildPlan(args, false)
	if err != nil {
		return err
	}

	ctx := context.Background()
	groupID, err := ihatemoney.Apply(ctx, plan)
	if err != nil {
		return err
	}
	fmt.Printf("\napplied: new group id %s\n", groupID)
	return nil
}

// --- bootstrap -------------------------------------------------------------

// bootstrapDB initializes config + DB connections so the migration tool can
// reuse the existing write/read query layer. Migrations are intentionally
// NOT run here — the operator should already have a migrated DB.
func bootstrapDB() error {
	if err := config.InitConfig(); err != nil {
		return fmt.Errorf("init config (is .env present and AUTH_SECRET set?): %w", err)
	}
	log.Init(config.Config.LogLevel, config.Config.LogFormat)
	if err := db.InitDB(); err != nil {
		return fmt.Errorf("init db: %w", err)
	}
	return nil
}
