# 既存 invariance 検証の環境切り分け

対象 HEAD: `2f503631250b7be9ef79c3e5ef9ac52c8e278934`。Node `v24.19.0`。

初回の `test-ask-benchmark-admitted-fixture-invariance.mjs` は 14/16 成功し、履歴 commit から schema を読む 2 件が失敗した。これは schema が対象 commit に存在しないというコード不良ではなく、single-branch clone に必要な履歴 Git オブジェクトが不足していたためだった。元 checkout では同じ commit と schema の存在を確認できた。

現行 CI の `validate.yml` は、履歴検証より前に次の commit を明示取得している。同じ固定オブジェクトを独立した clean clone に揃え、ソースを一切変更せず再実行した。

```sh
git fetch --no-tags origin a06e96f8a493b0ae70d3910c73c644b0da13fa25
git fetch --no-tags origin e51eeddf5e5675660205e7f70bcdba202b57e77c
git fetch --no-tags origin 277d5d7bca619bb7dca17190aa4f9f99bfbbe23a
node scripts/test-ask-benchmark-admitted-fixture-invariance.mjs
```

ローカルの再現では、既存 checkout を読取元として同じ SHA のオブジェクトを取得した。`277d5d7b` の履歴には、当初読めなかった `b290feb25cc1aa2fe3b04bebbd001558cc7846e1` も含まれる。

結果: **16 tests / 16 pass / 0 fail / exit 0**、約 202.27 秒。先に失敗した public invariance と incomplete-private evidence の両テストを含め、改変・lineage・登録整合性の検査をすべて保持した。テスト、検証器、既存 24 問、catalog、freeze を変更する必要はなかった。

別の `test-ask-benchmark-materialize.mjs` は、作業中の tracked 差分を拒否した後、独立 clean clone で成功した。この dirty-worktree 前提と、上記の履歴オブジェクト前提は異なる。materialization の成功だけを invariance の成功と読み替えない。

本記録は環境前提の訂正であり、履歴検証の削除・fallback・弱体化による修正ではない。
