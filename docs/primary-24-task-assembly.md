# 24課題の組立と採点検証

正本24件のうち、基点main `281c6a93` に公開資産があったのは15件。
残り9件は既存候補PRの固定headから、課題ディレクトリ・専用config・課題別source/authority/
archive helper・試験をそのまま取り込んだ。新しい課題を作り直していない。
共通scorer/parser/primary scope/producer/selector/schema/workflow、基点の15課題、過去のrunは変更しない。

| 候補課題 | 再利用元PR / head | 現段階 |
| --- | --- | --- |
| mn-client-compatibility-fix | #341 / f2c4a229387e3d5a756fbbebdeb699b730cbb160 | 公開資産あり。後続の未凍結r9採点処理を検証中 |
| pf-data-schema-evolution | #350 / 730721c864299c53f18317c93e87da4c983bf7cd | 公開資産・既存rubricと例あり。whole admission未完 |
| pf-performance-regression | #355 / d4162b3651eb39dbd44d627351a6c481ec93de4e | 公開入力あり。private採点契約はgeneration_pending |
| pf-library-compat-upgrade | #358 / d59a6a9bfb2fb9949fcc52b5169a45b82e19c9ef | 公開資産・既存rubricと例あり。whole admission未完 |
| pf-observability-redaction | #359 / d15e2eda8ac5a4c5f064cdaf82d3f24b11bec6a2 | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-authorization-exception | #361 / 5505c1c784774b73bb96475aa2b7b979094c9f6a | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-external-action-approval | #362 / 48dbb870af6c5a8807a1acea6d9a30a6f7cee4fc | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-financial-state-integrity | #363 / e7099dde0adfa140c391177d18c5970ecab5ba32 | 公開資産・既存rubricと例あり。whole admission未完 |
| hi-versioned-migration-safety | #364 / cf95a81330858e441a1b447ee5b7d01f4678bfdb | 公開資産・既存rubricと例あり。whole admission未完 |

公開入力は24件、成果物・要件契約が揃うのは23件、個人比較への登録は9件。
公開点検の成功、採点処理のdeveloper control成功、固定resourceとの接続、独立admission、
一括比較の動作を別々に確認する。24件の完成とはまだ報告しない。

## 正常例・不良例を使った実際の検証

既存rubric・採点処理template・author case仕様を**新しい未凍結のprivate作業先**へコピーし、
各課題の現公開workspaceに適用して、採点処理本体を非モデルで実行した。
過去のbundle manifestやrunを採点し直した結果ではない。privateな例・実装・詳細結果はGitへ入れない。
command evidenceは明示的な人工値であり、モデルの検証実行や安全性の証明へ転用しない。

| 課題 | 新しい採点処理本体control | 確認した範囲 |
| --- | --- | --- |
| mn-client-compatibility-fix | 17/17期待一致 | 正常2系統、元の不良例、追加反例、scope、検証欠損・失敗・不正 |
| pf-data-schema-evolution | 22/22期待一致 | schema/migrationの正常・不良・scope・証拠状態 |
| pf-library-compat-upgrade | 34/34期待一致 | adapter/recordの正常・不良・未認識文法・scope・証拠状態 |
| pf-observability-redaction | 40/40期待一致 | policy/reviewの正常・不良・根拠・scope・証拠状態 |
| hi-authorization-exception | 39/39期待一致 | reviewの正常・不良・根拠・scope・証拠状態 |
| hi-external-action-approval | 39/39期待一致 | planの正常・不良・承認状態・scope・証拠状態 |
| hi-financial-state-integrity | 20/20期待一致 | ledgerの正常・不良・未認識文法・scope・証拠状態 |
| hi-versioned-migration-safety | 40/40期待一致 | mixed-version planの正常・不良・rollback・scope・証拠状態 |

クライアント課題では、既存r8の追加反例が示したruntime globalの入れ子prototype変更の
見落としを、新しい未凍結r9の観測対象で修正した。公開契約の「runtime globalsを変更しない」
という既存要件を使い、要件追加やsandbox/Node permissionの緩和は行っていない。
初回の入れ子sandbox実行はOS制約で7件ともmanualとなり、その記録を保持。
同じ既存sandbox/Node permissionを保持した実行環境で7/7、全controlで17/17を確認した。
旧bundleを上書きしたり、この結果だけで独立admissionを承認したりしていない。

7課題の初回controlではauthorizationのreport_text読込が不足し35件が不一致だった。
検証側が既存の例を正しく展開するよう修正し、新しい出力先で39/39を確認した。
この失敗記録も保持している。初回失敗を製品側の問題や成功へ置き換えない。

## 残る完成作業

- 既存15件（従来の個人比較9件を含む）のrubric・正常/不良例も同様に確認する。
- クライアントr9を新しいprivate authority・公開reference・独立レビューへ接続する。
- 性能回帰に、機能とruntime測定を区別するprivate契約・正常/不良例を実装する。
  測定時のloaded sourceと最終source、認証済みraw測定結果の結び付けは共通側の依存として保持する。
- 7候補の安全性/rollback観測のwhole-admission依存、全24件の分類・証拠認識の新版接続を閉じる。
- 既存runnerで全24件の列挙・準備・fake比較・採点・部分失敗保存を確認し、独立レビューとCIを行う。

未評価・採点不能・manualの品質/点数はnullを保持する。過去のrunや凍結bundleの再採点・上書き、
実モデル/Codex比較の開始、認証/security設定の変更、25件目以降の課題追加は行わない。
