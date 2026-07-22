# GitHub Governance & CI/CD Hardening Sprint - Steps for Nicolas

## Prerequisites
- GitHub CLI (`gh`) installed and authenticated
- Vercel CLI (`vercel`) installed and authenticated
- You must have permission to create an organization and transfer repositories in GitHub
- You must have permission to create teams and transfer projects in Vercel

## Steps

### 1. Authenticate with GitHub
```bash
gh auth login
```
- Follow the prompts to authenticate with your GitHub account.
- Ensure you have permission to create organizations and transfer repositories.

### 2. Create the GitHub Organization
```bash
gh org create corelyx
```
- This creates the `corelyx` organization on GitHub.

### 3. Transfer the Repository to the Organization
```bash
gh repo transfer NicolasKrusche/Corelyx corelyx/Corelyx
```
- This transfers the `Corelyx` repository from your personal account to the `corelyx` organization.

### 4. Apply Branch Protection Rules
Run the provided script to apply branch protection rules to the `main` branch:
```bash
./scripts/set_branch_protection.sh
```
- This script will configure the `main` branch with:
  - Required pull request reviews (1 approving review, dismiss stale reviews, require code owner reviews)
  - Required status checks (strict, but no specific contexts required - adjust as needed)
  - Linear history (no merge commits)
  - No force pushes allowed
  - No deletions allowed
  - Block branch creation
  - Include administrators

### 5. Create Vercel Team
```bash
vercel team create corelyx
```
- This creates a Vercel team named `corelyx`.

### 6. Transfer Vercel Project to the Team
First, list your Vercel projects to get the project ID:
```bash
vercel projects
```
Then transfer the project (replace `<project-id>` with the actual ID of your Corelyx project):
```bash
vercel project transfer <project-id> corelyx
```

### 7. Link Vercel Project to GitHub Repository
- In the Vercel dashboard, go to your project settings.
- Under the "Git" section, ensure the project is linked to the `corelyx/Corelyx` repository on GitHub.
- If not, link it now.

### 8. Verify Branch Protection
Visit the branch protection settings on GitHub to verify:
https://github.com/corelyx/Corelyx/branches

## Additional Notes
- The script `./scripts/set_branch_protection.sh` uses the GitHub API to apply branch protection. It assumes the repository has been transferred and you are authenticated.
- If you need to adjust the branch protection rules (e.g., add specific status checks), edit the `BRANCH_PROTECTION` JSON in the script before running.
- After transferring the Vercel project, you may need to rebuild and redeploy the project to ensure environment variables and integrations are correctly transferred.

## Verification
- GitHub: Branch protection rules are enabled on `main`.
- Vercel: Project is under the `corelyx` team and linked to the `corelyx/Corelyx` repository.
- GitHub Organization: `corelyx` exists and contains the `Corelyx` repository.

## Troubleshooting
- If the script fails due to authentication, ensure you are logged in with `gh auth login` and have the necessary scopes (admin:org, repo, admin:org_hook).
- If the repository transfer fails, ensure you have the necessary permissions in both the personal account and the organization.
- If Vercel commands fail, ensure you are logged in with `vercel login` and have the correct team permissions.