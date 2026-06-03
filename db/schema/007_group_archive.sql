-- +goose Up
ALTER TABLE expense_groups ADD COLUMN archived_at TEXT;

-- +goose Down
ALTER TABLE expense_groups DROP COLUMN archived_at;
