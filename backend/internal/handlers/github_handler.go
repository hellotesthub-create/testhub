package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
)

// GitHubHandler handles fetching test files from GitHub repositories
type GitHubHandler struct{}

// NewGitHubHandler creates a new GitHubHandler
func NewGitHubHandler() *GitHubHandler {
	return &GitHubHandler{}
}

// GitHubFetchRequest represents the request to fetch files from a GitHub repo
type GitHubFetchRequest struct {
	RepoURL string `json:"repo_url"`
	Path    string `json:"path"` // optional subfolder
}

// GitHubFile represents a file found in the GitHub repo
type GitHubFile struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Size        int    `json:"size"`
	DownloadURL string `json:"download_url"`
	Language    string `json:"language"` // python or java
}

// gitHubContentItem represents a single item from the GitHub Contents API
type gitHubContentItem struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Size        int    `json:"size"`
	Type        string `json:"type"` // "file" or "dir"
	DownloadURL string `json:"download_url"`
}

// FetchRepoFiles fetches test script files (.py, .java) from a public GitHub repo
func (h *GitHubHandler) FetchRepoFiles(w http.ResponseWriter, r *http.Request) {
	var req GitHubFetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RepoURL == "" {
		http.Error(w, "repo_url is required", http.StatusBadRequest)
		return
	}

	// Parse GitHub URL to get owner/repo
	owner, repo, err := parseGitHubURL(req.RepoURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid GitHub URL: %v", err), http.StatusBadRequest)
		return
	}

	// Build GitHub API URL
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents", owner, repo)
	if req.Path != "" {
		apiURL += "/" + strings.TrimPrefix(req.Path, "/")
	}

	// Fetch from GitHub API
	files, err := fetchGitHubContents(apiURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch from GitHub: %v", err), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"files":   files,
		"total":   len(files),
	})
}

// parseGitHubURL extracts owner and repo from various GitHub URL formats
func parseGitHubURL(rawURL string) (string, string, error) {
	// Remove trailing slash and .git
	rawURL = strings.TrimSuffix(rawURL, "/")
	rawURL = strings.TrimSuffix(rawURL, ".git")

	// Handle formats:
	// https://github.com/owner/repo
	// https://github.com/owner/repo/tree/branch/path
	// github.com/owner/repo
	rawURL = strings.TrimPrefix(rawURL, "https://")
	rawURL = strings.TrimPrefix(rawURL, "http://")
	rawURL = strings.TrimPrefix(rawURL, "github.com/")

	parts := strings.Split(rawURL, "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("URL must be in format github.com/owner/repo")
	}

	owner := parts[0]
	repo := parts[1]

	if owner == "" || repo == "" {
		return "", "", fmt.Errorf("could not parse owner/repo from URL")
	}

	return owner, repo, nil
}

// fetchGitHubContents recursively fetches .py and .java files from a GitHub directory
func fetchGitHubContents(apiURL string) ([]GitHubFile, error) {
	client := &http.Client{}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "THEX-TestHub")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, fmt.Errorf("repository or path not found")
	}
	if resp.StatusCode == 403 {
		return nil, fmt.Errorf("GitHub API rate limit exceeded. Try again later")
	}
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}

	var items []gitHubContentItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, fmt.Errorf("failed to parse GitHub response: %v", err)
	}

	var files []GitHubFile
	for _, item := range items {
		if item.Type == "file" {
			ext := strings.ToLower(path.Ext(item.Name))
			if ext == ".py" || ext == ".java" {
				lang := "python"
				if ext == ".java" {
					lang = "java"
				}
				files = append(files, GitHubFile{
					Name:        item.Name,
					Path:        item.Path,
					Size:        item.Size,
					DownloadURL: item.DownloadURL,
					Language:    lang,
				})
			}
		} else if item.Type == "dir" {
			// Recurse into subdirectories
			subURL := fmt.Sprintf("%s/%s", strings.TrimSuffix(apiURL, "/"), item.Name)
			subFiles, err := fetchGitHubContents(subURL)
			if err != nil {
				// Skip directories that fail (e.g., rate limit)
				continue
			}
			files = append(files, subFiles...)
		}
	}

	return files, nil
}

// DownloadGitHubFile downloads a single file from GitHub by its raw URL
func DownloadGitHubFile(downloadURL string) ([]byte, error) {
	resp, err := http.Get(downloadURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download file: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("failed to download file (status %d)", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read file content: %v", err)
	}

	return data, nil
}
