-- +goose Up
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT,
    created_at TEXT NOT NULL,
    role INTEGER NOT NULL,
    expense_group_ids INTEGER,
    avatar_data BLOB,
    avatar_mime_type TEXT,
    avatar_updated_at TEXT
) STRICT;

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expired_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE expense_groups (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
	default_currency TEXT NOT NULL,
    description TEXT
) STRICT;

CREATE TABLE user_expense_groups (
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,

    PRIMARY KEY (user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    date TEXT NOT NULL,
    group_id TEXT NOT NULL,
    recurring_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    currency TEXT NOT NULL,

    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (recurring_id) REFERENCES recurring_expenses(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE expense_payers (
    id              TEXT PRIMARY KEY,
    expense_id      TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    amount          INTEGER NOT NULL,

    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE expense_beneficiaries (
    id              TEXT PRIMARY KEY,
    expense_id      TEXT NOT NULL,
    user_id         TEXT NOT NULL,

    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE transfers (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    sender_id       TEXT NOT NULL,
    receiver_id     TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    currency        TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    date            TEXT NOT NULL,

    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE recurring_expenses (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
    start_date TEXT NOT NULL,
    next_occurrence TEXT NOT NULL,

    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE
) STRICT;

-- +goose Down
DROP TABLE users;
DROP TABLE sessions;
DROP TABLE expense_groups;
DROP TABLE user_expense_groups;
DROP TABLE expenses;
DROP TABLE expense_payers;
DROP TABLE expense_beneficiaries;
DROP TABLE recurring_expenses;
DROP TABLE transfers;