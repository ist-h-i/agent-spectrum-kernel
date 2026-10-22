# 修正対象から保存結果までを読み取る

Spec: `personal-evolution-trace-spec-v1@1`。Upstream: Issue #385 AC-TRACE-1–8、
既存 #402 CLI / #406 source review、既存 observation / candidate / Registry /
Prompt materialization / fixed pair / saved-result verifier。
Implementation: `personal-evolution-trace-implementation-v1@1`。

観測の問題・証拠から、旧 Asset と対象箇所、選定理由、新版との差分、Skill から
Prompt への対応、固定比較の plan/run/role、同じ比較の保存結果までを読み取る。
新しい観測契約・候補契約・runner・採点器・台帳は作らない。#386 collector を待たず、
既存の明示観測と公開 evidence refs を使う。primary producer、採点、schema、installer、
凍結入力と過去結果は変更しない。実モデル・Codex CLI・実環境の有効化は行わない。

## 読み取り入口

```sh
node scripts/ask-personal-evolution-cli.mjs trace \
  --input /absolute/local-trace-context.json \
  --input-digest sha256:<確認したJSONのraw-byte-digest>
```

入力は `inspectPersonalEvolutionTrace(options)` の JSON 引数。必須の `storeRoot`、
`preparationObjectDigest` と既存の独立 trust 配列を使う。比較を追跡するときは既存
`verifyPersonalEvolutionPromptPairResults` と同じ `experimentObjectDigest`、
`trustedExperimentObjectDigests`、`trustedExperimentAuthorities`、
`pairRegistrationObjectDigest`、`trustedPairRegistrationObjectDigests`、
`evaluationAuthority` を指定する。保存後は同じ API の `savedResults` と
`trustedSavedEngineeringResultDigests` を追加する。既存 CLI の pair snapshot の
`input` が比較の参照元になる。保存接続の結果参照と grading receipt pin は既存
saved-result 手順に従い、返却された readout から trust を自動生成しない。

`traceObjectDigest` と後述の独立 chronology pin は省略可能。不足は Unknown と
`missing` / `next_checks` に表示する。pair がなければ確認済み候補までを表示し、
比較段階は `Unknown` とする。pair があれば既存 verifier の `NOT_RUN` / `hold_incomplete` /
`saved_pair_verified` を保持する。不整合は例外となり CLI は失敗する。成功 exit は
読み取りの成功であり、すべての情報の充足、実行許可、採用、品質改善を意味しない。

CLI は確認した入力 bytes を strict JSON として読み、結果を標準出力へ返すだけ。
cycle lock、cache、CAS、入力、結果を作成・追記・更新しない。`--cycle`、`--approve`、
start/resume/retry は受け付けない。context にはローカル参照と trust が含まれるため、
公開 PR に添付しない。raw session/log、private evaluator や保護セッションを渡さない。

## 新しく記録する修正対象の対応

既存保存物に修正箇所・選定理由・Skill 対応がない場合、勝手に再構成して Verified に
しない。別の新規 CAS オブジェクトを caller が保存し、その digest を渡す。
`buildPersonalEvolutionTraceBinding(options, { recording, changes })` は、既存 verifier と
同じ options で対象を照合し、オブジェクトを返すだけの純粋な authoring API。
自分では保存しない。旧 preparation / experiment / pair / result はそのまま保持する。

`recording` は `pre_evaluation` または `retrospective`。返却する
`personal_evolution_trace_binding_v1` は、preparation、observation、candidate、Registry、
旧/新 Asset、experiment、pair の exact identity と `trace_digest` を保持する。
`changes` は1–32件で、各件は次のフィールドを持つ。

| フィールド | 内容 |
| --- | --- |
| `registry_snapshot_digest` | 対象の両版を検証できる既存 Registry snapshot。観測候補と同じ repository / scope が必要 |
| `before_asset`, `after_asset` | `asset_type, stable_id, version, record_digest, content_digest` の完全な参照。after は before の直接派生版 |
| `locations` | `{before, after}` の配列。追加・削除側は null。各 location は `path, file_digest, start_line, end_line, excerpt_digest` |
| `selection_reason` | `{status, summary}`。仮説は `Hypothesis`。選定と観測の因果関係は常に Hypothesis と区別 |
| `evidence_refs` | この observation に存在する exact `{artifact_id, digest}`。別 task/source の参照は拒否。空なら不足 |
| `responsibility` | 対象に担わせる責務の公開要約 |
| `expected_effect` | `{status, summary}`。期待効果の仮説を記録。実品質寄与とは別 |
| `side_effects` | 懸念する副作用の公開要約 |
| `prompt_mappings` | 下記 Skill→Prompt 対応。未記録は不足として表示 |

location は1始まり・両端含む行範囲。UTF-8 を LF で分割し、対象行を LF で連結した
bytes の SHA-256 が `excerpt_digest`。最終改行に由来する末尾空行も分割に含む。
Asset 全体と各 file の bytes 検証は既存 Registry が担当する。trace はその中の正確な
範囲を照合する。readout は位置と digest を返し、全文や raw prompt は出力しない。

Prompt の全変更ファイルは旧/新 content inventory から必ず算出する。記入された
locations だけを差分全体とは扱わない。未説明ファイルは `unexplained_prompt_changes`、
対象 Asset の未記入箇所は `missing_locations` に残す。複数 Asset / ファイルの変更を
すべて列挙し、単一 Skill の効果には帰属しない。削除・追加も差分に含める。
`line_change` は共通の先頭行・末尾行を除いた一つの包括範囲の位置・行数・抜粋 digest。
複数の離れた編集はその範囲に含み、最小 hunk 列や意味差分ではない。非UTF-8なら
null とし、file digest の差を保持する。既存 candidate の `delta` / `hypothesis` /
`factors` / `expected_upside` / `risks` も再記入せず、そのまま表示する。

## Skill から Prompt への対応

ファイル名の `skill` は判定に使わず、Registry の `asset_type: skill` が必要。
各 mapping は以下の closed fields を持つ。

```text
kind: verbatim | recorded_transform
source_before, source_after: 旧/新Skillのlocation
prompt_before, prompt_after: 候補の旧/新Promptのlocation
evidence_ref: {artifact_id, digest}
```

参照する新規 correspondence オブジェクトは次の完全一致を要求する。

```text
object_kind: personal_skill_prompt_correspondence_v1
source_before_asset, source_after_asset: 上記変更対象のexact Asset refs
prompt_before_asset, prompt_after_asset: preparation候補のexact Asset refs
kind, source_before, source_after, prompt_before, prompt_after: mappingと同じ値
```

`verbatim` は両版について source と Prompt の抜粋 bytes の同一性を検証し、
`byte_correspondence: Verified` と表示する。これだけで生成への実使用は証明しない。
`recorded_transform` は対応記録の identity と範囲を検証し、意味的な変換の正しさは
`Hypothesis`。`verbatim` も `semantic_derivation` は Hypothesis のまま。
記録の自己 digest は renderer の実行や意味の正しさを証明しない。
どちらも実モデル使用・品質寄与の証拠にはならない。missing mapping を dependency、
ファイル名、同じ内容の存在だけで埋めない。

## 評価前 binding と過去の再構成

新規 `pre_evaluation` authoring は、検証済み固定 pair が全 role 未開始で、pair の
`invocation` が未作成の場合だけ成功する。開始状態不明・消費済み・結果ありなら拒否。
この観測は開始を予約する lock ではない。caller は別の controller-owned 手順で
新規 trace を保存し、**開始前に** trace と pair の対応を独立固定してから通常の
承認・開始手順へ渡す必要がある。trace が start を許可することはない。

readout で `pre_evaluation_binding` と表示するには、独立した
`trustedPreEvaluationTraceBindings` の各要素を別途渡す。

```text
trace_object_digest
pair_registration_object_digest
evidence_ref: {artifact_id, digest}  # controller-ownedな開始前固定の証拠
```

pin は本人/controller が独立確認した開始前の履歴でなければならない。trace の返却値、
現在の時刻・mtime、観測の既存参照、結果に書かれた digest から作らない。入力JSONの
byte pin はこの独立性を保証しない。コードは外部 chronology attestation を照合するが、
時系列の真正性を自己認証できないため `chronology: Supported` とする。独立 pin が
なければ `unconfirmed_pre_evaluation_claim` / Unknown。`retrospective` は pin を渡しても
`post_hoc_annotation` のまま。trace 不在は `historical_reconstruction`。
凍結済み入力・過去結果・消費済み attempt への追記で欠落を修復しない。

固定 pair の既存 verifier は exact source/plan/run/role、全 Prompt materialization と
runtime input bytes、保存 producer / normalized / engineering lineage を照合する。
readout の handoff はその事実だけを表示する。stdin 受渡しとモデルの実使用、保存した
数値差と因果的品質寄与を分け、`model_use` / `causal_quality_contribution` は Unknown。
未収集、部分結果、negative delta、synthetic の区別を保持する。歴史的 source のコード
closure が現在と異なり既存 verifier が拒否した場合も、再sealや再採点で通さない。

## Formal Verification Contract

`personal-evolution-trace-verification-v1@1`、upstream spec は上記。
`ask.verification-proof-policy@1.0.0` の `formal_verification_contract` を選択する。
canonical triggers: `state_concurrency_persistence_lifecycle_or_cross_module`、
`multi_session_multi_agent_or_handoff`、`merge_release_or_stable_trace`。

| 検証義務 | 対応 |
| --- | --- |
| TRACE-1 | 既存観測/候補/Registry と exact pair、未実行・保存結果までの read-only 表示。AC1/4/8 |
| TRACE-2 | 旧/新 Asset・位置・選定理由・期待効果と全変更列挙、Skill correspondence。AC2/3 |
| TRACE-3 | 別候補/版/run/参照、file/excerpt/結果 digest 改変の拒否。AC4/7 |
| TRACE-4 | 欠測・部分結果・negative・Hypothesis・Unknown の保持。AC5 |
| TRACE-5 | 新規未開始 binding、独立 pin、事後注記の非昇格、ファイル不変。AC6 |
| TRACE-6 | CLI raw input pin、strict options、ファイル/ディレクトリ inventory 不変。AC7/8 |

人工 fixture は `scripts/test-ask-personal-evolution-trace.mjs` の既存 helper ベースの
`prepared` / `skillChange`。Skill の独立 Registry revision と明示 correspondence、
既存人工 terminal/grade を使う。実モデル・CLI・実grading worker は起動しない。

```sh
node --test scripts/test-ask-personal-evolution-trace.mjs
node --test scripts/test-ask-personal-evolution-observation.mjs scripts/test-ask-personal-evolution-primary-pair.mjs scripts/test-ask-personal-evolution-saved-results-mode.mjs
node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs scripts/test-ask-personal-evolution-source-reviewer.mjs
node scripts/validate-repo.mjs
git diff --check
```

workflow と CI 登録は別担当に一本化する。本変更は workflow、共有生成物、build archive
を更新しない。focused command を CI 担当へ渡す。実行したコマンドの成否・独立レビュー・
CI の exact head は PR の証拠に記録する。人工成功を実運用成功へ変換しない。
