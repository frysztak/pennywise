-- +goose Up
CREATE TABLE group_currencies (
    group_id TEXT NOT NULL,
    currency TEXT NOT NULL,

    PRIMARY KEY (group_id, currency),
    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE
) STRICT;

INSERT INTO group_currencies (group_id, currency)
SELECT id, default_currency FROM expense_groups;

-- +goose Down
DROP TABLE group_currencies;
