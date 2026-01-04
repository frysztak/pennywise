-- name: CreateUser :one
INSERT INTO users
(
    id,
    email,
    username,
    password_hash,
    created_at,
    role
) VALUES (
    @id, @email, @username, @password_hash, @created_at, @role
) RETURNING * ;

-- name: GetUserById :one
SELECT id, email, username, role, avatar_updated_at FROM users WHERE id = @id LIMIT 1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = @email LIMIT 1;

-- name: GetUsers :many
SELECT id, username, email FROM users;

-- name: UpdateUserAvatar :exec
UPDATE users
SET avatar_data = @avatar_data, avatar_mime_type = @avatar_mime_type, avatar_updated_at = @avatar_updated_at
WHERE id = @id;

-- name: GetUserAvatar :one
SELECT avatar_data, avatar_mime_type FROM users WHERE id = @id LIMIT 1;
