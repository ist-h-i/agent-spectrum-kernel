# ASK 導入前チェックと計画

`ask-setup` は、ASK を導入する前に対象リポジトリを読み取り、利用可能な profile と adapter capability を確認し、既存 installer が行う変更を事前に計画する CLI です。

この段階では対象リポジトリへ書き込みません。`apply`、実際の Codex / Claude 実行、初回 workflow の operational 確認は後続範囲です。

## できること

- `inspect`: ASK の導入状態、既存 instruction、CI、利用可能な adapter profile を確認する。
- `recommend`: 目的、risk、必要 capability から既存 profile の候補を示す。効果実測済みの推奨とは区別する。
- `plan`: 既存 installer を隔離した一時ディレクトリで実行し、作成・更新・削除予定と managed / project-owned 境界を machine-readable な adoption plan にする。
- `check`: 保存済み plan の source、target snapshot、repository identity、adapter が現在も一致するか確認する。
- `doctor`: 既存 `ask-doctor` を使い、Installed / Activated / Operational を別々に診断する。

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

Kernel のみを計画する場合は `kernel-only` を指定します。

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

projection に exact Asset reference がある場合は plan に保持します。登録済み・installed・activated・operational は別状態であり、一つの状態から次を推測しません。

## Dry-run と安全境界

`plan` は実際の対象で installer を実行しません。必要な ASK 管理対象だけを一時ディレクトリへ複製し、そこで既存 kernel / adapter installer の `--dry-run` と実際の staging 適用を順に実行して、前後差分から予定操作を作ります。

この方式により、別の installation engine や独自 ownership 規則を追加せず、既存 installer の managed-file conflict、partial-file、prune、rollback / detach の規則をそのまま利用します。

次の場合は副作用前に停止します。

- managed file が利用者によって変更されている。
- profile が adapter に登録されていない。
- 必須 capability が unsupported / unknown である。
- setup 対象の symlink がリポジトリ外へ逸脱する。
- plan 生成中または保存後に setup-relevant な target state が変わる。
- plan の出力先が対象リポジトリ内、または既存ファイルである。
- `apply` が呼ばれる。

global 認証設定は探索しません。`.env`、秘密鍵など既知の secret file の content は snapshot identity に取り込みません。既存 installer が安全な partial-file merge を判断するために対象リポジトリ内の setup file を読む場合も、その値を plan へ出力しません。installer の完全な標準出力も保存せず、dry-run 証跡には一時パスを正規化した出力 digest のみを保持します。

## Doctor

```bash
node scripts/ask-setup.mjs doctor --target /path/to/project --json
```

状態は次のように分けます。

- **Installed**: 期待する managed state / projection が存在し、現在の管理対象と整合しているか。
- **Activated**: 選択した profile / approval を実行環境が利用する根拠があるか。
- **Operational**: bounded workflow の実行証拠があり、必要な contract が適用されたと確認できるか。

static projection、file presence、caller の `operational=true` だけでは Operational にしません。

## この slice の後続範囲

`ask-setup apply` は未対応で、必ず拒否します。#173 の後続で、明示承認された apply、初回 workflow、実ホスト上の operational 確認を既存 installer / runtime contract に接続します。効果や operator dependence の評価は #285 / #286 の実測範囲です。
