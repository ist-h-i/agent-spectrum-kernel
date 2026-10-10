# Mac / Codex の導入・復旧 quickstart

導入後に受け取る開発成果物を確かめる次の一件は
[初回開発受入の準備](first-workflow-mac-codex-ja.md) にあります。
公開人工タスクと軽量 bypass 入力を用意する段階までをモデル不要で実行できます。

ASK を導入すると、プロジェクト内に判断方針、選択した Skill、検証・handoff 用の資料が揃います。変更の根拠と未確認事項を明示するための仕組みです。導入だけで成果改善や実務での動作を保証するものではありません。

English claim boundary: ASK installs project-local instructions and selected
verification/handoff assets. Installation alone proves neither an operational
Codex workflow nor improved engineering outcomes.

この手順は [#173 の既存 setup CLI](adoption-setup.md) と
[exact Plan の apply](adoption-apply.md) を使います。モデル不要の
確認では、Codex CLI・認証・モデル通信を起動しません。

## 対応条件と現在の証拠

| 項目 | 条件 / 証拠の範囲 |
| --- | --- |
| ローカル導入・復旧の検証対象 | macOS、Node 24.x、Git、完全な ASK checkout。実測ホストは [release package](release-package-2026-10.md) に記録 |
| adapter / profile | `codex` の `minimal` → `implementation`。同じ source の profile 更新と復旧を検証 |
| path | source と target は包含関係にない別ディレクトリ。保存 Plan は両方の外。リンク経由の入力は不可。Mac の一時ディレクトリは実パスで指定 |
| target | 最初は使い捨ての Git repository。project-owned の instruction とコードを含めて確認 |
| 本物の Codex workflow | 未検証。利用者が別途選んだ CLI/version/profile、通常の認証、実行条件、bounded task の証拠が必要 |
| 他の profile / Claude | 公開 profile は `inspect` で確認。今回の Mac smoke の成功を転用しない |
| Windows / Linux / Mac x64 | 後続の実ホスト確認。削除・合格扱いにはしない。[#315 の platform route](local-eval-distribution.md) と導入証拠は別 |

この quickstart の導入条件と、モデルを使う local eval の OS・sandbox
条件は別です。Mac 全機種・全 OS version の検証を意味しません。

## 一コマンドで導入・復旧を確認する

ASK checkout で実行します。外部サービスも依存のインストールも不要です。

```bash
node scripts/test-release-install-recovery.mjs
# 各 CLI の終了コードと証拠の範囲も見る場合
node scripts/test-release-install-recovery.mjs --json
```

script は自分で作った人工 repository だけを操作し、最後に削除します。
任意の `--target` は受け付けません。inspect → recommend → plan → check →
dry-run → apply → doctor、再適用、profile 更新、rollback、drift 拒否、detach
を既存 CLI で確認します。これは実際の開発 task を実行する demo ではありません。

## 手順を確認しながら導入する

ASK checkout に移動し、外部に人工 target と Plan の保存先を作ります。
`minimal` は検証・handoff 中心の小さな入口です。実装用 profile の選択は
`recommend --purpose implementation` の候補と差分を確認して判断します。
recommendation は capability に基づき、効果実測済みの選択ではありません。

```bash
cd /path/to/agent-spectrum-kernel
ASK_DEMO_ROOT="$(node -e 'const fs=require("node:fs"),p=require("node:path"),os=require("node:os"); console.log(fs.realpathSync(fs.mkdtempSync(p.join(os.tmpdir(),"ask-mac-demo-"))))')"
ASK_TARGET="$ASK_DEMO_ROOT/project"
mkdir "$ASK_TARGET"
git -C "$ASK_TARGET" init -q
printf '# Project rules\n\nKeep project-owned policy.\n' > "$ASK_TARGET/AGENTS.md"

node scripts/ask-setup.mjs inspect --target "$ASK_TARGET" --json
node scripts/ask-setup.mjs recommend --target "$ASK_TARGET" --adapter codex --purpose implementation --json
node scripts/ask-setup.mjs plan --target "$ASK_TARGET" --adapter codex --profile minimal --output "$ASK_DEMO_ROOT/install.json" --json
node scripts/ask-setup.mjs check --target "$ASK_TARGET" --plan "$ASK_DEMO_ROOT/install.json" --json
node scripts/ask-setup.mjs apply --target "$ASK_TARGET" --plan "$ASK_DEMO_ROOT/install.json" --dry-run --json
```

Plan の `operations`、`preservation`、profile、capability downgrade を確認します。
source、target、Node / OS / architecture / umask が変わったら Plan を再生成します。
保存ファイルを編集して流用したり、Plan にない変更を apply の flag で足したりしません。

以下の明示的な apply が、確認した exact Plan の書き込み承認になります。
人工 target への導入後に何が残るかは `doctor` と保存 state で確認できます。

```bash
node scripts/ask-setup.mjs apply --target "$ASK_TARGET" --plan "$ASK_DEMO_ROOT/install.json" --json
node scripts/ask-setup.mjs doctor --target "$ASK_TARGET" --json
```

| 状態 | この手順で確認すること |
| --- | --- |
| Installed | apply が `applied`、doctor の Installed が `pass`。管理 state / projection が整合する |
| Activated | `insufficient_evidence`。profile を置いたことから、人間の利用判断・実行環境の採用を推測しない |
| Operational | `insufficient_evidence`。bounded workflow と contract 適用の実行証拠は別に必要 |

同じ source と exact 最終 target に対する同じ Plan の再適用は
`already_applied` です。導入後の local change を修復・上書きする機能ではありません。
doctor が `fail` の場合は終了コード `1` です。出力があっても成功扱いにしません。
以前の source から残された Skill は `warn` になり得ます。現行 source にない
retained Skill でも管理 hash は検査され、改変されていれば `fail` になります。

実務受入の次の確認は、別途承認した人工 task での変更・検証・handoff と
軽量 bypass / stop の証拠です。今回のモデル不要手順では未実施です。
[release package の残件](release-package-2026-10.md) を確認してください。

## 更新と rollback

更新では新しい source / target に対して Plan を作り直します。次は同じ
source 内での `minimal` → `implementation` 更新例です。別 version 間の
互換性確認を代替しません。

```bash
node scripts/ask-setup.mjs plan --target "$ASK_TARGET" --adapter codex --profile implementation --output "$ASK_DEMO_ROOT/update.json" --json
node scripts/ask-setup.mjs apply --target "$ASK_TARGET" --plan "$ASK_DEMO_ROOT/update.json" --dry-run --json
# 更新差分を確認して承認した場合
node scripts/ask-setup.mjs apply --target "$ASK_TARGET" --plan "$ASK_DEMO_ROOT/update.json" --json
node scripts/ask-setup.mjs doctor --target "$ASK_TARGET" --json
```

復旧は adapter、kernel の逆順です。各 dry-run の内容を確認し、その操作を
承認した場合だけ `--dry-run` を外します。

```bash
node scripts/install-codex-adapter.mjs --target "$ASK_TARGET" --rollback --dry-run
node scripts/install-codex-adapter.mjs --target "$ASK_TARGET" --rollback
node scripts/install-kernel.mjs --target "$ASK_TARGET" --rollback --dry-run
node scripts/install-kernel.mjs --target "$ASK_TARGET" --rollback
node scripts/ask-setup.mjs doctor --target "$ASK_TARGET" --json
```

rollback は各 installer の直前の snapshot を使います。成功した update
なら前の管理状態へ、初回導入なら導入前の管理範囲へ戻します。全 repository
の transaction や任意の古い version への復元ではありません。

## detach と既知の制約

利用を外す場合も adapter、kernel の順です。

```bash
node scripts/install-codex-adapter.mjs --target "$ASK_TARGET" --detach --dry-run
node scripts/install-codex-adapter.mjs --target "$ASK_TARGET" --detach
node scripts/install-kernel.mjs --target "$ASK_TARGET" --detach --dry-run
node scripts/install-kernel.mjs --target "$ASK_TARGET" --detach
```

detach は ASK 管理ファイルと managed block を外し、state を `detached`
として残します。initialize-once の project-owned 資料、利用者のコード・
instruction、空ディレクトリは残り得ます。global Codex の uninstall は行いません。
detach 後の doctor を Operational 成功確認として使いません。

managed file の drift、symlink、hardlink、特殊ファイル、保存 Plan の不一致、
in-progress marker があると停止します。`--force` や marker の削除で回避せず、
人工 repo の smoke、apply 結果の `recovery`、既存 state を確認します。
partial failure は「変更なし」とは限りません。復旧時も project-owned state
を含む全体 rollback は保証されません。

profile 縮小には既存 installer の `--prune` が必要な場合があります。
`ask-setup` には `--prune` はありません。今回の拡張更新例を逆向きに流用せず、
[adapter migration](adapter-runtime-migration.md) の管理範囲を確認して別に計画します。

setup / installer / doctor はローカルのファイル検査です。Plan は path、digest、
変更予定を含むので私的に保存します。global 認証設定を探索せず、既知の secret
file は内容を Plan に出しません。未知の機密を含む project file、実行ログ、
evaluator 内容を公開資料へ転記しないでください。生成された runner の使用時に
起きる通信・認証・sandbox 操作は、この確認の証拠範囲に含みません。
