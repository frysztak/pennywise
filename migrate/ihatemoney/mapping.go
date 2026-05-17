package ihatemoney

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"pennywise/db"
	"sort"
	"strings"
)

// Mapping is the hand-edited bridge between ihatemoney persons and
// Pennywise users. Persons must be resolved by either e-mail or user ID;
// no placeholder accounts are ever created.
type Mapping struct {
	// ProjectName overrides the imported group name. Optional;
	// falls back to ihatemoney's Project.name when empty.
	ProjectName string `json:"projectName,omitempty"`
	// Creator identifies the Pennywise user recorded as
	// `expense_groups.created_by`. Exactly one of CreatorUserID /
	// CreatorUserEmail must be set; both are resolved against the live DB
	// and must end up pointing at one of the mapped users.
	CreatorUserID    string          `json:"creatorUserId,omitempty"`
	CreatorUserEmail string          `json:"creatorUserEmail,omitempty"`
	Persons          []PersonMapping `json:"persons"`
}

// PersonMapping resolves a single ihatemoney person to a Pennywise user.
// Exactly one of UserEmail / UserID must be set.
type PersonMapping struct {
	IhmID     int64  `json:"ihm_id"`
	UserEmail string `json:"user_email,omitempty"`
	UserID    string `json:"user_id,omitempty"`
}

// LoadMapping reads a mapping JSON file from disk.
func LoadMapping(path string) (*Mapping, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read mapping: %w", err)
	}
	var m Mapping
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("parse mapping: %w", err)
	}
	return &m, nil
}

// MappingSkeleton produces a mapping JSON template for a project, with one
// blank entry per person. Operator fills in `user_email` (or `user_id`) and
// `creatorUserId` before running `plan`.
func MappingSkeleton(project *Project, persons []Person) *Mapping {
	m := &Mapping{
		ProjectName: project.Name,
		Persons:     make([]PersonMapping, len(persons)),
	}
	for i, p := range persons {
		m.Persons[i] = PersonMapping{IhmID: p.ID}
	}
	return m
}

// ValidationError describes a single problem with a mapping. Multiple are
// returned together so the operator sees the full picture instead of
// fixing one issue at a time.
type ValidationError struct {
	Field   string
	Message string
}

func (v ValidationError) Error() string { return fmt.Sprintf("%s: %s", v.Field, v.Message) }

// ValidationErrors is a flat list of validation failures.
type ValidationErrors []ValidationError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%d validation error(s):", len(v))
	for _, e := range v {
		b.WriteString("\n  - ")
		b.WriteString(e.Error())
	}
	return b.String()
}

// Resolved is the validation output — every IHM person ID maps to a
// Pennywise user record fetched from the live database.
type Resolved struct {
	Mapping    *Mapping
	UsersByIHM map[int64]ResolvedUser
}

// ResolvedUser is the subset of a Pennywise user identity needed downstream.
type ResolvedUser struct {
	ID    string
	Email string
}

// Validate cross-references the mapping with the live Pennywise database and
// the source project. Returns Resolved on success, or ValidationErrors with
// one entry per problem found.
func Validate(ctx context.Context, persons []Person, m *Mapping) (*Resolved, error) {
	var errs ValidationErrors

	// Resolve the creator to a Pennywise user ID. Exactly one of
	// creatorUserId / creatorUserEmail must be set; we normalize to ID so
	// downstream code only needs to look at CreatorUserID.
	creatorIDSet := m.CreatorUserID != ""
	creatorEmailSet := m.CreatorUserEmail != ""
	switch {
	case !creatorIDSet && !creatorEmailSet:
		errs = append(errs, ValidationError{
			Field:   "creator",
			Message: "one of creatorUserId or creatorUserEmail is required",
		})
	case creatorIDSet && creatorEmailSet:
		errs = append(errs, ValidationError{
			Field:   "creator",
			Message: "set only one of creatorUserId or creatorUserEmail, not both",
		})
	case creatorEmailSet:
		u, err := db.ReadQueries.GetUserByEmail(ctx, m.CreatorUserEmail)
		if err != nil {
			errs = append(errs, ValidationError{
				Field:   "creatorUserEmail",
				Message: fmt.Sprintf("user with email %q not found", m.CreatorUserEmail),
			})
		} else {
			m.CreatorUserID = u.ID
		}
	}

	// Index source persons and detect coverage gaps.
	srcByID := make(map[int64]Person, len(persons))
	for _, p := range persons {
		srcByID[p.ID] = p
	}
	mapByIHM := make(map[int64]PersonMapping, len(m.Persons))
	for _, pm := range m.Persons {
		if _, dup := mapByIHM[pm.IhmID]; dup {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("persons[%d]", pm.IhmID),
				Message: "duplicate ihm_id entry",
			})
		}
		mapByIHM[pm.IhmID] = pm
	}
	for _, p := range persons {
		if _, ok := mapByIHM[p.ID]; !ok {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("persons[%d]", p.ID),
				Message: fmt.Sprintf("ihatemoney person %q (id=%d) has no mapping", p.Name, p.ID),
			})
		}
	}

	// Resolve each mapping entry against the live DB.
	resolved := make(map[int64]ResolvedUser, len(m.Persons))
	seenUserIDs := make(map[string]int64, len(m.Persons))
	for _, pm := range m.Persons {
		if _, ok := srcByID[pm.IhmID]; !ok {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("persons[%d]", pm.IhmID),
				Message: "ihm_id does not exist in source project",
			})
			continue
		}
		emailSet := pm.UserEmail != ""
		idSet := pm.UserID != ""
		if emailSet == idSet {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("persons[%d]", pm.IhmID),
				Message: "exactly one of user_email or user_id is required",
			})
			continue
		}

		u, err := resolveUser(ctx, pm)
		if err != nil {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("persons[%d]", pm.IhmID),
				Message: err.Error(),
			})
			continue
		}
		if prev, dup := seenUserIDs[u.ID]; dup {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("persons[%d]", pm.IhmID),
				Message: fmt.Sprintf("pennywise user %s already mapped to ihm_id %d", u.ID, prev),
			})
			continue
		}
		seenUserIDs[u.ID] = pm.IhmID
		resolved[pm.IhmID] = u
	}

	if m.CreatorUserID != "" {
		if _, ok := seenUserIDs[m.CreatorUserID]; !ok {
			errs = append(errs, ValidationError{
				Field:   "creatorUserId",
				Message: "must be one of the mapped Pennywise user IDs",
			})
		}
	}

	if len(errs) > 0 {
		// Sort for stable output regardless of map iteration order.
		sort.SliceStable(errs, func(i, j int) bool { return errs[i].Field < errs[j].Field })
		return nil, errs
	}
	return &Resolved{Mapping: m, UsersByIHM: resolved}, nil
}

func resolveUser(ctx context.Context, pm PersonMapping) (ResolvedUser, error) {
	if pm.UserEmail != "" {
		u, err := db.ReadQueries.GetUserByEmail(ctx, pm.UserEmail)
		if err != nil {
			return ResolvedUser{}, fmt.Errorf("user_email %q not found", pm.UserEmail)
		}
		return ResolvedUser{ID: u.ID, Email: u.Email}, nil
	}
	u, err := db.ReadQueries.GetUserById(ctx, pm.UserID)
	if err != nil {
		return ResolvedUser{}, fmt.Errorf("user_id %q not found", pm.UserID)
	}
	return ResolvedUser{ID: u.ID, Email: u.Email}, nil
}
