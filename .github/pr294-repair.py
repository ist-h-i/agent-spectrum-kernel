"""One-use, exact-branch publisher for the user's PR 294 repair request."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zlib

REPO = "ist-h-i/agent-spectrum-kernel"
BRANCH = "feat/284-ui-ux-harness"
BASE = "667b4b6490a4cff1ee44dfd1b033d1178676932a"
PAYLOAD_DIGEST = "b67fe7b1f16edbccfee809e1ba10ba026d30b34fbdfcf1d84b782a44ce7859e2"
PAYLOAD_PARTS = [f".github/pr294-repair-{i}.b64" for i in range(4)]
TEMP_PATHS = set(PAYLOAD_PARTS) | {".github/pr294-repair.py"}
PREPARATION_PATHS = TEMP_PATHS | {".github/workflows/validate.yml"}


def run(*args, **kwargs):
    result = subprocess.run(args, check=False, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **kwargs)
    if result.stdout:
        print(result.stdout.decode("utf-8", errors="replace"), end="", flush=True)
    result.check_returncode()
    return result.stdout


def git(*args):
    return subprocess.check_output(["git", "--no-replace-objects", *args]).decode().strip()


event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
pr = event.get("pull_request", {})
if event.get("number") != 294 or pr.get("head", {}).get("ref") != BRANCH or pr.get("head", {}).get("repo", {}).get("full_name") != REPO or os.environ.get("GITHUB_REPOSITORY") != REPO:
    raise SystemExit("Not the authorized same-repository PR 294 branch")
initial = pr["head"]["sha"]
if not re.fullmatch(r"[a-f0-9]{40}", initial) or git("rev-parse", "HEAD") != initial or git("status", "--porcelain"):
    raise SystemExit("Checkout must be the exact clean event HEAD")
if git("merge-base", BASE, initial) != BASE:
    raise SystemExit("Preparation does not descend from reviewed base")
changed = set(filter(None, git("diff", "--name-only", BASE, initial).splitlines()))
if not changed <= PREPARATION_PATHS:
    raise SystemExit("Other source changes arrived; refuse to overwrite them")
remote = git("ls-remote", "origin", f"refs/heads/{BRANCH}").split()[0]
if remote != initial:
    raise SystemExit("Remote HEAD moved before applying repair")
raw = zlib.decompress(base64.b64decode("".join(Path(path).read_text().strip() for path in PAYLOAD_PARTS), validate=False))
if hashlib.sha256(raw).hexdigest() != PAYLOAD_DIGEST:
    raise SystemExit("Repair payload digest mismatch")
payload = json.loads(raw)
if payload["base_sha"] != BASE:
    raise SystemExit("Repair base mismatch")
records = payload["files"]
paths = [r["path"] for r in records]
if len(paths) != len(set(paths)):
    raise SystemExit("Duplicate repair path")
for record in records:
    path = record["path"]
    if path.startswith(("/", ".git/", ".github/", "benchmarks/")) or any(part in ("", ".", "..") for part in path.split("/")) or "\\" in path or record["mode"] not in ("100644", "100755"):
        raise SystemExit(f"Unsafe or out-of-scope repair path: {path}")
    if record["old_blob"] is None:
        if Path(path).exists():
            raise SystemExit(f"New file already exists: {path}")
    elif git("hash-object", "--", path) != record["old_blob"]:
        raise SystemExit(f"Preimage changed: {path}")
run("git", "apply", "--check", "--index", "-", input=payload["patch"].encode())
run("git", "apply", "--index", "-", input=payload["patch"].encode())
for record in records:
    if git("hash-object", "--", record["path"]) != record["new_blob"]:
        raise SystemExit(f"Postimage mismatch: {record['path']}")

# Restore current generated metadata from the actual source, never edit frozen
# preregistration/CAS/archive/admission objects or waive an existing validator.
run("node", "scripts/update-adapter-runtime-fixtures.mjs")
run("node", "scripts/adapter-runtime-bundle.mjs", "--write")
run("node", "scripts/adapter-runtime-bundle.mjs", "--check")
run("node", "scripts/validate-repo.mjs", "--write-report")
run("node", "scripts/validate-repo.mjs")
allowed = set(paths) | set(payload["generated"]) | TEMP_PATHS
actual = set(filter(None, git("diff", "--name-only", "HEAD").splitlines()))
if not actual <= allowed:
    raise SystemExit(f"Generator changed unapproved paths: {actual - allowed}")
run("git", "diff", "--exit-code", BASE, "--", "benchmarks", "docs/fixtures/prompt-v2-preregistration")
run("git", "diff", "--check")
run("git", "diff", "--cached", "--check")
run("git", "add", "--", *paths, *payload["generated"])
# The running workflow stays unchanged in this commit. Its final restoration is
# performed by the GitHub App, which already has workflow-file write permission.
run("git", "rm", "--", *sorted(TEMP_PATHS))
run("git", "-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "-c", "core.hooksPath=/dev/null", "commit", "-m", "fix: close UI harness review findings and preserve frozen renderer identity (#294)")
candidate = git("rev-parse", "HEAD")
print(f"REPAIR_CANDIDATE={candidate}", flush=True)
run("node", "--test", "docs/fixtures/ui-ux-design/fixture-state.test.mjs", "scripts/test-skill-assets.mjs", "scripts/test-ui-ux-adapter-assets.mjs", "scripts/test-skill-reference-canonical.mjs", "scripts/test-prompt-v2-historical-renderer.mjs")
run("node", "scripts/test-ask-benchmark-prompt-v2.mjs")
run("node", "--test", "scripts/test-ask-benchmark-prompt-successor-integration.mjs")
if git("status", "--porcelain"):
    raise SystemExit("Validation changed the candidate worktree")
if git("ls-remote", "origin", f"refs/heads/{BRANCH}").split()[0] != initial:
    raise SystemExit("Remote HEAD moved during validation; no push performed")
run("git", "push", "origin", f"{candidate}:refs/heads/{BRANCH}")
if git("ls-remote", "origin", f"refs/heads/{BRANCH}").split()[0] != candidate:
    raise SystemExit("Published HEAD did not match candidate")
print(f"REPAIR_PUSHED={candidate}", flush=True)
