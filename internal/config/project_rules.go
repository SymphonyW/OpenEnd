package config

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
)

const createProjectRulesTableSQL = `CREATE TABLE IF NOT EXISTS project_rules (
	source_path TEXT PRIMARY KEY NOT NULL,
	project_path TEXT NOT NULL
);`

// ProjectRule assigns a working directory and its descendants to a project.
// An empty ProjectPath explicitly excludes that directory from grouping.
type ProjectRule struct {
	SourcePath  string `json:"sourcePath"`
	ProjectPath string `json:"projectPath"`
}

func (s *Store) GetProjectRules(ctx context.Context) ([]ProjectRule, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT source_path, project_path FROM project_rules ORDER BY length(source_path) DESC, source_path`)
	if err != nil {
		return nil, fmt.Errorf("load project rules: %w", err)
	}
	defer rows.Close()
	rules := make([]ProjectRule, 0)
	for rows.Next() {
		var rule ProjectRule
		if err := rows.Scan(&rule.SourcePath, &rule.ProjectPath); err != nil {
			return nil, fmt.Errorf("read project rule: %w", err)
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

func (s *Store) SetProjectRule(ctx context.Context, sourcePath, projectPath string) error {
	if !filepath.IsAbs(sourcePath) || filepath.Dir(filepath.Clean(sourcePath)) == filepath.Clean(sourcePath) {
		return fmt.Errorf("project rule source must be an absolute directory below a drive root")
	}
	if projectPath != "" && !filepath.IsAbs(projectPath) {
		return fmt.Errorf("project path must be absolute")
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO project_rules (source_path, project_path) VALUES (?, ?)
		ON CONFLICT(source_path) DO UPDATE SET project_path = excluded.project_path`, strings.ToLower(filepath.Clean(sourcePath)), projectPath)
	if err != nil {
		return fmt.Errorf("save project rule: %w", err)
	}
	return nil
}

func (s *Store) DeleteProjectRule(ctx context.Context, sourcePath string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM project_rules WHERE source_path = ?`, strings.ToLower(filepath.Clean(sourcePath)))
	if err != nil {
		return fmt.Errorf("delete project rule: %w", err)
	}
	return nil
}

// ResetProjectRules removes all covering rules in one transaction. This also
// handles a temporary assignment masking a saved rule, or nested saved rules.
func (s *Store) ResetProjectRules(ctx context.Context, directory string) error {
	if directory == "" {
		return nil
	}
	rules, err := s.GetProjectRules(ctx)
	if err != nil {
		return err
	}
	directory = strings.ToLower(filepath.Clean(directory))
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("reset project rules: %w", err)
	}
	defer tx.Rollback()
	for _, rule := range rules {
		if directory == rule.SourcePath || strings.HasPrefix(directory, rule.SourcePath+string(filepath.Separator)) {
			if _, err := tx.ExecContext(ctx, `DELETE FROM project_rules WHERE source_path = ?`, rule.SourcePath); err != nil {
				return fmt.Errorf("reset project rule: %w", err)
			}
		}
	}
	return tx.Commit()
}
