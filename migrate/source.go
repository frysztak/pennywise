package migrate

import "context"

// Source is the source-agnostic interface every migration backend implements.
// Implementations are responsible for opening their underlying storage,
// listing the available projects, exposing the members of a project, and
// transforming a project + a validated Mapping into a Plan.
type Source interface {
	// Name returns the registered source identifier (e.g. "ihatemoney").
	Name() string

	// Projects lists every project the backend exposes. Used by `inspect`
	// when no project is selected.
	Projects(ctx context.Context) ([]ProjectInfo, error)

	// Project fetches a single project by its source-side identifier.
	Project(ctx context.Context, id string) (*ProjectInfo, error)

	// Persons returns the people in a project, in stable source order.
	// The returned SourceID values are the keys used in mapping JSON.
	Persons(ctx context.Context, projectID string) ([]PersonInfo, error)

	// Build performs the source-specific transformation and returns a
	// fully-formed Plan ready to be Applied. It must perform no writes.
	Build(ctx context.Context, projectID string, resolved *Resolved, opts BuildOptions) (*Plan, error)

	// Close releases any backing resources (file handles, HTTP clients, ...).
	Close() error
}

// ProjectInfo is the source-agnostic view of one project shown in `inspect`.
// RecordCount is the count of expense-like entries (bills in ihatemoney,
// expenses in splitwise, etc.) — labelled generically because each source
// has its own vocabulary.
type ProjectInfo struct {
	ID              string
	Name            string
	DefaultCurrency string
	MemberCount     int
	RecordCount     int
}

// PersonInfo is the source-agnostic view of one project member. SourceID
// is whatever opaque identifier the source uses internally (an int64 for
// ihatemoney, a Splitwise user id, ...) stringified so mapping JSON does
// not need a per-source schema.
type PersonInfo struct {
	SourceID string
	Name     string
}
