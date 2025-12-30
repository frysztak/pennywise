-- name: CreateTransfer :one
INSERT INTO transfers
(
    id,
    group_id,
    sender_id,
    receiver_id,
    amount,
    currency,
    date
) VALUES (
    @id, @group_id, @sender_id, @receiver_id, @amount, @currency, @date
) RETURNING *;

-- name: GetTransferById :one
SELECT * FROM transfers WHERE id = @id;

-- name: GetGroupTransfers :many
SELECT
    t.*,
    s.username as sender_name,
    r.username as receiver_name
FROM transfers t
JOIN users s ON s.id = t.sender_id
JOIN users r ON r.id = t.receiver_id
WHERE t.group_id = @group_id
ORDER BY t.created_at DESC;

-- name: GetGroupTransfersForBalance :many
SELECT
    sender_id,
    receiver_id,
    amount,
    currency
FROM transfers
WHERE group_id = @group_id;

-- name: UpdateTransfer :one
UPDATE transfers
SET
    sender_id = @sender_id,
    receiver_id = @receiver_id,
    amount = @amount,
    currency = @currency,
    date = @date
WHERE id = @id
RETURNING *;

-- name: DeleteTransfer :exec
DELETE FROM transfers WHERE id = @id;
