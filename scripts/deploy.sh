#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages "deploy from branch").
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
touch dist/.nojekyll
WT=$(mktemp -d)
git fetch origin gh-pages 2>/dev/null || true
if git rev-parse --verify -q origin/gh-pages >/dev/null; then
  git worktree add -B gh-pages "$WT" origin/gh-pages
else
  git worktree add --detach "$WT"
  git -C "$WT" checkout --orphan gh-pages
fi
git -C "$WT" rm -rfq . 2>/dev/null || true
cp -a dist/. "$WT"/
git -C "$WT" add -A
git -C "$WT" commit -qm "Deploy $(git rev-parse --short HEAD)" || echo "nothing to deploy"
git -C "$WT" push origin gh-pages
git worktree remove --force "$WT"
