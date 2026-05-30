-- +goose Up
ALTER TABLE user_expense_groups ADD COLUMN pinned_at TEXT;

-- +goose Down
ALTER TABLE user_expense_groups DROP COLUMN pinned_at;
