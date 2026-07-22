#!/bin/bash
# Script to set up branch protection for the main branch in the corelyx/Corelyx repository
# Requires: GitHub CLI (gh) installed and authenticated with sufficient permissions

set -euo pipefail

# Configuration
OWNER="corelyx"
REPO="Corelyx"
BRANCH="main"

# Check if gh is available
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed. Please install it first."
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: GitHub CLI is not authenticated. Please run 'gh auth login' first."
    exit 1
fi

# Verify we are in the corelyx organization
if ! gh api orgs/$OWNER &> /dev/null; then
    echo "Error: Organization '$OWNER' not found or you don't have access. Please create it first with 'gh org create $OWNER'."
    exit 1
fi

# Verify the repository exists in the organization
if ! gh api repos/$OWNER/$REPO &> /dev/null; then
    echo "Error: Repository '$OWNER/$REPO' not found or you don't have access. Please transfer it first with 'gh repo transfer <current-owner>/$REPO $OWNER/$REPO'."
    exit 1
fi

echo "Setting up branch protection for $OWNER/$REPO on branch '$BRANCH'..."

# Define the branch protection configuration
# Note: We are using the GitHub REST API via gh api
# More details: https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2022-11-28#update-branch-protection

read -r -d '' BRANCH_PROTECTION_PAYLOAD <<'EOF'
{
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Security",
      "Tests & Codegen Check",
      "Desktop Release"
    ]
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": true
  },
  "allow_fork_syncing": false
}
EOF

# Apply the branch protection
if gh api \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/$OWNER/$REPO/branches/$BRANCH/protection \
  -f "$(cat <<<"$BRANCH_PROTECTION_PAYLOAD")"; then
    echo "Branch protection successfully applied to $OWNER/$REPO:$BRANCH"
else
    echo "Failed to apply branch protection"
    exit 1
fi