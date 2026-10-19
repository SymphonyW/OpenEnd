package config

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestProjectRulesPersistReplaceAndDelete(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "settings.sqlite3")
	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(dir, "source")
	if err := store.SetProjectRule(ctx, source, dir); err != nil {
		t.Fatal(err)
	}
	if err := store.SetProjectRule(ctx, source, ""); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	rules, err := store.GetProjectRules(ctx)
	if err != nil || len(rules) != 1 || rules[0].ProjectPath != "" {
		t.Fatalf("rules=%+v err=%v", rules, err)
	}
	if err := store.DeleteProjectRule(ctx, source); err != nil {
		t.Fatal(err)
	}
	rules, err = store.GetProjectRules(ctx)
	if err != nil || len(rules) != 0 {
		t.Fatalf("rules=%+v err=%v", rules, err)
	}
	if err := store.SetProjectRule(ctx, "relative", dir); err == nil {
		t.Fatal("relative source must be rejected")
	}
	sub := filepath.Join(source, "frontend")
	sibling := source + "-other"
	for _, path := range []string{source, sub, sibling} {
		if err := store.SetProjectRule(ctx, path, dir); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.ResetProjectRules(ctx, sub); err != nil {
		t.Fatal(err)
	}
	rules, err = store.GetProjectRules(ctx)
	if err != nil || len(rules) != 1 || rules[0].SourcePath != strings.ToLower(sibling) {
		t.Fatalf("reset affected wrong directories: %+v, %v", rules, err)
	}
}
