# ASK 導入前チェックと計画

`ask-setup` は、ASK を導入する前に対象リポジトリを読み取り、利用可能な profile と adapter capability を確認し、既存 installer が行う変更を事前に計画する CLI です。

`inspect / recommend / plan / check / doctor` は対象リポジトリへ書き込みません。明示的な `apply --plan` だけが、検証済みの exact Plan を既存 installer で適用します。実際の Codex / Claude 実行と初回 workflow の Operational 確認は後続範囲です。認可・適用結果・復旧の詳細は [明示承認された計画の適用](adoption-apply.md) を参照してください。

## できること

- `inspect`: ASK の導入状態、既存 instruction、CI、利用可能な adapter profile を確認する。
- `recommend`: 目的、risk、必要 capability から既存 profile の候補を示す。効果実測済みの推奨とは区別する。
- `plan`: 既存 installer を隔離した一時ディレクトリで実行し、作成・更新・削除予定と managed / project-owned 境界を machine-readable な adoption plan にする。
- `check`: 保存済み plan の source、target snapshot、repository identity、adapter が現在も一致するか確認する。
- `doctor`: 既存 `ask-doctor` を使い、Installed / Activated / Operational を別々に診断する。
- `apply`: 保存 Plan を再検証し、明示承認された変更だけを実リポジトリへ適用する。`--dry-run` では書き込まない。

## 基本操作

対象リポジトリは `--target` で明示します。

```bash
node scripts/ask-setup.mjs inspect --target /path/to/project
node scripts/ask-setup.mjs recommend --target /path/to/project --adapter codex --purpose implementation
node scripts/ask-setup.mjs plan --target /path/to/project --adapter codex --profile implementation --json
```

plan を保存する場合、出力先は対象リポジトリの外側を指定してください。既存ファイルは上書きしません。

```bash
node scripts/ask-setup.mjs plan \
  --target /path/to/project \
  --adapter codex \
  --profile implementation \
  --output /tmp/ask-adoption-plan.json

node scripts/ask-setup.mjs check \
  --target /path/to/project \
  --adapter codex \
  --plan /tmp/ask-adoption-plan.json
```

Claude Code も同じ adoption-plan モデルを使います。adapter ごとの変更内容は既存 installer の projection から取得します。

```bash
node scripts/ask-setup.mjs recommend --target /path/to/project --adapter claude-code --purpose review
node scripts/ask-setup.mjs plan --target /path/to/project --adapter claude-code --profile review --json
```

Kernel のみを計画する場合は `kernel-only` を指定します。`--profile` を省略すると `kernel-only` が補完されます。明示した別の profile、空値、値のない `--profile` は拒否し、暗黙に読み替えません。

```bash
node scripts/ask-setup.mjs plan --target /path/to/project --adapter kernel-only --json
```

## Recommendation の境界

profile 名は Codex / Claude installer が現在公開している profile から取得します。未登録の profile を別 profile へ暗黙に読み替えません。特に `full` を fallback として選びません。

`--require-capability` を指定すると、`docs/fixtures/adapter-runtime-profiles.json` にある現在の capability と evidence level を確認します。`unsupported` / `unknown` は人間判断が必要な状態として plan を停止し、`partial` や projection-only の証拠は過大評価せず downgrade として表示します。

```bash
node scripts/ask-setup.mjs recommend \
  --target /path/to/project \
  --adapter codex \
  --purpose implementation \
  --require-capability programmatic_tool_execution
```

ここでの recommendation は「現在の契約上、必要機能を満たす候補」です。Skill / Prompt の効果が実測で優れているという意味ではありません。

## Portfolio / Asset identity

Portfolio は明示的に選ばれていない限り `unselected` のままです。存在しない digest や activation を補いません。既存 Portfolio Manager から export した exact reference がある場合だけ `--portfolio-reference` で渡せます。

```bash
node scripts/ask-setup.mjs plan \
  --target /path/to/project \
  --adapter codex \
  --profile minimal \
  --portfolio-reference /path/to/exported-portfolio-reference.json \
  --json
```

Portfolio reference は参照だけでは lifecycle authority を証明しないため、`provided_reference_unverified` の Plan の apply は書き込み前に停止します。Portfolio の activation や承認を推測しません。

projection に exact Asset reference がある場合は plan に保持します。登録済み・installed・activated・operational は別状態であり、一つの状態から次を推測しません。

## Dry-run と安全境界

`plan` は実際の対象で installer を実行しません。必要な ASK 管理対象だけを一時ディレクトリへ複製し、そこで既存 kernel / adapter installer の `--dry-run` と実際の staging 適用を順に実行して、前後差分から予定操作を作ります。

この方式により、別の installation engine や独自 ownership 規則を追加せず、既存 installer の managed-file conflict、partial-file、prune、rollback / detach の規則をそのまま利用します。

setup では、読取・複製対象とその親ディレクトリにある symlink を拒否します。リンク先が対象リポジトリ内でも例外にせず、相対リンク、リンクの連鎖、リンク切れも対象にします。staging から実リポジトリへ書き込みが届かないよう、installer の起動前にも staging 側を検査します。setup と無関係な場所のリンクは対象外です。

Git 情報の読取前には、source と target の `.git`、`config`、`HEAD`、参照先の ref、`packed-refs`、`commondir` と各親ディレクトリも検査します。symlink、特殊ファイル、参照パスの逸脱は拒否します。worktree / submodule の通常の `gitdir:` / `commondir` ポインターファイルは利用できますが、その参照経路にある symlink は利用できません。

次の場合は、対象リポジトリを書き換えずに停止します。

- managed file が利用者によって変更されている。
- profile が adapter に登録されていない。
- 必須 capability が unsupported / unknown である。
- setup 対象またはその親ディレクトリに symlink がある。
- 一時ディレクトリが対象リポジトリ内にある。
- plan 生成中または保存後に、導入に関係する target の状態や source が変わる。
- plan の出力先が対象リポジトリ内、または既存ファイルである。
- exact Plan なしで `apply` が呼ばれる、または Plan の検証・認可条件を満たさない。

global 認証設定は探索しません。`.env`、秘密鍵など既知の secret file の content は snapshot identity に取り込みません。既存 installer が安全な partial-file merge を判断するために対象リポジトリ内の setup file を読む場合も、その値を plan へ出力しません。installer の完全な標準出力も保存せず、dry-run 証跡には一時パスを正規化した出力 digest のみを保持します。

Git の repository identity は、リポジトリの config に明示された origin だけから取得します。global / system / include / includeIf の設定や、継承した Git 設定・trace は使用しません。認証情報・query・fragment を除いた接続先を digest にし、origin の値自体は出力しません。複数 origin や未対応形式は `null` とし、推測しません。認証情報だけの更新では identity は変わりません。

JSON の解析に失敗した場合も、入力の断片を含む parser の例外は出力しません。installer の失敗時は標準出力・標準エラーを転記せず、失敗の種類を示す固定メッセージを返します。`doctor` が返す JSON 内に parser の例外が含まれる場合も、内容を除いた診断に置き換えます。

## 保存した計画の再確認

`check` は、現在の adapter / profile から既存の projection を再構築します。source の検証対象は、kernel 本文、選択した Skill、immutable asset、既存 renderer が公開する入力一覧です。間接 import の変更も見逃さないよう、source の `scripts` 配下にある `.mjs` も含めます。このため、導入に直接関係しないスクリプトの変更でも計画が無効になる場合があります。

source の Git revision と、Asset reference を含む projection の digest も記録します。Git 情報がない source では revision を `null` とし、ファイルと projection の digest で確認します。必要な入力が欠けている場合は、有効な計画として扱いません。以前の検証方式で作った計画は再生成してください。

target の snapshot 内のパスは、リポジトリ基準の相対パスです。同じ `--target` と `--plan` を指定していれば、コマンドの実行ディレクトリだけを変えても計画は無効になりません。JavaScript から `verifySavedPlan()` を呼ぶ場合は、非同期の検証結果を `await` で取得してください。

Plan 1.1 は追加で HEAD/ref、index、作業ツリーの通常ファイルの bytes/mode と関連する特殊パスのメタデータを束縛します。既知の秘密ファイルは内容を読まず、サイズ・mtime・ctime 等のメタデータだけを確認します。対象パスと実行環境も Plan digest に束縛するため、旧 Plan 1.0 は再生成してください。

計画作成中・apply 実行中は、source と対象リポジトリを他の処理から変更しないでください。前後の snapshot 比較は、並行して動く別プロセスに対する OS レベルの隔離ではありません。

## Doctor

```bash
node scripts/ask-setup.mjs doctor --target /path/to/project --json
```

`doctor` は導入計画より広い範囲を診断します。起動前に `docs`、`adapters`、`.claude`、`.agents`、`.agent-spectrum-kernel` の診断対象ディレクトリ全体と、Git ディレクトリに置かれた runtime health ログを検査します。未管理ファイルも含め、symlink と特殊ファイルを拒否します。install state が参照する target / source のパスも検査し、参照先の逸脱やリンク経由の読み取りを拒否します。この事前検査も並行変更に対する OS レベルの隔離ではありません。

状態は次のように分けます。

- **Installed**: 期待する managed state / projection が存在し、現在の管理対象と整合しているか。
- **Activated**: 選択した profile / approval を実行環境が利用する根拠があるか。
- **Operational**: bounded workflow の実行証拠があり、必要な contract が適用されたと確認できるか。

static projection、file presence、caller の `operational=true` だけでは Operational にしません。

`doctor` の診断結果が `fail` の場合、JSON / 人間向け表示のどちらでも終了コードは `1` です。呼出元のスクリプトは、出力が得られたことだけで診断成功と判断しないでください。

## この slice の後続範囲

今回の apply は既存 kernel / Codex / Claude project installer の適用までです。#173 全体の完了、Portfolio authority を伴う選択の適用、Claude plugin のホスト側インストール、初回 workflow、実ホスト上の Operational 確認は含みません。効果や operator dependence の評価は #285 / #286 の実測範囲です。
