// Test-only historical context. Never reseals authority or enables execution.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skillAssets } from "./skill-assets.mjs";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SPECS = [
  ["docs/mac-ask-full-static-inventory.json", "3634c9ef3801067636d990a63f1793c268390ccb4012a1e2f1c4ac2e5b566bed"],
  ["docs/mac-ask-full-reference-supplement.json", "466da3374a9d2311a335ebf7113288dccd1d1c25c9a5b9e278f4d03e61a05b5f"],
];
// These public input/authority snapshots belong only to isolated historical tests.
// Keep both matching fixture tuples separate from current model inputs/resources.
const TASK_REVISION = "9068e22a1c48378d0c266a103e3f8fb93861942e";
const TASK_ROOT = "benchmarks/fixtures/checkpoint-b2";
const TASK_SNAPSHOTS = [
  ["mp-ci-evidence-gap", [
    ["evaluator-authority-manifest.json", "43ebe7dfef5f3c9bfed0fab1685d5a76f08619471c3f162afdc01a963002186f", 3166],
    ["evaluator-reference.json", "16aa4e11e6dd3cae7ae9b1d445b388f3b4177d9c797fa833657bc5ed03f7ddb2", 78981],
    ["evidence-map.json", "146b45641be4c788c59865063253036f171f6e8f682592fe771475fce0702102", 3936],
    ["final-admission-record.json", "2e4aa7d9c1d03a2fc121418aaa1fb71a98f23e23e437912ca5533fa4bec4e300", 79177],
    ["input-manifest.json", "13e5d0c70feffed4db0bdf68b2b89b9b15005c53525a8e5b10d9198775d7ac25", 2698],
    ["metadata.json", "42fe52179c50670c5cb5627d7b352c0b4e0635f36908862c8a48ef6d0559dda0", 1138],
    ["output-contract.json", "0eb1b1c5e204c02a8ca1eba43edef17688f6c5bf9e9ce59952800d16e791678d", 1854],
    ["requirement-record.json", "e2096789a3e6165e650471d5fa434f0e6224f0f9979690658f782598dae60cb4", 3987],
    ["scoring-input-freeze-manifest.json", "b1883a5f30545f45ab6c8d8ec26d84dcc1d3cace48e22e900c62575852b5a7ca", 3787],
    ["task.md", "4247670f22a882a630aadc8688e6ed9a7c7040fb31aad17bbab7a6bb831fa435", 437],
    ["verification-command-contract.json", "5426f0f2b1f82047f23cc6a76bd7689a2c22d7165d67af72a56df90072b78e78", 2748],
    ["workspace/.github/workflows/pull-request.yml", "d1a079e6bf8aea15c532c1ee06e9f505e92e40f6492be626dc8fd24f86eb382c", 431],
    ["workspace/ci/pull-request-314.log", "8cdd6705480e8b6a859bf40098fe0e3c358564c1e775acd14d8bb8c55ec98fd6", 403],
    ["workspace/docs/verification.md", "04b970363da50dd818517c0be65bd5e832e791d98d420bc978e9d1b5da702639", 529],
    ["workspace/package-lock.json", "1441bbf380d78c27f1604d32ba6c31806099a8d1e533877cd058c462e2b77723", 218],
    ["workspace/package.json", "849ad5e187dfe0a542479aef8411203d606559ab0f140865601913e165a88fe7", 373],
    ["workspace/pr.diff", "903d8a715665c7091aa7b7a0dba214235079abed3b09faa20510e46c64fbe834", 541],
    ["workspace/review.schema.json", "22e7984d1a6b3c8e92177500b7a566d5f0cc06fa5325acc55dc6c4dc6e91a62a", 1849],
    ["workspace/scripts/upload-diagnostics.mjs", "4f82ac80e4c5622d0e33bdd44c8e01628ed63eee9a2d313a1cd0c6e73857dd2c", 138],
    ["workspace/scripts/validate-review.mjs", "008cd831c8e38041af31be0cbbdc8fcb3b42ba45006492fbf32b870814882422", 2210],
    ["workspace/src/quote-order.mjs", "9b74bbd8aebbce93ccaca984dee24dcdef2161e219c6bb9f609381a46a7a43f4", 398],
    ["workspace/test/checkout/quote-order-contract.test.mjs", "92ec6bc43700ff64ae2c6d83725a3f71c1c871a5d9545a228f41f452f237f1fa", 381],
    ["workspace/test/unit/quote-order.test.mjs", "d82815c4131eb7fe5d42b83d88658bd6c3814b542203c15566848b2d4150e0c5", 664],
  ]],
  ["mn-focused-regression-test", [
    ["evaluator-authority-manifest.json", "9df361de0823c9cdb0fc29f26f86af6b7add8f12ab220cccb6839485e37d966a", 3152],
    ["evaluator-reference.json", "5f87f3ee691c0ebbb1840c75cdd8bb598b7a405999652e83866cc92f4ee397e4", 78995],
    ["evidence-map.json", "3890b9bd28d8d551cfbf930edaffa9482a2d160b12b7b0ef892afbae76fdb10c", 2937],
    ["final-admission-record.json", "240e82713723f3a53c54b1d3fb0d4d67de38e424e1c4b5249ccd992713d92f1b", 79152],
    ["input-manifest.json", "065c84ece98ef98807a63b14790abd368ace054f0194f3e5bcf40e9c0fd9797b", 1180],
    ["metadata.json", "18659c7e1aebd7c9f1841cfa8df32c357659b56d9b33fa8570c58d07028e9d44", 1163],
    ["output-contract.json", "8906c05bef4d186331c4aa114a80a7c0cfe534642281062525f9efbcae5a3f34", 1911],
    ["requirement-record.json", "77e33e9849c84c129999e406376ce79f4669040ac7049174d62ae1f7d8a4dd7d", 3460],
    ["scoring-input-freeze-manifest.json", "50a120bd71749c6d6e754176f768c555a765c564989cc2f41f9a4a1ae30f9991", 3869],
    ["task.md", "5aa2b6adf6b39676b6fe0e877dee32dce34ff8e40ca9fd7fe867b0f9697a3edb", 440],
    ["verification-command-contract.json", "c3d48711701c8c4d8e3be2df938df964a4bb7f6050b7cc73d8e9c9abb5a04347", 1879],
    ["workspace/package.json", "9917efea8e57cb07719d5af2c2b97aaa556cdfe220279b9d2b73336501d7ca2e", 186],
    ["workspace/spec/session-key.md", "0962415189e2a2c12a5ebff7db8d149524a7409eeb342b814251d1a0caa24bad", 435],
    ["workspace/src/session-key.mjs", "34cbda6cafabd736e07b262a655bcbbfb92cbe6af0409803a8b2545bfa9cc510", 420],
    ["workspace/test/session-key.test.mjs", "72c2db145559a241d1f315efda792cb105c9fce4e153ae6b0e12ca67ba38500a", 451],
  ]],
];
const SHARED_TASK_FILES = [
  ["benchmarks/portfolio-catalog.json", "cfd967bfb0b4a1a479e856c1d5e135bc87bc90b9427c2f33a935d315391439f8", 29625],
  ["benchmarks/portfolio-policy-manifest.json", "36fee800e7a8c943142d8d3d056e149adf773a72ee5b2373b03f5ad231752bcf", 1386],
  ["benchmarks/portfolio-scoring-policy.json", "17ef3a12d0df9cf3842f4de2199171a6cd4cdb7b10ac528a091fbd70e60edb01", 18605],
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (root, args, encoding = "utf8") => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
  encoding, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
});
export function historicalSourceEntries(root) {
  const entries = new Map();
  let selectedSkills;
  for (const [path, digest] of SPECS) {
    assert.ok(lstatSync(resolve(root, path)).isFile() && !lstatSync(resolve(root, path)).isSymbolicLink(), "historical manifest must be regular");
    const bytes = readFileSync(resolve(root, path));
    assert.equal(hash(bytes), digest, "historical manifest drift");
    const manifest = JSON.parse(bytes);
    assert.match(manifest.source_commit, /^[a-f0-9]{40}$/u);
    selectedSkills ??= manifest.selected_skills;
    const records = manifest.assets ?? [...manifest.core_sources, ...manifest.renderer_inputs.canonical,
      ...manifest.renderer_inputs.adapter_owned, manifest.kernel_renderer_source];
    for (const entry of records) {
      assert.match(entry.path, /^(?:skills|scripts|schemas|docs|adapters)\/[A-Za-z0-9._/-]+$|^(?:AGENTS\.md|CUSTOM_INSTRUCTIONS\.md|README\.md|manifest\.json)$/u);
      assert.ok(!entry.path.split("/").some(part => ["", ".", ".."].includes(part)), "unsafe historical path");
      assert.match(entry.digest, /^sha256:[a-f0-9]{64}$/u);
      const mode = git(root, ["ls-tree", manifest.source_commit, "--", entry.path]).trim();
      assert.match(mode, /^100(?:644|755) blob [a-f0-9]{40}\t/u, "historical source must be regular");
      const value = git(root, ["show", `${manifest.source_commit}:${entry.path}`], null);
      assert.equal(`sha256:${hash(value)}`, entry.digest, `historical source drift: ${entry.path}`);
      if (entries.has(entry.path)) assert.equal(hash(entries.get(entry.path).value), hash(value), "conflicting historical sources");
      entries.set(entry.path, { value });
    }
  }
  const taskFiles = [...TASK_SNAPSHOTS.flatMap(([fixture, files]) => files.map(([path, digest, bytes]) =>
    [`${TASK_ROOT}/${fixture}/${path}`, digest, bytes])), ...SHARED_TASK_FILES];
  assert.equal(taskFiles.length, 41, "historical public fixture closure changed");
  for (const [path, digest, bytes] of taskFiles) {
    assert.match(path, /^benchmarks\/(?:fixtures\/checkpoint-b2\/(?:mp-ci-evidence-gap|mn-focused-regression-test)\/(?:task\.md|(?:input-manifest|verification-command-contract|evaluator-reference|scoring-input-freeze-manifest|metadata|evaluator-authority-manifest|evidence-map|final-admission-record|output-contract|requirement-record)\.json|workspace\/[A-Za-z0-9._/-]+)|portfolio-(?:catalog|policy-manifest|scoring-policy)\.json)$/u);
    assert.ok(!path.split("/").some(part => ["", ".", ".."].includes(part)), "unsafe historical task path");
    assert.equal(entries.has(path), false, "conflicting historical task source");
    const mode = git(root, ["ls-tree", TASK_REVISION, "--", path]).trim();
    assert.match(mode, /^100(?:644|755) blob [a-f0-9]{40}\t/u, "historical task source must be regular");
    const value = git(root, ["show", `${TASK_REVISION}:${path}`], null);
    assert.equal(value.length, bytes, `historical task byte length drift: ${path}`);
    assert.equal(hash(value), digest, `historical task source drift: ${path}`);
    entries.set(path, { value });
  }
  return { entries, selectedSkills };
}
export function prepareHistoricalFullTestRoot(root, destination) {
  const target = resolve(destination);
  assert.ok(!existsSync(target), "test destination must be new");
  const before = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  assert.equal(before, "", "historical compatibility requires a clean source checkout");
  const { entries, selectedSkills } = historicalSourceEntries(root);
  const revision = git(root, ["rev-parse", "HEAD"]).trim();
  git(root, ["clone", "--quiet", "--no-hardlinks", "--no-checkout", root, target]);
  git(target, ["checkout", "--quiet", "--detach", revision]);
  for (const [path, { value }] of entries) {
    let cursor = target;
    for (const part of path.split("/")) {
      cursor = resolve(cursor, part);
      assert.equal(lstatSync(cursor).isSymbolicLink(), false, "historical destination symlink");
    }
    assert.ok(lstatSync(cursor).isFile());
    writeFileSync(cursor, value);
  }
  // Recursive reference discovery must see exactly the sealed asset set.
  // Removal is confined to this newly created isolated checkout.
  const removed = new Set();
  for (const asset of skillAssets(target, selectedSkills)) {
    if (!entries.has(asset.sourcePath)) {
      removed.add(asset.sourcePath);
      rmSync(resolve(target, asset.sourcePath));
    }
  }
  const changed = git(target, ["diff", "--name-only"]).trim().split("\n").filter(Boolean);
  assert.ok(changed.every(path => entries.has(path) || removed.has(path)), "unexpected historical context change");
  git(target, ["add", "--", ...entries.keys(), "skills"]);
  git(target, ["-c", "user.name=ASK historical test", "-c", "user.email=synthetic-test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "test-only immutable Full source context"]);
  assert.equal(git(target, ["rev-parse", "HEAD^"]).trim(), revision, "historical context parent changed");
  for (const path of git(root, ["ls-files", "scripts"]).trim().split("\n")) {
    if (!entries.has(path)) assert.deepEqual(readFileSync(resolve(target, path)), readFileSync(resolve(root, path)), `current script replaced: ${path}`);
  }
  assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), revision, "source HEAD changed");
  assert.equal(git(root, ["status", "--porcelain", "--untracked-files=normal"]), before, "source checkout changed");
  return target;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3);
  process.stdout.write(`${prepareHistoricalFullTestRoot(ROOT, process.argv[2])}\n`);
}
