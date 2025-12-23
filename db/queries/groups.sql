-- name: CreateGroup :one
INSERT INTO expense_groups
(
    id,
    created_by,
    description,
    default_currency,
    name
) VALUES (
    ?, ?, ?, ?, ?
) RETURNING * ;

-- name: UpdateGroup :one
UPDATE expense_groups SET name = ?, description = ?
WHERE id = ?
RETURNING *;

-- name: GetGroupById :one
SELECT *
FROM expense_groups
WHERE id = @group_id;

-- name: AddUserToGroup :one
INSERT INTO user_expense_groups
(
    user_id,
    group_id,
    weight
) VALUES (
    ?, ?, ?
) RETURNING * ;

-- name: RemoveUserFromGroup :exec
DELETE FROM user_expense_groups
WHERE user_id = ? AND group_id = ?;

-- name: GetGroupsByUserId :many
SELECT *
FROM 
  expense_groups g
  LEFT JOIN user_expense_groups u ON u.group_id = g.id
WHERE u.user_id = ?;

-- name: GetGroupMembers :many
SELECT
  ueg.user_id,
  ueg.weight,
  u.username as user_name
FROM user_expense_groups ueg
JOIN users u ON u.id = ueg.user_id
WHERE ueg.group_id = @group_id;

-- name: DeleteGroup :exec
DELETE FROM expense_groups
WHERE id = @group_id;
