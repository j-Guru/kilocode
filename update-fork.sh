#!/bin/bash

# update-fork.sh
# Script to update the main branch of the fork with the latest changes from upstream
# This script automates the process of syncing the fork with the Kilo-Org/kilocode repository

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository!"
    exit 1
fi

# Store the current branch to return to it later
CURRENT_BRANCH=$(git branch --show-current)
print_info "Current branch: $CURRENT_BRANCH"

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_warning "You have uncommitted changes. Please commit or stash them first."
    git status --short
    exit 1
fi

# Check if upstream remote exists
if ! git remote get-url upstream > /dev/null 2>&1; then
    print_error "Upstream remote not configured!"
    print_info "Adding upstream remote: https://github.com/Kilo-Org/kilocode"
    git remote add upstream https://github.com/Kilo-Org/kilocode
fi

print_info "Fetching latest changes from upstream/main..."
git fetch upstream main

print_info "Switching to main branch..."
git checkout main

print_info "Merging upstream/main into local main..."
if git merge upstream/main --no-edit; then
    print_info "Successfully merged upstream changes!"

    # Show the changes that were merged
    print_info "Recent commits:"
    git log --oneline --graph --decorate -5

    # Attempt to push to origin/main
    print_info "Attempting to push to origin/main..."
    if git push origin main --no-verify 2>/dev/null; then
        print_info "Successfully pushed to origin/main!"
    else
        print_warning "Could not push to origin/main (this may be protected)."
        print_info "Your local main branch is updated. You may need to push manually or create a PR."
    fi
else
    print_error "Merge conflicts detected! Please resolve them manually."
    git status
    exit 1
fi

# Return to the original branch if it wasn't main
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_info "Returning to branch: $CURRENT_BRANCH"
    git checkout "$CURRENT_BRANCH"
fi

print_info "Fork update complete!"
