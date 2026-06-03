-- name: GetSetting :one
SELECT value FROM app_settings WHERE key = @key LIMIT 1;

-- name: UpsertSetting :exec
INSERT INTO app_settings (key, value)
VALUES (@key, @value)
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
