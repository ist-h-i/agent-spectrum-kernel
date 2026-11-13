# CH08 文章から実務UIを再構成する

通算8問目の難問を `ch08-growth-workspace` として正式カタログへ登録する。
既存の7問はCH01〜CH06とRC01であり、CH07という課題があることを意味しない。
primary24や過去7問の結果・重み・採用状態は変更しない。

解答者に配るのは `workspace/` の文章仕様、データ契約、公開シナリオ、
公開配点、固定JSONだけ。元HTML、CSS、画像、正解UI、調査資料は配らない。
画面構成は自由。外部AIの代わりに依頼対応付き固定JSONを使う。

## 登録と配布

標準CLI `node scripts/practical-evaluation-cli.mjs challenge-list` で発見し、
[登録課題の共通手順](../../../docs/practical-challenge-evaluation.md)の
`challenge-prepare` でモデルを呼ばず準備できる。idは
`ch08-growth-workspace`、task_fileは `task.md`。mainソースとnpmのruntime
配布に同じ登録・入力・採点bundleを含める。npm公開自体はこの登録作業の対象外。

初回は `app/` と `DELIVERY.md` を完成させる。続く同一セッションの固定確認は
`REASSESSMENT.md` だけを追加する。新しい隠し要件は出さない。CH08では全提出
ファイルをhash固定し、再開・採点前に検証する。symlinkと16MiB超の単一ファイルは
許可しない。初回に起動可能な成果物を作り、第2段階でbuildやcacheを変えない。
実行失敗や不確かな状態を自動再試行しない。

意味評価bundleは `evaluator/{rubric.json,score.mjs,README.md}` の3ファイル。
公開配点と同一で、非公開の追加機能要件はない。実行時には別の採点ディレクトリへ
コピーし、solverから分離する。共通 `challenge-score-handoff` と
`challenge-import-score` を用いる。独立採点者が実装・実操作・ログを評価し、
計算器はその判断の形と集計だけを検証する。

機能70点とUI/UX30点を別表示し、完全観測時のみ合計100点を出す。
未観測の配点、公開された安全上のblocker、実装生成時間、確認時間、入出力token、
採点時間はそれぞれ別に保持する。完了時間やtokenによる品質点の補正は行わない。

## 正例・負例と検証範囲

公開の `brief/scenarios.json` は14の複合シナリオに操作・期待正例・誤りの負例を
持つ。固定JSONに有効計画／上限違反／別依頼、有効評価／別対象根拠、有効キャリア、
正常バックアップ／参照切れを含む。`tools/public-package.test.mjs` では入力固定、
正負fixtureの意味、採点の正例・負例・欠測、登録準備、合成2段階実行、提出改変拒否、
配布境界を検証する。正負の採点判断は人工データであり、UI正解実装ではない。

```sh
node benchmarks/challenge-candidates/ui-reconstruction-v1/tools/manifest.mjs
node --test benchmarks/challenge-candidates/ui-reconstruction-v1/tools/public-package.test.mjs
```

入力変更時は内容をレビューしてから `manifest.mjs --write` でこの課題のmanifestと
登録hashだけを更新する。RC01の登録byteと既存課題は維持する。

実モデル試行・難度校正・正解UI実装による全機能の通過確認は未実施。
登録済みと、測定準備完了・難度検証済み・過去結果での受入済みを混同しない。

## 作問・検証契約

- Spec: CH08-SPEC-1（`workspace/task.md` と `brief/`）。上流はユーザーの文章再構成依頼。
- Work package: CH08-PACKAGE-1。範囲は新課題、カタログ、提出固定、配布試験、CIと索引。
- Formal Verification Contract: CH08-VERIFY-1 under `ask.verification-proof-policy@1.0.0`。
  public contract、複数段階の状態、mergeの安定した証跡を伴うためformalを選択。
- V1: 公開入力・配点・シナリオ対応、正負fixture、未知状態と部分点の集計を検証する。
- V2: モデル無し準備、合成実行、同一セッションの確認、提出改変拒否、採点引渡しを検証する。
- V3: RC01/標準workerの回帰、npm配布、独立レビュー、適用CIの成功をmerge条件とする。
- 不足条件: 試験未実施、fixture/manifestずれ、未解決の独立レビュー指摘、CI失敗は完了根拠にしない。
  UI実行・難度・実測tokenについてはモデル無しの検証で代用せず未実施として残す。
