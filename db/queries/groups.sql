-- name: CreateGroup :one
INSERT INTO expense_groups
(
    id,
    created_by,
    created_at,
    description,
    default_currency,
    name
) VALUES (
    @id, @created_by, @created_at, @description, @default_currency, @name
) RETURNING * ;

-- name: UpdateGroup :one
UPDATE expense_groups SET name = @name, description = @description, default_currency = @default_currency
WHERE id = @id
RETURNING *;

-- name: GetGroupById :one
SELECT *
FROM expense_groups
WHERE id = @group_id;

-- name: UpdateGroupImage :exec
UPDATE expense_groups
SET image_data = @image_data, image_mime_type = @image_mime_type, image_updated_at = @image_updated_at
WHERE id = @id;

-- name: GetGroupImage :one
SELECT image_data, image_mime_type FROM expense_groups WHERE id = @id LIMIT 1;

-- name: AddUserToGroup :one
INSERT INTO user_expense_groups
(
    user_id,
    group_id,
    weight,
    added_at
) VALUES (
    @user_id, @group_id, @weight, @added_at
) RETURNING * ;

-- name: RemoveUserFromGroup :exec
DELETE FROM user_expense_groups
WHERE user_id = @user_id AND group_id = @group_id;

-- name: UpdateUserWeight :exec
UPDATE user_expense_groups
SET weight = @weight
WHERE user_id = @user_id AND group_id = @group_id;

-- name: GetGroupsByUserId :many
SELECT *
FROM
  expense_groups g
  LEFT JOIN user_expense_groups u ON u.group_id = g.id
WHERE u.user_id = @user_id;

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

-- name: IsUserInGroup :one
SELECT EXISTS(
    SELECT 1 FROM user_expense_groups
    WHERE user_id = @user_id AND group_id = @group_id
) as is_member;

-- name: AddGroupCurrency :exec
INSERT INTO group_currencies (group_id, currency)
VALUES (@group_id, @currency)
ON CONFLICT DO NOTHING;

-- name: BulkAddGroupCurrencies :exec
INSERT INTO group_currencies (group_id, currency)
SELECT @group_id, value FROM json_each(@currencies);

-- name: RemoveGroupCurrency :exec
DELETE FROM group_currencies
WHERE group_id = @group_id AND currency = @currency;

-- name: ClearGroupCurrencies :exec
DELETE FROM group_currencies
WHERE group_id = @group_id;

-- name: GetGroupCurrencies :many
SELECT currency
FROM group_currencies
WHERE group_id = @group_id
ORDER BY currency;
