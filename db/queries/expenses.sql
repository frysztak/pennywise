-- name: CreateExpense :one
INSERT INTO expenses
(
    id,
    created_at,
    date,
    group_id,
    recurring_id,
    name,
    description,
    currency
) VALUES (
    @id, @created_at, @date, @group_id, @recurring_id, @name, @description, @currency
) RETURNING *;

-- name: CreateExpensePayer :one
INSERT INTO expense_payers
(
    id,
    expense_id,
    user_id,
    amount
) VALUES (
    @id, @expense_id, @user_id, @amount
) RETURNING *;

-- name: CreateExpenseBeneficiary :one
INSERT INTO expense_beneficiaries
(
    id,
    expense_id,
    user_id
) VALUES (
    @id, @expense_id, @user_id
) RETURNING *;

-- name: GetGroupExpenses :many
SELECT
  e.*,
  p.user_id as payer_id,
  u.username as payer_name,
  p.amount,
  json_group_array(b.user_id) as beneficiaries_ids
FROM
  expenses e
  INNER JOIN expense_payers p ON p.expense_id = e.id
  INNER JOIN users u ON u.id = p.user_id
  INNER JOIN expense_beneficiaries b ON b.expense_id = e.id
WHERE e.group_id = @group_id
GROUP BY e.id
ORDER BY e.created_at DESC;

-- name: GetGroupTotalSpending :many
SELECT
  e.currency,
  CAST(SUM(p.amount) AS INTEGER) as total_amount
FROM expenses e
JOIN expense_payers p ON p.expense_id = e.id
WHERE e.group_id = @group_id
GROUP BY e.currency;

-- name: UpdateExpense :one
UPDATE expenses
SET
  name = @name,
  description = @description,
  currency = @currency,
  date = @date
WHERE id = @id
RETURNING *;

-- name: UpdateExpensePayer :exec
UPDATE expense_payers
SET
  user_id = @user_id,
  amount = @amount
WHERE expense_id = @expense_id;

-- name: DeleteExpenseBeneficiaries :exec
DELETE FROM expense_beneficiaries
WHERE expense_id = @expense_id;

-- name: DeleteExpense :exec
DELETE FROM expenses
WHERE id = @id;