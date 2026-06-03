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
SELECT id, username, email, role FROM users;

-- name: UpdateUserRole :one
UPDATE users
SET role = @role
WHERE id = @id
RETURNING id, email, username, role;

-- name: CountAdmins :one
SELECT COUNT(*) FROM users WHERE role = 1;

-- name: IsUsersEmpty :one
SELECT EXISTS(SELECT 1 FROM users LIMIT 1);

-- name: UpdateUserAvatar :exec
UPDATE users
SET avatar_updated_at = @avatar_updated_at
WHERE id = @id;

-- name: UpdateUserUsername :one
UPDATE users
SET username = @username
WHERE id = @id
RETURNING id, email, username, role, avatar_updated_at;
