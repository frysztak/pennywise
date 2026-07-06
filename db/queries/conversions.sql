-- name: CreateCurrencyConversion :one
INSERT INTO currency_conversions
(
    id,
    created_at,
    group_id,
    from_currency,
    to_currency,
    rate,
    date
) VALUES (
    @id, @created_at, @group_id, @from_currency, @to_currency, @rate, @date
) RETURNING *;

-- name: GetCurrencyConversionById :one
SELECT * FROM currency_conversions WHERE id = @id;

-- name: GetGroupConversions :many
SELECT *
FROM currency_conversions
WHERE group_id = @group_id
ORDER BY created_at DESC;

-- name: GetGroupConversionsForBalance :many
SELECT
    id,
    from_currency,
    to_currency,
    rate,
    created_at,
    date
FROM currency_conversions
WHERE group_id = @group_id;

-- name: UpdateCurrencyConversion :one
UPDATE currency_conversions
SET
    from_currency = @from_currency,
    to_currency = @to_currency,
    rate = @rate,
    date = @date
WHERE id = @id
RETURNING *;

-- name: DeleteCurrencyConversion :exec
DELETE FROM currency_conversions WHERE id = @id;
