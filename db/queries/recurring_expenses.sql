-- name: CreateRecurringExpense :one
INSERT INTO recurring_expenses (
    id,
    created_at,
    group_id,
    name,
    description,
    frequency,
    start_date,
    next_occurrence,
    payer_id,
    amount,
    currency
) VALUES (
    @id,
    @created_at,
    @group_id,
    @name,
    @description,
    @frequency,
    @start_date,
    @next_occurrence,
    @payer_id,
    @amount,
    @currency
)
RETURNING *;

-- name: GetGroupRecurringExpenses :many
SELECT
    r.*,
    u.username as payer_name
FROM recurring_expenses r
LEFT JOIN users u ON r.payer_id = u.id
WHERE r.group_id = @group_id
ORDER BY r.next_occurrence ASC;

-- name: GetRecurringExpense :one
SELECT
    r.*,
    u.username as payer_name
FROM recurring_expenses r
LEFT JOIN users u ON r.payer_id = u.id
WHERE r.id = @id;

-- name: GetDueRecurringExpenses :many
SELECT
    r.*,
    u.username as payer_name
FROM recurring_expenses r
LEFT JOIN users u ON r.payer_id = u.id
WHERE r.group_id = @group_id
  AND date(r.next_occurrence) <= date('now')
ORDER BY r.next_occurrence ASC;

-- name: UpdateRecurringExpense :one
UPDATE recurring_expenses
SET
    name = @name,
    description = @description,
    frequency = @frequency,
    payer_id = @payer_id,
    amount = @amount,
    currency = @currency
WHERE id = @id
RETURNING *;

-- name: UpdateNextOccurrence :exec
UPDATE recurring_expenses
SET next_occurrence = @next_occurrence
WHERE id = @id;

-- name: DeleteRecurringExpense :exec
DELETE FROM recurring_expenses
WHERE id = @id;
