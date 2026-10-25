# Ceiling v1 実装記録

Implementation Contract: `ceiling-v1-implementation-r1`。上流は `codex-work-package.md` と `evaluation-protocol.md`、受領時 HEAD は `cd99f739e54c788af57802521dd43adc238a8a7d`。

検証は Formal Verification Contract `ceiling-v1-verification-r1` を選択する。理由は公開 API、状態・並行処理、複数担当、採点境界の検証を含むため。既存 24 primary / 4 calibration の入力・登録・採点・freeze は変更しない。

## 検証計画

- 6 問の公開 seed と通常テストを独立した namespace に作る。
- manifest で全入力の内容を固定し、protected 変更、提出範囲逸脱、symlink、入力取り違えを拒否する。既存 materializer の canonical digest を再利用する。
- 各 workspace の新規準備、通常テスト、提出の固定を合成入力で検証する。
- CH04 の revision 確認と chunk 受理を protected adapter の原子的境界にする。
- CH05 の閉じた履歴と有効状態の必要量を分け、負荷と watermark の進め方を固定する。未校正上限は null にする。
- 非公開側では正解 2 構造、各問 12 件以上の意味的欠陥、追加テストの健全性、隔離を検証する。非公開 root の指定待ちの間は作成しない。
- 統合後に独立した fresh reviewer が公開 diff と検証結果を確認する。対象 HEAD の CI 状態も確認する。

## 進捗

- Verified: 最新 PR HEAD は受領時 HEAD と一致。main の最新は `514bf21aa2c955ec44dcaa3db67abe86f397b98e`。rebase は不要。
- Verified: 既存 checkout は main 上で作業差分なし。専用 checkout に既存 PR branch を取得した。新規 PR は作成していない。
- Verified: `.agents/`、active adapter install-state は存在しない。repo の `skills/skill-router` から、既存 work package を用いる `controlled-implementation` と `test-first-verification` を選択。
- Verified: CH01/02、CH03/04、CH05/06 の公開 workspace を担当別に作成。共有 materializer と manifest は統合担当が所有する。公開テスト・新規準備・提出固定・範囲外変更拒否を検証した。
- Verified: 追加指示により保存先を選択し、非公開採点資材を repo 外で作成した。各問に別構造の正解例 2 件、意味的人工不良 12 件以上、同一追加テストを用意した。初期保管は一時領域だったため、書込み権限内の repo 外の永続的な作業領域にも保存した。
- Pending: 採点実行境界の確認。native sandbox は親の停止指示に従いコード上も無効化した。既存 Docker Desktop・既存固定イメージ・既存 ASK の public-file-only transport を read-only で確認。今回の一時コンテナによる合成検証は未承認・未実行。
- Unknown: モデル難度、30〜70 点の達成、モデルでの実測。今回の実装・採点器検証はモデル校正の証拠にしない。

## 実行制約

既存認証での PR 読取と clone/fetch は成功。追加モデル実行、Codex CLI ベンチマーク推論、認証・セキュリティ設定変更、merge は行わない。既存 branch への通常 push は依頼で承認済み。

## 検証記録と残件

- 公開統合: `node --test benchmarks/challenge-candidates/ceiling-v1/tools/public-workspace.test.mjs`。全 6 問の新規準備と通常テスト、manifest、freeze、protected 改変、範囲逸脱、誤 ID、symlink/hardlink を検査。generic worker と test reporter の制御試験も追加。
- `node scripts/validate-repo.mjs` は成功。`node scripts/test-ask-benchmark-portfolio-catalog.mjs` は成功。既存 portfolio・fixtures・登録コードは受領 HEAD と差分なし。
- `node scripts/test-ask-benchmark-admitted-fixture-invariance.mjs` は 14/16 成功。2 件は履歴 commit `b290feb25cc1aa2fe3b04bebbd001558cc7846e1` に schema が存在しないため失敗し、受領 HEAD の clean clone でも同じ 2 件を再現した。既存 24 問の履歴契約は変更していない。
- `test-ask-benchmark-materialize.mjs` は作業中の tracked 差分を拒否した。その後 `e94fce95add19859706f0cb05fbc8a166bb0ea73` の独立 clean clone で完走し、`ASK benchmark materialization tests passed`、終了 0 を確認した。
- 公開独立レビュー（`0cb160d1d5b687d5713bb79ab65d737869827e26`）: CH06 protected glob の prefix/suffix 重なり（Major）、CH02 renderer の null 分類（Minor）。両方を修正し公開 adapter 回帰テストを追加、manifest を更新した。修正後の fresh review は別途記録する。
- 非公開側の trusted author 検証は各問の正解 2 構造・対応不良検出・追加テストを確認した。native 隔離では CH05/CH06 の全検証が通ったが、CH01/CH03 は空テスト対照判定、CH04 は worker の primitive serialization の不良で停止し、CH02 は未完走。共通不良は修正済みだが、停止指示後の native 再実行はしていない。部分的証拠を全問完了と扱わない。
- 自動承認レビューは、sandbox の読取範囲を広げる提案を「非公開 root 読取防止を確認できない」として拒否した。提案は未適用。以後に限定 allowlist による一部検証証拠は得たが、親の追加指示に従い native 経路を停止した。拒否された広域読取を別経路で実行しない。
- Docker の新規実行・image pull・設定変更・モデル推論は行っていない。全問の最終採点境界での検証、独立した非公開検証、CH05 の資源閾値固定、正式採点結果の発行は残件。品質点・blocker・難度は未確定のまま保持する。
- 追加の独立静的レビューは公開 `e94fce95`、非公開 authoring manifest を対象に実施。公開テスト 4/4・非公開 syntax 40/40 を確認した。追加テストの例外を広く assertion へ変換する経路に関する指摘を受け、該当 wrapper を撤去し、reporter に assertion operator の分類を追加した。修正版の動作は承認済み境界で再検証するまで未確認。
- Docker 検証の準備: 既存 transport の source と static import closure を digest 固定。予定は各問 2 正解・104 意味ケース・90 独立不良・seed・追加テスト制御を含む本体 150 コンテナ、資源・隔離・独立確認を含め最大 192 コンテナ。bundle 全体 120 秒、個別 program 15 秒、追加テスト 20 秒、cleanup 予約 15 秒。各 create 前に消費枠を原子的に記録し、終了・削除の確認がない場合は不成立のまま保持する。全結果は repo 外に保存する。Docker 実行は承認回答まで保留。
- 最終静的レビューは公開 `b0f1b4ea` と非公開 authoring digest を対象に実施。入れ子テストの親失敗の重複、欠測結果の扱い、採点 semantics と実行版の結合に関する 3 指摘を受け、対応を実装した。公開テストは 5/5 成功。非公開側は構文確認のみで、修正版全体の動作・再独立確認は未完了。
- 続く静的レビューで、不正な候補戻り値を matcher 例外で欠測扱いにする問題を確認した。全問の matcher に明示的な形状 assertion を追加し、worker でも候補失敗と evaluator 入力不良を区別した。安全性は品質失敗から推測せず、禁止された効果の実観測に対する独立した三値判定とした。公開テストは 6/6 成功。非公開側の変更後の実行は未実施。
