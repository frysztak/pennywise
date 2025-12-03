-- name: CreateSession :one
INSERT INTO sessions
(
    id,
    token,
    user_id,
    created_at,
    updated_at,
    expired_at
) VALUES (
    ?, ?, ?, ?, ?, ?
) RETURNING * ;

-- name: GetSessionById :one
SELECT * FROM sessions WHERE id = ? LIMIT 1;

-- name: GetSessionByUserId :one
SELECT * FROM sessions WHERE user_id = ? LIMIT 1;

-- name: GetSessionByHash :one
SELECT * FROM sessions WHERE token = ? LIMIT 1;

-- name: UpdateSession :exec
UPDATE sessions SET token = ?, updated_at = ?, expired_at = ?
WHERE id = ?;

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id = ?;