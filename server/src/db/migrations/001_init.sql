

CREATE TABLE IF NOT EXISTS schema_migrations (
  version   INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  applied_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nonce           TEXT    NOT NULL UNIQUE,
  binding_salt    TEXT    NOT NULL,
  from_address    TEXT    NOT NULL,
  to_address      TEXT    NOT NULL,
  amount          TEXT    NOT NULL,
  endpoint        TEXT    NOT NULL,
  method          TEXT    NOT NULL DEFAULT 'GET',
  status          TEXT    NOT NULL DEFAULT 'PENDING',
  tx_hash         TEXT,
  block_number    INTEGER,
  gas_used        TEXT,
  response_data   TEXT,
  settled_at      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_nonce      ON payments(nonce);
CREATE INDEX IF NOT EXISTS idx_payments_from       ON payments(from_address);
CREATE INDEX IF NOT EXISTS idx_payments_created    ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash    ON payments(tx_hash);

CREATE TRIGGER prevent_payment_tampering
BEFORE UPDATE ON payments
WHEN NEW.nonce        != OLD.nonce
  OR NEW.from_address != OLD.from_address
  OR NEW.to_address   != OLD.to_address
  OR NEW.amount       != OLD.amount
BEGIN
  SELECT RAISE(ABORT, 'Financial payment fields are immutable');
END;

CREATE TRIGGER prevent_payment_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'Payment records cannot be deleted');
END;
