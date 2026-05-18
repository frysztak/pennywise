package main

import (
	"errors"
	"flag"

	"pennywise/migrate"
	"pennywise/migrate/ihatemoney"
)

// ihatemoneyBuilder registers the ihatemoney backend with the CLI. It parses
// the source-specific flags (path to the SQLite file, strict-reimbursement)
// alongside the common flags (--project, --mapping) and returns a ready-to-use
// migrate.Source plus the common args the orchestrator needs.
var ihatemoneyBuilder = sourceBuilder{
	name:        ihatemoney.SourceName,
	description: "import an ihatemoney SQLite database",
	open: func(action string, args []string) (migrate.Source, commonArgs, error) {
		fs := flag.NewFlagSet("migrate "+ihatemoney.SourceName+" "+action, flag.ExitOnError)
		dbPath := fs.String("ihatemoney-db", "", "path to ihatemoney SQLite database")
		project := fs.String("project", "", "project slug")
		mapping := fs.String("mapping", "", "path to mapping JSON file")
		strict := fs.Bool("strict-reimbursement", false,
			"reject multi-ower reimbursements instead of fanning them out")
		if err := fs.Parse(args); err != nil {
			return nil, commonArgs{}, err
		}
		if *dbPath == "" {
			return nil, commonArgs{}, errors.New("--ihatemoney-db is required")
		}

		src, err := ihatemoney.Open(*dbPath, ihatemoney.Options{
			StrictReimbursement: *strict,
		})
		if err != nil {
			return nil, commonArgs{}, err
		}
		return src, commonArgs{project: *project, mapping: *mapping}, nil
	},
}
