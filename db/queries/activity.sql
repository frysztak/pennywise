-- name: GetGroupActivityPaginated :many
SELECT
  e.id AS id,
  'expense' AS type,
  e.date AS date,
  e.created_at AS created_at,
  e.name AS description,
  e.currency AS currency,
  p.amount AS amount,
  p.user_id AS actor_id,
  u.username AS actor_name,
  CAST(NULL AS TEXT) AS receiver_id,
  CAST(NULL AS TEXT) AS receiver_name,
  json_group_array(b.user_id) AS beneficiaries_ids,
  e.recurring_id AS recurring_id
FROM expenses e
INNER JOIN expense_payers p ON p.expense_id = e.id
INNER JOIN users u ON u.id = p.user_id
INNER JOIN expense_beneficiaries b ON b.expense_id = e.id
WHERE e.group_id = @group_id
  AND (@type_filter = '' OR @type_filter = 'expense')
  AND (@currency_filter = '' OR e.currency = @currency_filter)
  AND (@member_filter = '' OR p.user_id = @member_filter OR b.user_id = @member_filter)
  AND (
    @cursor_date = '' OR
    e.date < @cursor_date OR
    (e.date = @cursor_date AND e.created_at < @cursor_created_at) OR
    (e.date = @cursor_date AND e.created_at = @cursor_created_at AND e.id < @cursor_id)
  )
GROUP BY e.id

UNION ALL

SELECT
  t.id,
  'transfer' AS type,
  t.date,
  t.created_at,
  'Transfer' AS description,
  t.currency,
  t.amount,
  t.sender_id AS actor_id,
  s.username AS actor_name,
  t.receiver_id,
  r.username AS receiver_name,
  CAST(NULL AS TEXT) AS beneficiaries_ids,
  CAST(NULL AS TEXT) AS recurring_id
FROM transfers t
JOIN users s ON s.id = t.sender_id
JOIN users r ON r.id = t.receiver_id
WHERE t.group_id = @group_id
  AND (@type_filter = '' OR @type_filter = 'transfer')
  AND (@currency_filter = '' OR t.currency = @currency_filter)
  AND (@member_filter = '' OR t.sender_id = @member_filter OR t.receiver_id = @member_filter)
  AND (
    @cursor_date = '' OR
    t.date < @cursor_date OR
    (t.date = @cursor_date AND t.created_at < @cursor_created_at) OR
    (t.date = @cursor_date AND t.created_at = @cursor_created_at AND t.id < @cursor_id)
  )

ORDER BY date DESC, created_at DESC, id DESC
LIMIT @limit;

-- name: GetGroupActivityCount :one
SELECT COUNT(*) AS total FROM (
  SELECT e.id FROM expenses e
  INNER JOIN expense_payers p ON p.expense_id = e.id
  INNER JOIN expense_beneficiaries b ON b.expense_id = e.id
  WHERE e.group_id = @group_id
    AND (@type_filter = '' OR @type_filter = 'expense')
    AND (@currency_filter = '' OR e.currency = @currency_filter)
    AND (@member_filter = '' OR p.user_id = @member_filter OR b.user_id = @member_filter)
  GROUP BY e.id

  UNION ALL

  SELECT t.id FROM transfers t
  WHERE t.group_id = @group_id
    AND (@type_filter = '' OR @type_filter = 'transfer')
    AND (@currency_filter = '' OR t.currency = @currency_filter)
    AND (@member_filter = '' OR t.sender_id = @member_filter OR t.receiver_id = @member_filter)
);
