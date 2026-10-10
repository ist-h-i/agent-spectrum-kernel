# Mac / Codex で最初の開発タスクを受け入れる準備

利用者自身の Git repo を P／K／F で比較する場合は
[利用者 repo の三条件比較手順](user-repository-comparison-mac-codex-ja.md) を使います。
以下の人工 workspace と implementation profile は、その F 条件の Full とは別です。
新入口の `prepare`／`inspect`／`report` はモデルを起動せず、`start` は人間が内容と
正規の権限を確認して実行する操作です。この開発で実モデル比較は行っていません。

実務に近い観測を小さく回す新しい方針は [探索的評価](pragmatic-evaluation.md) を
参照してください。global 設定の不明、環境や CLI 版の違いは記録して解釈を限定し、
完全隔離や完全一致を研究上の開始条件にしません。下記の preparation と未実行記録は
そのまま保持します。認証・秘密・送信の安全制限と Installed/Activated/Operational の
区別は変わりません。

ASK 導入後に、変更範囲・失敗条件・検証結果を追える開発成果物を受け取れるか
確認するための一件です。実装は公開人工 fixture の atomic rule batch API に
絞ります。一般の実プロジェクトへの適用、モデル起動、成果改善の比較は含みません。
この準備の基準は main@8131bf3d（[#331](https://github.com/ist-h-i/agent-spectrum-kernel/pull/331)
取り込み）です。実際に使う source は保存 record の commit と hash を見てください。
`source_worktree_clean=false` の場合、commit だけでは準備した source を特定
できません。保存 Plan と preparation file hash も参照してください。

## いま実行できること

[導入・復旧 quickstart](quickstart-mac-codex-ja.md) と同じ Node 24.x / Git /
完全な ASK checkout を使います。追加 dependency、Codex CLI、認証は不要です。

```sh
node scripts/prepare-first-workflow.mjs
```

この command は新しい使い捨て Git repository だけを作り、既存の
`inspect → recommend → plan → check → apply --dry-run → apply → doctor` で
Codex **implementation** projection を導入します。global 設定や既存 repository
を対象にする引数はありません。内部で実行するのはローカル Node と Git だけです。

表示される `workspace` が開発対象、`Inputs` が二つの入力文の保存場所、
`Private records` が計画・doctor・seed test・受入記録の場所です。すべて新しい
一時ディレクトリの下にあります。自動 upload はありません。外側の新規 root は
0700、helper が直接書く seed・入力文・log・worksheet は 0600 です。既存 CLI が
書く Plan、ASK installer と Git が作るファイル・ディレクトリの mode はそれぞれ
既存の実装に従います。
一時領域は長期保存を保証しません。必要な record/log のコピーを安全な私的領域に
保管し、実際の実行は準備した workspace が残っている間に行ってください。
workspace や Plan の移動・再適用はしないでください。
準備失敗は終了コード 1 です。未完成の記録を成功として使わないでください。

seed test は **3件中2 pass / 1 fail、exit 1 が期待値**です。`applyBatch` が
未実装であることを確認しています。準備成功や Installed=pass は task 完了では
ありません。実務 workflow と bypass はともに `not_started` のままです。

## 渡す入力と受け取る成果物

対象は既存の [task](../benchmarks/fixtures/checkpoint-b2/impl-rule-batch-medium-hard/task.md)
と9ファイルの公開 workspace です。既存の契約・schema・visible test を再利用し、
元の benchmark fixture、private evaluator、admission/freeze/scoring authority は
変更もコピーもしません。これは公開練習問題であり、秘密 holdout ではありません。

将来、実行条件と今回専用の許可が確定した session で `workspace` を開き、
[実装入力](fixtures/first-workflow-315/implementation-input-ja.md) を渡します。
この入力は `task.md` の10要件を参照し、既存5つの src と test/ だけに変更を
限定します。期待する受取内容は次のとおりです。

| 受取内容 | 確認方法 |
| --- | --- |
| atomic batch、strict validation、canonical duplicate、version、idempotency、aliasing を扱う実装 patch | task と既存 docs/schema の全要件に照合し、失敗時に rules/version/idempotency が保たれることを確認 |
| focused regression tests | atomic failure、replay/collision、canonical duplicate、aliasing が観測可能であり、既存 API の test も通ること |
| command / exit / result と未検証事項 | `node --test test/*.test.mjs` の実ログ。pass 件数や未実行 command を応答から推測しない |
| scope diff | src/test の許可範囲だけ。package/docs/task/ASK managed files の変更なし |
| 選ばれた ASK workflow / proof / evidence の参照 | 既存形式の contract・proof selection と実ログを対応づける。自己申告だけで適用済みにしない |

baseline 以外の task output は今回作っていません。公開 visible test の成功だけで
全要件を満たしたと判断せず、追加 test と独立した task review を必要とします。
これは新しい scorer や release gate ではありません。

## 軽い質問で bypass を確認する

実装前の同じ人工 workspace で [bypass 入力](fixtures/first-workflow-315/bypass-input-ja.md)
を渡すと、期待する回答は `npm test` の一行です。package.json の読取り以外の
command、編集、Requirement/Spec/Work Package の量産はこの質問には不要です。
これは既存 `AGENTS.md` の trivial 分岐を観察する確認であり、ASKなし条件との
公正な実験ではありません。record には実際の応答、変更前後の tree、観測できた
route を保存します。短い応答だけから内部 Skill が呼ばれなかったと断定せず、
route が見えない場合は unknown を残します。今回の bypass は未実行です。

## 三つの状態を判断する記録

生成した `local-records/acceptance-record.json` は私的な記入用 worksheet です。
validator、activation authority、封印された再採点結果ではありません。記入だけで
doctor が pass になる仕組みも追加していません。
GitHub には確認した source・検証件数・未実行の判定だけを報告し、私的な path、
raw record/session/log、認証情報、private evaluator を転記しないでください。

| 状態 | 既存実装への接続と必要な証拠 | 準備時点 |
| --- | --- | --- |
| Installed | `ask-setup` Plan/apply、managed identity、`doctor` の Installed | この人工 workspace で pass |
| Activated | 人または project policy による profile 選択、実際に有効な command/Skill、runtime load、必要な実行許可の参照 | insufficient_evidence |
| Operational | 一件の実 patch・command log・scope review、現在の runtime health、[既存 governance](adapter-deployment-governance.md) による判断 | insufficient_evidence |

Codex の static doctor は Activated/Operational を自動認定しません。
実行後も [adoption setup](adoption-setup.md) の診断と governance の判断を分けます。
保存 record とログはローカルで read-only に開けます。例えば次の command は
保存 bytes の表示だけです。

```sh
node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' /absolute/private-records/acceptance-record.json
```

model を使う sealed pair/reopen は [既存 local eval](local-eval-distribution.md)
の別契約であり、この worksheet で置き換えません。

## 実行前にまだ確定していないもの

今回確認した runtime はローカルの Node / Git / OS です。Codex image/version、
model/reasoning/provider、送信先と送信内容、既存認証の利用・refresh、session、
timeout/retry/token/cost の許可は未確定です。worksheet の対応欄は null、usage は
unknown のままにしています。旧 pilot の許可・閾値を流用せず、これらを一件に
束縛してから実行可否を判断してください。終了後の token stop は hard cost cap
ではなく、provider request 数や残り subscription 枠を表しません。

新しい探索的 cycle では実際に選ぶ CLI/model 等を記録し、旧版との一致は要求しません。
利用者の追加指示により、残量の独立確認不能や月次30%保証の欠如は停止理由から外します。
これは runtime/traffic の安全確認・実行許可や、reset／追加課金の許可を意味しません。

本準備から Codex CLI、実 sandbox、認証取得、Keychain、モデル、ライブ比較、
拒否された診断経路は起動しません。host の security 設定を変更する必要もありません。
Windows/Linux の初回実ホスト受入は引き続き後続です。

この一件の受入と、公正な比較・成果改善の実証は別です。[#315](https://github.com/ist-h-i/agent-spectrum-kernel/issues/315)
の全OS配布条件、[#192](https://github.com/ist-h-i/agent-spectrum-kernel/issues/192) /
[#198](https://github.com/ist-h-i/agent-spectrum-kernel/issues/198) の必須価値検証、
#291 の正式実験、#202 の最終 release gate は残ります。
