# CH08 登録の検証記録

Artifact: CH08-IMPLEMENT-1。上流: CH08-SPEC-1 / CH08-PACKAGE-1。
選択した証明は [CH08-VERIFY-1](README.md#作問検証契約) のFormal Verification Contract。
作問開始時のmainは `3d6a3f00`。PR #499 のmain `73cf6315` を通常マージで取り込み、統合状態 `0ffe2091` でも再検証した。primary24と既存RC01の登録内容は変更していない。

| 証拠ID | 義務 | 実行した検証 | 観測結果 |
|---|---|---|---|
| E1 | V1/V2 | `node --test benchmarks/challenge-candidates/ui-reconstruction-v1/tools/public-package.test.mjs` | 11 pass / 0 fail。正負JSON、56配点、欠測、準備、合成2段階、改変拒否、配布投影 |
| E2 | V2/V3 | `node --experimental-test-module-mocks --test scripts/test-challenge-evaluation.mjs scripts/test-practical-challenge-worker.mjs scripts/test-instruction-loop-practical-runtime.mjs scripts/test-practical-evaluation-runner.mjs` | 60 pass / 0 fail。実モデル呼出しなし |
| E3 | V3 | `TMPDIR=/private/tmp node --test --test-concurrency=1 scripts/test-npm-package.mjs` | 1 pass / 0 fail。実アーカイブ、ローカルインストール、永続workspace、登録一覧でCH08を確認 |
| E4 | V3 | `node scripts/validate-repo.mjs` | Repository validation passed |
| E5 | V1/V2/V3 | 別担当が仕様・採点・登録・提出固定を独立レビュー。`node --test scripts/test-challenge-evaluation.mjs benchmarks/challenge-candidates/ui-reconstruction-v1/tools/public-package.test.mjs` | 27 pass / 0 fail、未解決のmerge blockerなし |
| E6 | V3 | `git diff --check` | exit 0 |
| E7 | V1/V2/V3 | main `73cf6315` 統合後にE2、E4、E5を再実行。`TMPDIR=/private/tmp node --test --test-concurrency=1 scripts/test-npm-package.mjs scripts/test-finding-intake.mjs scripts/test-verification-review-dispatch.mjs` | 回帰60件、独立確認27件、実配布・finding・dispatch関連28件すべて成功。Repository validation passed。競合・変更ファイルの重複なし |
| E8 | V2/V3 | PRのP2指摘を初回・再確認 × symlink・16MiB超過の4ケースで再現後、提出inventory検査を整合性エラー処理内へ移動。E2/E4とCH08＋RC01を再実行し別担当が独立確認 | 修正前は追加4件すべて失敗。修正後は31件、標準回帰60件、repository validationが成功。receipt・usage・stage-resultを残し、不完全結果の再試行と採点を拒否。独立レビューで未解決blockerなし |

独立レビューで見つかった初回〜確認間のファイル追加を完全inventory照合で拒否した。
型表記、依頼消費、同時刻イベント順序、間接根拠リンクの失効も修正し、再検証した。
Macの別名一時パスで初回npm検証は拒否されたため、canonicalな `/private/tmp` で実施。
続いて発見した大小文字の同名配布衝突を確認用文書の改名で直し、実配布試験を通した。
これらの初回失敗を通過済みの結果へ読み替えていない。

統合後もCH08の仕様・配点・runnerは同一で、差分は30ファイル。finding設定は存在せず、AGENTS 7.6の保存処理は対象外。

GitHub上の最終PR、実行headに対応する全適用CI、merge結果はPRの履歴を証拠とする。
未解決CIまたはレビュー指摘があれば通常mergeしない。保護・ruleset設定は変更しない。

未実施: 実モデルによる解答試行、正解UIの全操作通過確認、難度校正、実測の生成時間とtoken。
合成の輸送・計算器検証はこれらの代替ではない。npm registryへのpublishも行っていない。
原HTMLはサイズ・行数・SHA256を照合した調査資料であり、コミット・配布しない。
