-- name: CreateExpense :one
INSERT INTO expenses
(
    id,
    created_at,
    group_id,
    recurring_id,
    name,
    description,
    currency
) VALUES (
    ?, ?, ?, ?, ?, ?, ?
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
GROUP BY e.id;

-- name: GetGroupTotalSpending :many
SELECT
  e.currency,
  CAST(SUM(p.amount) AS INTEGER) as total_amount
FROM expenses e
JOIN expense_payers p ON p.expense_id = e.id
WHERE e.group_id = @group_id
GROUP BY e.currency;