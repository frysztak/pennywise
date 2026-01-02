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
    @id, @token, @user_id, @created_at, @updated_at, @expired_at
) RETURNING * ;

-- name: GetSessionById :one
SELECT * FROM sessions WHERE id = @id LIMIT 1;

-- name: GetSessionByUserId :one
SELECT * FROM sessions WHERE user_id = @user_id LIMIT 1;

-- name: GetSessionByHash :one
SELECT * FROM sessions WHERE token = @token LIMIT 1;

-- name: UpdateSession :exec
UPDATE sessions SET token = @token, updated_at = @updated_at, expired_at = @expired_at
WHERE id = @id;

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id = @id;