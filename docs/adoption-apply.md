# 明示承認した導入 Plan の適用

`ask-setup apply` は、保存済みの exact Plan を検証してから、既存 kernel / Codex / Claude project installer を呼び出します。別の installer engine や adapter ごとの setup engine は持ちません。成功は **Installed** の証跡であり、Activated / Operational、Asset の有効性や Portfolio の activation の証明ではありません。

## 操作と承認

```bash
node scripts/ask-setup.mjs plan \
  --target /path/to/project --adapter codex --profile minimal \
  --output /outside/project/adoption-plan.json

node scripts/ask-setup.mjs apply \
  --target /path/to/project --plan /outside/project/adoption-plan.json \
  --dry-run --json

# この明示的な apply action が、指定した exact Plan の書き込み承認になる。
node scripts/ask-setup.mjs apply \
  --target /path/to/project --plan /outside/project/adoption-plan.json \
  --json > /outside/project/apply-result.json
```

既存 installer と同様、書き込み用の action と `--dry-run` を区別します。新しい確認トークンや `--yes` は追加しません。API の `applyAdoptionPlan()` は `authorized: true` が明示されなければ書き込みません。`--force`、任意の installer command、暗黙の profile 変更、自動 rollback はありません。

`inspect / recommend / plan / check / doctor` と `apply --dry-run` は対象リポジトリへ書き込みません。Plan の生成・再検証では、隔離した外部 staging でのみ既存 installer を実行します。`apply` の `--profile` などの計画変更オプションは拒否します。`--adapter` は Plan との一致確認にだけ利用できます。`--output` は `plan` 専用です。apply の機械可読結果は標準出力を保存してください。出力先は対象と ASK source の外側に置き、シェルのリダイレクト自体が対象を変更しないようにします。

## exact binding と no-write boundary

Plan schema `1.1.0` は、従来の source / target / selection / Asset / Portfolio / ownership 情報に加え、次を digest に束縛します。

- 対象の canonical root locator、Git HEAD / index、作業ツリー全体の状態。
- selected Skills、実際の installer 入出力パス、各 phase 後の期待状態。
- 管理対象ファイル・block・partial file の実際の hash、ownership、source revision、generated projection / installed inventory identity。
- Node version、OS、architecture、umask。別環境では Plan を再生成する。

HEAD は committed tree を特定する content address です。index の exact bytes と独立した作業ツリー snapshot により、同じ HEAD での staged / unstaged / untracked / ignored の変化も検出します。Git のないディレクトリでは root locator と作業ツリーで束縛し、存在しない Git identity は補いません。schema `1.0.0` の旧 Plan は適用できません。

apply は現在の正規 source から同じ profile を再構築し、既存 installer による staging の結果を再検証します。保存済み Plan と semantic digest が異なれば停止し、新しい Plan にすり替えて適用しません。各 installer の直前・直後にも source と target の一致を確認し、期待外の変化や失敗があれば後続 phase を開始しません。

管理対象の symlink（内部リンクや dangling link も含む）、path traversal、特殊ファイル、hardlink、未解決の in-progress state は拒否します。project-owned / unmanaged conflict、managed-file drift、未対応 profile / required capability も既存の ownership / capability contract を弱めず拒否します。source と target が包含関係にある場合も適用しません。

完全に同じ Plan を再実行し、source・期待された最終 target・管理 identity が一致する場合は `already_applied` として installer を再実行しません。後から加わった local change を、この再実行で修復・上書きすることはありません。

## Asset、Portfolio、Claude plugin の範囲

Asset refs は、正規 renderer が検証した exact refs を再構築して照合します。適用後の state / projection / inventory digest と実ファイル hash を記録します。`confirmed_from_projection` は登録 Asset の activation や効果測定を意味しません。

この slice の既存 Plan モデルは、Portfolio を `unselected` または `provided_reference_unverified` として扱います。export された reference だけでは #277 の lifecycle authority、lock / selection closure、適用対象の authority を満たしません。後者は `portfolio_authority_unverified` として **書き込み前に停止** します。成功時の Portfolio は明示的な `unselected / null` であり、架空の selection / activation は作りません。検証済み Portfolio の適用連携は残作業です。

Claude は既存 **project adapter installer** を呼びます。管理 hook と無関係な `.claude/settings.json` の内容や project-owned state は既存契約に従い保護します。optional plugin の host / global install、plugin activation、実 Claude / Codex workflow は実行しません。

## 結果と部分失敗

`--json` は `schemas/adoption-apply-result.schema.json` の結果を返します。Plan validation、explicit authorization、phase の exit status、適用済み / 未適用 / 観測不明の操作、preserved boundary、resulting identities、capability downgrade、復旧情報、次の検証を区別します。結果には deterministic な `result_digest` を付けます。

| status | 意味 |
| --- | --- |
| `validated` | dry-run の exact validation 完了。実対象への書き込みなし。 |
| `applied` | 全 phase の実測状態と identity が Plan に一致。 |
| `already_applied` | exact 最終状態と一致し、installer 再実行なし。 |
| `blocked` | 適用開始前に拒否、または phase の前提検証で停止。 |
| `failed` | 書き込みを試行したが、最終観測で元の状態と一致。 |
| `partial` | 失敗後に変化がある、または最終状態を確定できない。 |

`mutation_attempted` は今回の installer 呼出しの有無です。`repository_changed` は **Plan 作成時の状態との差** であり、成功した再実行 no-op でも `true` になります。未観測は `null` です。`observation: unavailable` を「変更なし」と読み替えてはいけません。個々の操作は最終 byte observation、phase は実行履歴を示します。空ディレクトリや想定外の変更を file operation 配列だけで説明できなくても、全体状態との不一致は partial / recovery required として残ります。

## 復旧と detach

既存 installer の `<state>.in-progress.json`、pending state、rollback snapshot を再利用します。kernel と adapter をまとめた transaction は保証しません。例外、非ゼロ終了、タイムアウト、観測失敗を「未変更」とは扱いません。

結果の `recovery` は、今回試行した phase の **逆順** です。各 `rollback_command` / `detach_command` は `<target>` を置換して検査するための `--dry-run` command です。`snapshot_available_requires_dry_run` は snapshot の存在を確認しただけで、復旧成功の保証ではありません。`unavailable` / `unknown` は別途回復判断が必要です。

まず adapter、次に kernel の既存 rollback dry-run を確認します。競合がなく、復旧内容を別途承認したときだけ `--dry-run` を外して実行します。local change がある場合は止め、安易に `--force` を付けません。partial phase の marker は消さず、既存 installer が pending state を読める状態を保ちます。

rollback / detach は ASK 管理範囲の操作です。initialize-once の project-owned state、利用者の変更、空ディレクトリまで元通りにする全リポジトリ rollback ではありません。これらが残り得ることを結果の `recovery_semantics` にも記録します。

## Privacy と静的検証の限界

raw prompt、secret values、installer stdout / stderr、rollback contents は結果へ出力しません。parser 例外も入力断片を転記せず固定 reason にします。子プロセスには必要な環境変数だけを渡し、`NODE_OPTIONS`、`NODE_PATH`、Git trace / config overrides、任意の secret 環境変数を継承しません。global 認証を探索しません。

既知の secret file / credential directory は内容を読まず metadata だけで変化を検知します。その他は bytes の hash と mode を内部観測し、作業ツリー一覧や無関係なパスを結果へ公開しません。snapshot は最大 100,000 entries、通常ファイル 64 MiB、合計 512 MiB に制限し、超過は fail closed です。

計画・適用中に別プロセスで source / target を変更しないでください。静的 path 検査、安定読取、phase 間照合は OS-level isolation や悪意ある並行 writer に対する atomic transaction ではありません。途中の並行変更を検出した場合も、すでに書き込まれた内容を隠しません。

## 検証と後続

```bash
node scripts/test-ask-setup-apply.mjs
node scripts/test-ask-setup-apply-integration.mjs
node scripts/test-ask-setup.mjs
node scripts/test-validate-repo.mjs
node scripts/validate-repo.mjs
git diff --check
```

focused test は fault injection により authorization / drift / failure / partial observation / privacy を検証します。integration test は完全な checkout 上で既存 kernel / Codex / Claude installer の CLI を一時 target に対して実行し、成功・再実行・保護対象・identity・schema を検証します。既存の repository validation workflow からも setup suite を通じて実行されます。

次は `ask-setup doctor --target <target> --json` で static 状態を確認し、別途 bounded first workflow と runtime / applied-contract evidence を取得します。この PR は #173 全体を close せず、Operational、operator-dependence 効果、#285 / #286、deployment / release を主張しません。
