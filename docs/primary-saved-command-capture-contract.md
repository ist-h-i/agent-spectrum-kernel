# 保存済み primary command capture と派生評価手順

Requirement REQ-PRIMARY-SAVED-CAPTURE-1 は、9課題を個別に分析する目標を維持し、
追加モデルなしで保存イベントの互換性を修正する本人の指示を参照する。
Spec SPEC-PRIMARY-SAVED-CAPTURE-1 と Verification VER-PRIMARY-SAVED-CAPTURE-COMPATIBILITY-1
は、イベントの解析と検証コマンドへの一致を分ける。今回は手順の固定までで、実採点はしない。

## 変更範囲と版

- 従来 parser 1.3.0 と一般 adapter の設定は維持する。
- primary producer だけが明示的に parser revision
  1.4.0-primary-saved を選ぶ。対応する literal envelope は
  /bin/bash -lc、/bin/zsh -lc、/bin/bash -c の3種類。
- quoted word を有限状態で文字列として読む。単一引用、二重引用、literal な
  連結・escape に対応する。外側の変数・command substitution・backtick・余分な
  argument・未閉鎖引用・NUL・曖昧な構造は拒否する。
- コマンド、shell、文字列 eval を実行しない。内部 script の安全分類は既存のまま。
  script の bytes が分かることと、公開検証コマンドとして採用できることは別。
- rendered digest は実際に記録された wrapper・引用形式を含む文字列から作る。
  zsh/c を bash-lc に書き換えて matched にしない。cwd も推測しない。
- primary の2枚の派生 command-evidence schema にだけ新しい revision を加える。
  base/core schema、normalizer 1.3.0、v4 criterion/配点/判定規則は変えない。
- 捕捉不能は capture_invalid:<typed_code> として保存する。任意の例外 message、
  raw command、stdout の内容は診断理由へコピーしない。未分類は unclassified。

共有 parser の追加 API、primary producer、primary schema generator と生成2枚、
合成検査、CI の検査段階、本文書だけが今回の変更対象。
terminal inventory/copy guard は依存する #340 の e5082428 に含まれる。
#340 の CI・統合判断は別に保持する。固定 r9/v4 を開発 branch へ追随させない。

## 保存3成果物の読取り検査で分かった限界

初回 mp-ci-evidence-gap には P・K-principles v2・F の保存結果がある。
新しい shell profile で P の6 pairs、K の5 pairs を解析できるが、すべて
固定公開コマンドと厳密一致しない unmatched である。検証成功を捏造しない。
F の11 pairsのうち10は解析できる。item_10 は既存の bounded inline-script
authority に該当せず unsafe_command。whole-stream manifest は unavailable を維持する。
pair 別の読取り診断は補助情報であり、whole-stream 完全性や採点権限の代用ではない。

元の capture_invalid、P/K の manual/null/fail、F の blocked は保存したまま。
新しい読取り結果は別の派生証拠として並べる。有限 prose matcher の未解決を、
capture 修正だけで pass・品質0・正式比較成功へ変えない。
現在の1課題3成果物の回収は、9課題の目標や残8課題24枠の実行計画を縮小しない。

## 派生評価の準備と実行前停止点

1. 開発版を独立レビュー済みの正確な Git commit と source-file SHA 一覧で固定する。
   自己参照する Git commit は本文へ埋めず、外部の processing-version manifest に記録する。
   criterion_version は既存 v4、processing_version は新規 ID とする。
   これは処理系の固定であり、採点資産の admission が済んだという意味ではない。
2. r9 の run/plan/batch/input、保存 stdout/stderr/final response、diff、terminal receipt、
   controller journal、旧事後採点結果を読取りで inventory 化する。bytes、digest、mode を保存。
   コピー時に source/destination の同一inode・hardlink・symlink・共有 Git alternates を拒否。
   元の r9 を入力として使い、新しい start 印を作らず、元の消費印を消さない。
3. 元の v4 version manifest/resources manifest と全9課題の task、公開入力、
   requirement-set/weight/evidence/scope/scoring-policy、hidden evaluator/oracle/mutation/
   equivalence/検証資産の raw bytes を基準一覧に固定する。本人が既に固定した
   criterion bytes を改訂せず、観測回答を使って matcher を調整しない。
4. 新しい独立 source checkout、private criteria copy、条件別 workspace、採点領域、
   出力領域を別々の root へ用意する。開発 worktree・原 r9/v4・旧事後採点 output と
   書込み領域を共有しない。source は正確な commit を持つ独立 Git root とし、
   evaluation と development の common Git 管理領域を共有しない。
   chmod/read-only は同じ OS user に対する完全な防壁ではないことを記録する。
5. 既存の explicit scoring-version/resource writer/validator を用い、独立コピーにのみ
   新しい処理 source graph・schema closure・bundle/reference/freeze・review/admission
   binding を発行する。原 v4 ID を使った source 差替え・hash bypass は行わない。
   authority/binding metadata の変更と criterion の不変を、ファイルごとに区別する。
   既存 exporter の block wrapper で新しい scoring_version/resources を明示的に選択し、
   元の実行 plan/run/receipt/保存回答の ID と bytes を保持する。
   API がこの lineage を拒否する場合は設計不足として停止し、保存 plan を改変しない。
6. 保存3成果物へ新 producer を使用する前に、原本の before inventory とコピー後の
   inventory を比較する。parser は raw stdout を読むだけで、保存コマンドを再実行しない。
   unsupported/malformed/unsafe は具体的理由と unavailable を保存する。
   native controller check の pass をモデルの実行した検証の代用にしない。
7. 新資産の独立 source/closure review、criterion-byte comparison、非モデル preflight を
   行い、選択版の raw digest と全条件の lineage を固定する。準備用の空領域を
   実行証拠にしたり、未実施の worker/review/admission を記録したりしない。
8. **ここで親へ返す。** 新 processing/resource IDs、criterion 不変証拠、独立レビュー、
   parser の捕捉/未確認結果、未実行一覧、本人の新しい承認が必要な実採点範囲を提示する。
   現時点では private grading worker、比較 start/resume、モデル/CLI、残24枠を起動しない。

## 本人が別途承認した後だけ行う派生採点

対象は保存済み mp-ci-evidence-gap の3条件であり、モデル再実行ではない。
新しい専用出力・一度限りの派生採点印を使う。既存 export/producer/original private
grading/score/save APIs を使い、P→K-principles v2→F を各1回、既存4 worker/条件の
予算と185分の block grading reservation を維持する。モデル tokens は0。
採点 API が blocked/unknown、worker 終了が未検証、原本 drift があれば直ちに止め、
再試行せず途中結果を保存する。完全な worker 終了と semantic scoring readiness は別。

旧原報告、初回事後採点、派生報告を別ファイルで保存する。criterion v4 と processing ID、
各要件の判定/根拠/未評価、capture の状態、実施/未実施を並記する。
manual/null/unmatched は維持し、数値・順位を作らない。
残8課題24枠は未開始として9課題一覧に明記する。将来の本人の実行承認と独立の
固定実行計画が必要であり、この回収手順から自動で開始・resume しない。
