# 個人Codex v1の提供範囲と公開確認

2026-11-11更新。対象は **Mac / Codexで使う個人向け自己改善ループ**です。公開用版名は `personal-v1.0.0` とし、既存のパッケージmanifest `3.0.0` とは別のmilestoneを表します。タグとReleaseの公開状態はGitHubの公開記録で確認してください。

## 提供するもの

- Kernelと選択したSkillsの導入・診断・更新・復旧。
- [標準ループ](supervised-instruction-loop.md)による候補生成、ケース選定、試行、採点・レポート、適用計画。
- 人間による評価ケースの承認・拒否、および結果を読んだ変更適用の承認・拒否。承認後の適用・版有効化・所有する一時資産のcleanup・最終報告。
- 結果確認のみ、候補を保留して追加改善、棄却、失敗後の限定的再開。
- [次サイクル・ファイルexport/import・版固定](instruction-improvement-continuity.md)。importだけでは採用しません。

設定済みの実行環境、モデル実行権限、対象と書込み範囲の明確な承認が必要です。未設定の環境で一命令だけですべて動く製品でも、全操作が無人で終わるシステムでもありません。

## 確認済みの実績と境界

| 項目 | 根拠 | 解釈の限界 |
| --- | --- | --- |
| 通常24課題の実用評価 | [48答案の採点・使用量整理](primary-24-practical-review.md)、PR #493 | 新旧条件とも238/240。観測usageの重複を排除したが、未記録の子使用量や実請求額は復元不能。厳密なnative admissionと同一ではない |
| 難問7課題を含む31課題 | CH01、CH02〜06、RC01を個別の固定条件と保存答案で評価 | 異なるモデル・条件の結果を合算した総合順位は作らない。HTTP・ブラウザ・並行動作の全網羅ではない |
| レビュー候補の採用 | [実測済み候補の継続適用](measured-review-adoption.md)、PR #491 / #492 | RC01のTerra low比較は70.5→76.5点、約185→775秒。品質差は観測できたが速度改善は示さない |
| ソース反映から版管理まで | PR #491の変更を公開mainへ統合。Registryの版有効化、所有stagingのcleanup、最終applied報告まで継続 | lifecycle authority不足による停止をホスト支援で復旧。最初から無介入で成功したとは言わない |
| 導入・更新・復元 | [導入ガイド](quickstart-mac-codex-ja.md)、モデル不要の `test-release-install-recovery.mjs` | disposable targetによる検査は、任意の実プロジェクトや全OSの保証ではない |

保存された実績のsourceと現在mainは区別します。後からmainが進んだことを理由に、過去の結果や承認を書き換えません。現在main全体を過去の比較で評価済みとは呼びません。

## 今回に含めない主張

Claude実アプリ受入、Windowsを含む全OS・全profile保証、任意チームでのROI、ジュニアとシニアの判断同等性、必ず時間・tokenが減ること、完全な請求額の計測は含めません。公開済みの実装・合成テストと実モデルの成果は区別します。

[Issue #202](https://github.com/ist-h-i/agent-spectrum-kernel/issues/202)の広い汎用v1.0と[固定16ゲート](release-evidence-gate-contract.md)は別の契約です。この個人milestoneや実用31課題の受入によって、#192/#198等の厳密な条件を達成扱いにしたり、固定ゲートを削除したりしません。10月時点のgate出力を現在mainの判定として再掲しません。

## 導入・更新と戻し方

[Mac / Codex導入・復旧](quickstart-mac-codex-ja.md)に沿って、版を固定したsourceからPlanを作り、対象と差分を確認して適用します。既存プロジェクトの未保存変更を先に分離してください。Planはsourceと対象の状態を固定するため、source更新後に古いPlanを編集して使い回しません。

戻す場合も同ガイドのrollback/detachを使い、ASK管理対象とプロジェクト所有のファイルを区別します。loopの版切替とソースのGit rollbackは同じ操作ではありません。処理が途中の場合は保存状態を読み、完了確認のない実行を重複起動しないでください。

## 公開時の確認

README・手順・デモ・CHANGELOGの整合、対象commitのローカル検証と独立レビュー、CI、公開archive内容を確認してからtag/Releaseを作成します。private答案、非公開rubric、個人path、生ログ、認証情報は追加公開しません。配布は既存の公開リポジトリのソースarchiveで、npm公開や環境設定変更ではありません。
