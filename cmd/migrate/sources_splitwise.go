package main

import (
	"context"
	"errors"
	"flag"

	"pennywise/migrate"
	"pennywise/migrate/splitwise"
)

func init() {
	sources[splitwiseBuilder.name] = splitwiseBuilder
}

var splitwiseBuilder = sourceBuilder{
	name:        splitwise.SourceName,
	description: "import a Splitwise CSV export",
	open: func(action string, args []string) (migrate.Source, commonArgs, error) {
		fs := flag.NewFlagSet("migrate "+splitwise.SourceName+" "+action, flag.ExitOnError)
		csvPath := fs.String("splitwise-csv", "", "path to Splitwise CSV export file")
		project := fs.String("project", "", "project slug (defaults to the CSV filename without extension)")
		mapping := fs.String("mapping", "", "path to mapping JSON file")
		if err := fs.Parse(args); err != nil {
			return nil, commonArgs{}, err
		}
		if *csvPath == "" {
			return nil, commonArgs{}, errors.New("--splitwise-csv is required")
		}

		src, err := splitwise.Open(*csvPath)
		if err != nil {
			return nil, commonArgs{}, err
		}

		proj := *project
		if proj == "" {
			info, err := src.Projects(context.Background())
			if err == nil && len(info) > 0 {
				proj = info[0].ID
			}
		}
		return src, commonArgs{project: proj, mapping: *mapping}, nil
	},
}
