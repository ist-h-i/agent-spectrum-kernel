# Ceiling v1 実装記録

## 現在の作業状況

- 追加 6 問の仕様補完・初期コード・公開テスト・非公開採点器と、その合成検証を完了。既存 24 問と 4 校正課題は変更していない。
- 公開制御試験 15/15。実際の Docker で正解 12 構造・105 ケース（計 210 正解チェック）・意味的不良 90 件を検証。別担当が 24 container で独立追認した。
- 同一追加テストの両正解通過、不良の意味的 assertion 失敗、失敗由来 90 件の独立確認を完了。正解 source と提出 JavaScript は同居させない。
- 実測観測の保持・再生による採点集計 30 対照を検証し、正解 12 件は 100 点・blocker なし。seed、空修正、自己申告だけの対照は未修復要件へ加点せず、追加テストの点も付かない。これはモデル試行ではない。
- CH05 の資源条件を両正解で校正して公開固定し、既存 recovery 25 点内で採点。資源不良と測定・負荷の改ざんを対照検証した。
- invariance は CI 同等の履歴を揃えた clean clone で 16/16 成功。materialization も clean clone で成功。検査の削除・弱体化や不要なコード修正はしなかった。
- 最新 HEAD の CI と最終レビューを PR で確認する。モデル推論・難度校正・公式スコア・main merge は未実施で、今回の検証からモデル難度を推定しない。

Implementation Contract: `ceiling-v1-implementation-r1`。上流は `codex-work-package.md` と `evaluation-protocol.md`、受領時 HEAD は `cd99f739e54c788af57802521dd43adc238a8a7d`。

検証は Formal Verification Contract `ceiling-v1-verification-r1` を選択する。理由は公開 API、状態・並行処理、複数担当、採点境界の検証を含むため。既存 24 primary / 4 calibration の入力・登録・採点・freeze は変更しない。

## 検証計画

- 6 問の公開 seed と通常テストを独立した namespace に作る。
- manifest で全入力の内容を固定し、protected 変更、提出範囲逸脱、symlink、入力取り違えを拒否する。既存 materializer の canonical digest を再利用する。
- 各 workspace の新規準備、通常テスト、提出の固定を合成入力で検証する。
- CH04 の revision 確認と chunk 受理を protected adapter の原子的境界にする。
- CH05 の閉じた履歴と有効状態の必要量を分け、負荷と watermark の進め方を固定する。未校正上限は null にする。
- 非公開側では正解 2 構造、各問 12 件以上の意味的欠陥、追加テストの健全性、隔離を検証する。公開 repo 外に保存し、承認済みの実行境界で検証する。
- 統合後に独立した fresh reviewer が公開 diff と検証結果を確認する。対象 HEAD の CI 状態も確認する。

## 実装と検証の記録

- 公開 6 workspace、初期コード、通常テスト、CH04 atomic acceptance adapter、CH05 固定負荷レシピ、入力 manifest と提出固定を実装した。既存 24 primary / 4 calibration の問題・採点・登録には変更がない。
- 追加テストは、公開 API の有限 JSON 操作を宣言し、別の信頼境界で得た観測へ同じ assertion を再生する方式へ移行した。service には提出 JavaScript を渡さず、tester には正解・不良の source を渡さない。全問の公開例、capability 制限、抽出と応答再生の制御試験を追加した。
- 非公開資材は公開 repo 外の永続的な作業領域に保存。各問の正解例 2 構造、計 104 意味ケース、計 90 人工不良を作成した。秘密内容は PR に含めない。
- 公開 worker/reporter の独立レビューで見つかった glob、null、入れ子 assertion、出力上限、候補失敗の分類、結果の対応情報の不良を修正した。新しい分離方式は別途独立静的レビュー中。
- `node scripts/validate-repo.mjs` と portfolio catalog テストは成功。invariance は CI が取得する履歴 SHA を揃えた独立 clean clone で **16/16 成功・終了 0**。コード変更・検査弱体化は不要だった。[環境切り分け](evidence/invariance-environment.md)を参照。
- materialization は tracked 差分のある作業 clone を正当に拒否し、独立 clean clone では完走した。invariance の履歴不足とは別の環境要因だった。
- native sandbox の読取範囲拡大は自動承認レビューに拒否され、未適用。親の指示により native 経路を無効化した。その後、ユーザーが既存 Docker の限定実行を明示承認した。
- Docker qualification は初回に Node 版の不一致を検出し、実 image の `v24.21.0` へ新規 6 問のみ固定した。2 回目は隔離検査に成功し、両 container の終了・削除を確認した。
- 最終 worker で全 6 問の機能・資源採点を再検証済み。正解 12 構造、計 105 ケース（正解合計 210 チェック）、意味的不良 90 件が通過。別担当も 24 container で独立追認し、CH05 は最新 sink に対する同一追加テストの再生を含む。

## 実行条件と残件

既存固定 image、network none、host mount なし、nonroot、CPU 1、512 MiB、PID 64 の既存境界を使う。抽出・観測・再生は別 container とし、最大 640 件を原子的台帳で制限する。bundle 120 秒、通常 program 15 秒、CH05 固定測定 program 90 秒、提出テスト 20 秒、cleanup 予約 15 秒。終了・削除が未確認なら成功扱いしない。非公開結果は repo 外に保持する。

実装と合成採点器の検証は完了。将来のモデル実測には、対象モデル・条件・試行数・予算の別承認、推論用 workspace の隔離確認、holdout と固定後確認の計画、入力・環境・採点版・提出 identity の固定が必要。30〜70 点目標の達成は未測定で、追加モデル推論は範囲外。新規認証・image download・設定変更・main merge は行わない。

## 最終検証の更新

- 公開制御試験は改ざん対照を含め 15/15 成功。提出 JavaScript と秘密 source を同居させる旧方式は実行していない。
- 全 6 問の同一追加テストが正解 2 構造で成功し、90 不良で意味的な assertion failure を確認。独立担当が失敗由来 90 件を個別に確認した。最新 domain の対応する公開 JSON 観測も原検証と全件一致。
- 空・常時失敗・import/setup エラー・出力偽造・不正な操作・全停止などの対照で追加 10 点を成立させていない。全停止は欠測として保持し、検出成功に数えない。
- CH05 は事前に置いた profile 別の時間・heap・RSS 上限を両正解が満たし、固定 recipe と環境を公開契約へ固定した。性能要件も既存の recovery 25 点内に追加し、機能が正しくても性能を無視して満点にしない。
- 共通 worker の参照・配列・直列化、CH05 の iterator・測定関数・sink hash を候補の prototype 改変から保護し、修正後に全問を再実行した。変更中の入力を検出して止まった実行は最終成功証拠に使わない。
- 採点結果は実際の Docker 観測を固定して集計する合成対照として検証する。モデルの新規実行や難度校正は含まない。

## 採点集計の受入

- 合成 30 対照は、実際の Docker 観測と独立した scope・assertion 由来確認を、src・test・policy・authority・workspace の厳密な一致で結合して再生した。元の実測を新しい実行と呼び替えていない。
- 42 件の採点器 fault injection で、欠測・identity 不一致・由来未確認を品質点 null に保ち、setup 混在や正解側失敗を追加 10 点の成功にしないことを確認した。実際の禁止効果の観測を使う 23 件の単一要件注入も、品質点とは別の blocker とマージ不可へ結合できた。
- 独立実行での初回 1 件は executor の socket 権限により container 作成前に停止。未作成を確認して同じ承認済み境界の scoped escalation で継続した。全実行の終了・削除状態を確認しており、未確認の container はない。
