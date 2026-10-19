package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAppVersionMatchesInstaller(t *testing.T) {
	version, err := NewApp().AppVersion()
	if err != nil || version == "" {
		t.Fatalf("embedded installer version: %q, %v", version, err)
	}
}

func TestCheckLatestRelease(t *testing.T) {
	const tag = "v2.10.0"
	const name = "OpenEnd-" + tag + "-windows-amd64-installer.exe"
	const download = "https://github.com/SymphonyW/OpenEnd/releases/download/" + tag + "/" + name
	const notes = "## Changes\n- Improved startup\n- 修复进程分组"
	for _, tc := range []struct {
		name       string
		current    string
		status     int
		tag        string
		assetURL   string
		draft      bool
		prerelease bool
		missing    bool
		malformed  bool
		available  bool
		wantError  bool
	}{
		{name: "numeric version comparison", current: "2.9.9", available: true},
		{name: "same version", current: "2.10.0"},
		{name: "older release", current: "3.0.0"},
		{name: "patch update", current: "2.10.0", tag: "v2.10.1", available: true},
		{name: "draft ignored", current: "2.9.9", draft: true},
		{name: "prerelease ignored", current: "2.9.9", prerelease: true},
		{name: "no releases", current: "2.9.9", status: 404},
		{name: "rate limited", current: "2.9.9", status: 403, wantError: true},
		{name: "server failure", current: "2.9.9", status: 503, wantError: true},
		{name: "invalid JSON", current: "2.9.9", malformed: true, wantError: true},
		{name: "invalid version", current: "2.9.9", tag: "v3.0.0-rc.1", wantError: true},
		{name: "missing installer", current: "2.9.9", missing: true, wantError: true},
		{name: "external installer rejected", current: "2.9.9", assetURL: "https://example.com/installer.exe", wantError: true},
		{name: "wrong repository rejected", current: "2.9.9", assetURL: strings.Replace(download, "SymphonyW", "other", 1), wantError: true},
		{name: "invalid local version", current: "dev", wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("User-Agent") != "OpenEnd/"+tc.current || r.Header.Get("Accept") != "application/vnd.github+json" {
					t.Error("missing GitHub request headers")
				}
				if tc.status != 0 {
					w.WriteHeader(tc.status)
					return
				}
				if tc.malformed {
					_, _ = w.Write([]byte("invalid JSON"))
					return
				}
				releaseTag := tc.tag
				if releaseTag == "" {
					releaseTag = tag
				}
				assetName := "OpenEnd-" + releaseTag + "-windows-amd64-installer.exe"
				assetURL := tc.assetURL
				if assetURL == "" {
					assetURL = "https://github.com/SymphonyW/OpenEnd/releases/download/" + releaseTag + "/" + assetName
				}
				assets := []map[string]string{}
				if !tc.missing {
					assets = append(assets, map[string]string{"name": assetName, "state": "uploaded", "browser_download_url": assetURL})
				}
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"tag_name": releaseTag, "draft": tc.draft, "prerelease": tc.prerelease, "assets": assets, "body": "\n" + notes + "\n",
				})
			}))
			defer server.Close()
			info, err := checkLatestRelease(context.Background(), tc.current, server.Client(), server.URL)
			if (err != nil) != tc.wantError {
				t.Fatalf("error = %v, wantError = %v", err, tc.wantError)
			}
			if info.CurrentVersion != tc.current || info.Available != tc.available {
				t.Fatalf("unexpected update: %+v", info)
			}
			if tc.available && (info.DownloadURL == "" || !strings.HasSuffix(info.DownloadURL, "-installer.exe")) {
				t.Fatalf("expected installer download: %+v", info)
			}
			if tc.available && info.ReleaseNotes != notes {
				t.Fatalf("expected release notes, got %q", info.ReleaseNotes)
			}
			if !tc.available && info.DownloadURL != "" {
				t.Fatalf("unexpected download URL: %+v", info)
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := checkLatestRelease(ctx, "2.1.3", http.DefaultClient, releasesURL); err == nil {
		t.Fatal("expected canceled request to fail")
	}
}

func TestParseReleaseVersionRejectsInvalidTags(t *testing.T) {
	for _, value := range []string{"", "v2.1", "2.1.3.4", "v2.01.3", "v2.1.3-beta", "v2.1.3+build", "v18446744073709551616.0.0"} {
		if _, err := parseReleaseVersion(value); err == nil {
			t.Errorf("expected invalid version %q", value)
		}
	}
}
