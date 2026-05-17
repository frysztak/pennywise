-- +goose Up
ALTER TABLE expense_groups ADD COLUMN image_data BLOB;
ALTER TABLE expense_groups ADD COLUMN image_mime_type TEXT;
ALTER TABLE expense_groups ADD COLUMN image_updated_at TEXT;

-- +goose Down
ALTER TABLE expense_groups DROP COLUMN image_data;
ALTER TABLE expense_groups DROP COLUMN image_mime_type;
ALTER TABLE expense_groups DROP COLUMN image_updated_at;
