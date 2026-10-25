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
- 実装中: CH01/02、CH03/04、CH05/06 の公開 workspace を担当別に作成。共有 materializer と manifest は統合担当が所有する。
- Pending: 非公開 root の指定。work package の「非公開rootが未指定ならその部分だけを止め」に従い、非公開採点器・正解・mutant は未作成。
- Unknown: モデル難度、30〜70 点の達成、モデルでの実測。今回の実装・採点器検証はモデル校正の証拠にしない。

## 実行制約

既存認証での PR 読取と clone/fetch は成功。追加モデル実行、Codex CLI ベンチマーク推論、認証・セキュリティ設定変更、merge は行わない。既存 branch への通常 push は依頼で承認済み。
