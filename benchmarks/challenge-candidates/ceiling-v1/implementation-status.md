# Ceiling v1 実装記録

## 現在の作業状況

- Docker 実行承認を受領済み。固定 image の実体は Node `v24.21.0`。新規 6 問だけをこの版へ固定し、非root・capability 0・no-new-privileges・外部通信拒否・host/private root/socket 不在を実 container で確認、終了・削除も確認した。既存 24 問の runtime は変更しない。
- invariance は必要な CI 履歴オブジェクトを揃えた clean clone で 16/16 成功。コード修正・検査弱体化は不要だった。
- 追加テスト分離は静的実装中。6 問の公開 API capability 定義、有限な操作 interpreter、抽出・応答再生 helper、全問の公開動作例を作成。104 既存検証シナリオがこの制限内で表現できることをデータ検査した。公開 protocol 制御試験 2 件と再生試験 1 件は成功。
- 非公開実装を実行する service には提出 JavaScript を渡さず、提出テスト側には非公開 source を渡さない。旧直接差替え route は実行しない。現在は分離 route の静的レビューと gold test の変換を進めている。難度実測・モデル推論・main merge は行っていない。
- 全体は未完了。全 6 問の新境界での正解・不良・採点器検証、独立実行検証、CH05 最終資源校正、対象 HEAD の最終 CI 確認が残る。

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
- 現在、提出テストを実行しない機能採点経路で全問の正解・不良検証を順次実行中。分離追加テストは静的レビュー完了後に実行する。

## 実行条件と残件

既存固定 image、network none、host mount なし、nonroot、CPU 1、512 MiB、PID 64 の既存境界を使う。抽出・観測・再生は別 container とし、最大 384 件を原子的台帳で制限する。bundle 120 秒、program 15 秒、提出テスト 20 秒、cleanup 予約 15 秒。終了・削除が未確認なら成功扱いしない。非公開結果は repo 外に保持する。

残件は新境界の全問検証、追加テストの正解通過・意味不良検出・誤検出対照、CH05 の同条件での資源校正、独立実行確認、最終 HEAD の CI。正式品質点・採点準備完了は未確定。モデル難度、30〜70 点目標の達成は未測定で、追加モデル推論は範囲外。新規認証・image download・設定変更・main merge は行わない。
