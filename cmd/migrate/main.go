// migrate imports an external expense-tracker project into Pennywise.
//
//	migrate <source> inspect [--project <slug>] <source-flags...>
//	migrate <source> plan    --project <slug> --mapping <file> <source-flags...>
//	migrate <source> apply   --project <slug> --mapping <file> <source-flags...>
//	migrate sources
//	migrate help
//
// Stop the Pennywise server before running `apply` — SQLite only allows a
// single writer at a time.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"text/tabwriter"

	"pennywise/config"
	"pennywise/db"
	"pennywise/log"
	"pennywise/migrate"
)

// sourceBuilder constructs a migrate.Source from CLI args. Each source
// registers one; main.go dispatches to it based on the first positional arg.
//
// Args is the subcommand name ("inspect" / "plan" / "apply"); flags returns
// the parsed common arguments plus the source itself. project may be empty
// for inspect (lists every project) and is required for plan/apply.
type sourceBuilder struct {
	name        string
	description string
	open        func(action string, args []string) (migrate.Source, commonArgs, error)
}

// commonArgs is everything the shared inspect/plan/apply orchestrators need
// from the per-source flag parser.
type commonArgs struct {
	project string // empty allowed only for `inspect`
	mapping string // required for plan/apply, empty for inspect
}

// sources is the registry of every backend the CLI knows about. New sources
// add themselves here.
var sources = map[string]sourceBuilder{
	ihatemoneyBuilder.name: ihatemoneyBuilder,
}

const usage = `migrate: import an external expense-tracker project into Pennywise

usage:
  migrate <source> inspect [--project <slug>] <source-flags...>
  migrate <source> plan    --project <slug> --mapping <file> <source-flags...>
  migrate <source> apply   --project <slug> --mapping <file> <source-flags...>
  migrate sources
  migrate help

Stop the Pennywise server before running 'apply' — SQLite is single-writer.
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}

	switch os.Args[1] {
	case "-h", "--help", "help":
		fmt.Print(usage)
		printSourceList(os.Stdout)
		return
	case "sources":
		printSourceList(os.Stdout)
		return
	}

	srcName := os.Args[1]
	builder, ok := sources[srcName]
	if !ok {
		fmt.Fprintf(os.Stderr, "unknown source %q\n\n%s", srcName, usage)
		printSourceList(os.Stderr)
		os.Exit(2)
	}

	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "missing action for source %q (expected inspect|plan|apply)\n", srcName)
		os.Exit(2)
	}
	action := os.Args[2]
	rest := os.Args[3:]

	if err := run(builder, action, rest); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func printSourceList(w *os.File) {
	fmt.Fprintln(w, "\nRegistered sources:")
	names := make([]string, 0, len(sources))
	for n := range sources {
		names = append(names, n)
	}
	sort.Strings(names)
	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	for _, n := range names {
		fmt.Fprintf(tw, "  %s\t%s\n", n, sources[n].description)
	}
	tw.Flush()
}

func run(builder sourceBuilder, action string, args []string) error {
	switch action {
	case "inspect":
		return runInspect(builder, args)
	case "plan":
		return runPlan(builder, args)
	case "apply":
		return runApply(builder, args)
	default:
		return fmt.Errorf("unknown action %q (expected inspect|plan|apply)", action)
	}
}

// --- inspect ---------------------------------------------------------------

func runInspect(builder sourceBuilder, args []string) error {
	src, common, err := builder.open("inspect", args)
	if err != nil {
		return err
	}
	defer src.Close()

	ctx := context.Background()
	if common.project == "" {
		return printProjectList(ctx, src)
	}
	return printMappingSkeleton(ctx, src, common.project)
}

func printProjectList(ctx context.Context, src migrate.Source) error {
	projects, err := src.Projects(ctx)
	if err != nil {
		return err
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tNAME\tDEFAULT_CURRENCY\tMEMBERS\tRECORDS")
	for _, p := range projects {
		fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\n",
			p.ID, p.Name, p.DefaultCurrency, p.MemberCount, p.RecordCount)
	}
	return w.Flush()
}

// printMappingSkeleton emits a JSON template the operator fills in and
// feeds back into `plan`. _comment / _source_name fields are hints; the
// loader ignores unknown JSON keys so the same file round-trips safely.
func printMappingSkeleton(ctx context.Context, src migrate.Source, projectID string) error {
	proj, err := src.Project(ctx, projectID)
	if err != nil {
		return err
	}
	persons, err := src.Persons(ctx, projectID)
	if err != nil {
		return err
	}

	type personEntry struct {
		SourceName string `json:"_source_name"`
		SourceID   string `json:"source_id"`
		UserEmail  string `json:"user_email"`
		UserID     string `json:"user_id,omitempty"`
	}
	entries := make([]personEntry, len(persons))
	for i, p := range persons {
		entries[i] = personEntry{SourceName: p.Name, SourceID: p.SourceID}
	}

	out, err := json.MarshalIndent(struct {
		Comment          string        `json:"_comment"`
		ProjectName      string        `json:"projectName"`
		CreatorUserEmail string        `json:"creatorUserEmail"`
		CreatorUserID    string        `json:"creatorUserId,omitempty"`
		Persons          []personEntry `json:"persons"`
	}{
		Comment:     "Fill creatorUserEmail (or creatorUserId) and user_email for each person, then run `plan`. _source_name is a hint only.",
		ProjectName: proj.Name,
		Persons:     entries,
	}, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}

// --- plan / apply ----------------------------------------------------------

func runPlan(builder sourceBuilder, args []string) error {
	_, _, err := buildPlan(builder, "plan", args, false)
	return err
}

func runApply(builder sourceBuilder, args []string) error {
	plan, src, err := buildPlan(builder, "apply", args, false)
	if err != nil {
		return err
	}
	defer src.Close()

	groupID, err := migrate.Apply(context.Background(), plan)
	if err != nil {
		return err
	}
	fmt.Printf("\napplied: new group id %s\n", groupID)
	return nil
}

// buildPlan opens the source, loads + validates the mapping, runs the
// transform, prints the summary, and returns the plan. The caller is
// responsible for closing the returned source.
func buildPlan(builder sourceBuilder, action string, args []string, quiet bool) (*migrate.Plan, migrate.Source, error) {
	src, common, err := builder.open(action, args)
	if err != nil {
		return nil, nil, err
	}
	// On error path the caller cannot close; close here.
	closeOnFail := src
	defer func() {
		if closeOnFail != nil {
			closeOnFail.Close()
		}
	}()

	if common.project == "" || common.mapping == "" {
		return nil, nil, errors.New("--project and --mapping are required")
	}

	if err := bootstrapDB(); err != nil {
		return nil, nil, err
	}

	ctx := context.Background()
	persons, err := src.Persons(ctx, common.project)
	if err != nil {
		return nil, nil, err
	}
	m, err := migrate.LoadMapping(common.mapping)
	if err != nil {
		return nil, nil, err
	}
	resolved, err := migrate.Validate(ctx, persons, m)
	if err != nil {
		return nil, nil, err
	}
	plan, err := src.Build(ctx, common.project, resolved, migrate.BuildOptions{})
	if err != nil {
		return nil, nil, err
	}

	if !quiet {
		printSummary(plan)
	}

	closeOnFail = nil // transfer ownership to caller
	return plan, src, nil
}

func printSummary(p *migrate.Plan) {
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
