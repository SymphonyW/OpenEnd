package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const releasesURL = "https://api.github.com/repos/SymphonyW/OpenEnd/releases/latest"

//go:embed wails.json
var applicationMetadata []byte

type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	Available      bool   `json:"available"`
	DownloadURL    string `json:"downloadURL"`
}

// AppVersion reads the same version used by the Windows installer.
func (a *App) AppVersion() (string, error) {
	var metadata struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(applicationMetadata, &metadata); err != nil {
		return "", fmt.Errorf("read application version: %w", err)
	}
	if _, err := parseReleaseVersion(metadata.Info.ProductVersion); err != nil {
		return "", err
	}
	return metadata.Info.ProductVersion, nil
}

// CheckForUpdate checks public releases without credentials or blocking startup.
func (a *App) CheckForUpdate() (UpdateInfo, error) {
	version, err := a.AppVersion()
	if err != nil {
		return UpdateInfo{}, err
	}
	return checkLatestRelease(a.appContext(), version, &http.Client{Timeout: 10 * time.Second}, releasesURL)
}

func checkLatestRelease(ctx context.Context, current string, client *http.Client, endpoint string) (UpdateInfo, error) {
	info := UpdateInfo{CurrentVersion: current}
	currentVersion, err := parseReleaseVersion(current)
	if err != nil {
		return info, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return info, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "OpenEnd/"+current)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := client.Do(req)
	if err != nil {
		return info, fmt.Errorf("check GitHub release: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return info, nil // No published stable release yet.
	}
	if response.StatusCode != http.StatusOK {
		return info, fmt.Errorf("check GitHub release: HTTP %d", response.StatusCode)
	}
	var release struct {
		TagName    string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name  string `json:"name"`
			State string `json:"state"`
			URL   string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&release); err != nil {
		return info, fmt.Errorf("read GitHub release: %w", err)
	}
	if release.Draft || release.Prerelease {
		return info, nil
	}
	latestVersion, err := parseReleaseVersion(release.TagName)
	if err != nil {
		return info, err
	}
	info.LatestVersion = strings.TrimPrefix(release.TagName, "v")
	newer := false
	for i := range currentVersion {
		if latestVersion[i] != currentVersion[i] {
			newer = latestVersion[i] > currentVersion[i]
			break
		}
	}
	if !newer {
		return info, nil
	}
	name := "OpenEnd-" + release.TagName + "-windows-amd64-installer.exe"
	expectedURL := "https://github.com/SymphonyW/OpenEnd/releases/download/" + release.TagName + "/" + name
	for _, asset := range release.Assets {
		if asset.Name == name && asset.State == "uploaded" && asset.URL == expectedURL {
			info.Available = true
			info.DownloadURL = expectedURL
			return info, nil
		}
	}
	return info, fmt.Errorf("latest release installer is not available yet")
}

var releaseVersionPattern = regexp.MustCompile(`^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

func parseReleaseVersion(value string) ([3]uint64, error) {
	var version [3]uint64
	parts := releaseVersionPattern.FindStringSubmatch(value)
	if parts == nil {
		return version, fmt.Errorf("invalid stable version: %q", value)
	}
	for i := range version {
		number, err := strconv.ParseUint(parts[i+1], 10, 64)
		if err != nil {
			return version, fmt.Errorf("invalid stable version: %q", value)
		}
		version[i] = number
	}
	return version, nil
}
