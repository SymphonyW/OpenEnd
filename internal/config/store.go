package config

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite"
)

const createCustomProtectedProcessesTableSQL = `
CREATE TABLE IF NOT EXISTS custom_protected_processes (
	name TEXT PRIMARY KEY NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`

const createOperationLogsTableSQL = `
CREATE TABLE IF NOT EXISTS operation_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	action TEXT NOT NULL,
	pid INTEGER NOT NULL DEFAULT 0,
	process_name TEXT NOT NULL DEFAULT '',
	port INTEGER NOT NULL DEFAULT 0,
	result TEXT NOT NULL,
	message TEXT NOT NULL,
	created_at TEXT NOT NULL
);`

const createOperationLogsCreatedAtIndexSQL = `
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
ON operation_logs (created_at DESC, id DESC);`

const createCleanupRulesTableSQL = `
CREATE TABLE IF NOT EXISTS cleanup_rules (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	enabled INTEGER NOT NULL,
	is_builtin INTEGER NOT NULL DEFAULT 0,
	match_process_names TEXT NOT NULL,
	match_command_keywords TEXT NOT NULL,
	match_ports TEXT NOT NULL,
	match_port_ranges TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 1000,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`

// Store persists user-managed configuration.
type Store struct {
	db *sql.DB
}

var storeInitializeMu sync.Mutex

// DefaultDatabasePath returns the SQLite database path for user configuration.
func DefaultDatabasePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}

	return filepath.Join(configDir, "OpenEnd", "settings.sqlite3"), nil
}

// NewDefaultStore opens the default user configuration database.
func NewDefaultStore() (*Store, error) {
	dbPath, err := DefaultDatabasePath()
	if err != nil {
		return nil, err
	}

	return NewStore(dbPath)
}

// NewStore opens a SQLite-backed configuration store and ensures the schema exists.
func NewStore(dbPath string) (*Store, error) {
	if dbPath == "" {
		return nil, fmt.Errorf("configuration database path is empty")
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		return nil, fmt.Errorf("create configuration database directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open configuration database: %w", err)
	}
	db.SetMaxOpenConns(1)

	store := &Store{db: db}
	storeInitializeMu.Lock()
	defer storeInitializeMu.Unlock()
	if err := store.initialize(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

// Close releases the SQLite connection.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}

	return s.db.Close()
}

// GetProtectionSettings returns default and user-managed protected process names.
func (s *Store) GetProtectionSettings(ctx context.Context) (ProtectionSettings, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.validate(); err != nil {
		return ProtectionSettings{}, err
	}

	customNames, err := s.customProtectedProcessNames(ctx)
	if err != nil {
		return ProtectionSettings{}, err
	}

	return ProtectionSettings{
		DefaultProcessNames: DefaultProtectedProcessNames(),
		CustomProcessNames:  customNames,
	}, nil
}

// AddCustomProtectedProcessName persists a user-managed protected process name.
func (s *Store) AddCustomProtectedProcessName(ctx context.Context, name string) (ProtectionSettings, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.validate(); err != nil {
		return ProtectionSettings{}, err
	}

	normalized := NormalizeProcessName(name)
	if normalized == "" {
		return ProtectionSettings{}, fmt.Errorf("custom protected process name cannot be empty")
	}
	if IsDefaultProtectedProcessName(normalized) {
		return ProtectionSettings{}, fmt.Errorf("%s is already protected by the default rules", normalized)
	}

	if _, err := s.db.ExecContext(ctx, `
INSERT INTO custom_protected_processes (name)
VALUES (?)
ON CONFLICT(name) DO NOTHING;`, normalized); err != nil {
		return ProtectionSettings{}, fmt.Errorf("add custom protected process %q: %w", normalized, err)
	}

	return s.GetProtectionSettings(ctx)
}

// DeleteCustomProtectedProcessName removes a user-managed protected process name.
func (s *Store) DeleteCustomProtectedProcessName(ctx context.Context, name string) (ProtectionSettings, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.validate(); err != nil {
		return ProtectionSettings{}, err
	}

	normalized := NormalizeProcessName(name)
	if normalized == "" {
		return ProtectionSettings{}, fmt.Errorf("custom protected process name cannot be empty")
	}
	if IsDefaultProtectedProcessName(normalized) {
		return ProtectionSettings{}, fmt.Errorf("%s is a default protected process and cannot be removed", normalized)
	}

	if _, err := s.db.ExecContext(ctx, `DELETE FROM custom_protected_processes WHERE name = ?;`, normalized); err != nil {
		return ProtectionSettings{}, fmt.Errorf("delete custom protected process %q: %w", normalized, err)
	}

	return s.GetProtectionSettings(ctx)
}

// LoadProtectionRules loads combined default and custom protection rules.
func (s *Store) LoadProtectionRules(ctx context.Context) (ProtectionRules, error) {
	settings, err := s.GetProtectionSettings(ctx)
	if err != nil {
		return ProtectionRules{}, err
	}

	return NewProtectionRules(settings.CustomProcessNames), nil
}

// LoadDefaultProtectionRules opens the default store and loads combined protection rules.
func LoadDefaultProtectionRules(ctx context.Context) (ProtectionRules, error) {
	store, err := NewDefaultStore()
	if err != nil {
		return ProtectionRules{}, err
	}
	defer store.Close()

	return store.LoadProtectionRules(ctx)
}

func (s *Store) initialize(ctx context.Context) error {
	if err := s.validate(); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, createProjectRulesTableSQL); err != nil {
		return fmt.Errorf("initialize project rules: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createCustomProtectedProcessesTableSQL); err != nil {
		return fmt.Errorf("initialize configuration database: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createOperationLogsTableSQL); err != nil {
		return fmt.Errorf("initialize operation logs table: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createOperationLogsCreatedAtIndexSQL); err != nil {
		return fmt.Errorf("initialize operation logs index: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createCleanupRulesTableSQL); err != nil {
		return fmt.Errorf("initialize cleanup rules table: %w", err)
	}
	if err := s.seedDefaultCleanupRules(ctx); err != nil {
		return fmt.Errorf("initialize cleanup rules: %w", err)
	}

	return nil
}

func (s *Store) validate() error {
	if s == nil || s.db == nil {
		return fmt.Errorf("configuration store is not initialized")
	}

	return nil
}

func (s *Store) customProtectedProcessNames(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT name FROM custom_protected_processes ORDER BY name;`)
	if err != nil {
		return nil, fmt.Errorf("list custom protected processes: %w", err)
	}
	defer rows.Close()

	names := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("read custom protected process: %w", err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list custom protected processes: %w", err)
	}

	return names, nil
}
