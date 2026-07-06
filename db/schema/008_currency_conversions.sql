-- +goose Up
CREATE TABLE currency_conversions (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    from_currency   TEXT NOT NULL,
    to_currency     TEXT NOT NULL,
    rate            REAL NOT NULL,      -- 1 from_currency = rate to_currency
    created_at      TEXT NOT NULL,
    date            TEXT NOT NULL,

    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE
) STRICT;

-- +goose Down
DROP TABLE currency_conversions;
