-- +goose Up
ALTER TABLE users DROP COLUMN avatar_data;
ALTER TABLE users DROP COLUMN avatar_mime_type;
ALTER TABLE expense_groups DROP COLUMN image_data;
ALTER TABLE expense_groups DROP COLUMN image_mime_type;

-- +goose Down
ALTER TABLE users ADD COLUMN avatar_data BLOB;
ALTER TABLE users ADD COLUMN avatar_mime_type TEXT;
ALTER TABLE expense_groups ADD COLUMN image_data BLOB;
ALTER TABLE expense_groups ADD COLUMN image_mime_type TEXT;
