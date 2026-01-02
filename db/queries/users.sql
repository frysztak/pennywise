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
SELECT * FROM users WHERE id = @id LIMIT 1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = @email LIMIT 1;

-- name: GetUsers :many
SELECT id, username, email FROM users;
