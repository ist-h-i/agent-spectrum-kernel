# 追加テストの実行契約

通常の回帰テストは `test/added/` に自由に追加し、`npm test` で自分の実装に対して実行できます。
追加テストの有効性 10 点に提出するものは `test/added/scenarios/*.test.mjs` に置き、次の公開 helper を使います。

```js
import assert from 'node:assert/strict';
import { scenarioTest } from '../../../harness/scenario.mjs';

scenarioTest('公開 API の回帰条件', {
  program: { steps: [ /* 公開 API の操作データ */ ] },
  check(observations) { /* assert.equal 等で観測値を検証 */ }
});
```

この workspace の `test/scenario-public.test.mjs` に通常動作の完全な例があります。
操作対象は `harness/scenario-capabilities.json` の公開 module/export/method/field に限ります。通常の実装方法は制限しません。
`construct`/`invoke` は公開 factory、`call` は公開 method、`get` は JSON データまたは許可された観測 field、`record` は callback の観測保存、`dataset` は固定入力 JSON の読取です。
`await:false` と `await` で非同期の開始・完了を分け、`release` で購読解除します。`$ref` は既知の参照、`$arg` は callback の JSON 引数です。
`$callback` は有限の操作配列であり、JS コードは入れません。callback の `return` と型付き `raise` も使えます。
class の参照を渡せる位置は capability に列挙した constructor/client 注入点だけです。関数の反射、prototype、任意 module、実装内部へのアクセスは提供しません。

ローカル実行は自分の `src/` を使います。採点では同じ操作を別の実装で観測し、同じ check に JSON 応答を再生します。
提出 JS と非公開実装は同じ workspace へ置きません。抽出・再生のテスト側には `src/` 自体を渡しません。
check は観測された公開動作を検証し、実装 source の import・読取や採点条件への依存で加点を得るものにはしません。
入力の登録は決定的で、抽出・再生で同じになる必要があります。入力は JSON、最大512KiB、深さ32、宣言操作1024、callbackを含む実行操作4096です。
dataset は `data/` の固定 JSON だけ、Map の公開観測は `{size, entries}` です。prototype/関数参照を含まない JSON 応答になります。

同一テストが別構造の正解2件で通り、対応する意味的不良で有効な assertion failure になることが加点の条件です。
空・常時失敗・import/setup 失敗・偽ログ・件数だけでは加点しません。assertion の方法だけでも判定しません。
提出テストは次の2軸で評価します。登録できるシナリオは最大16件です。

- **仕様適合（適合／不適合／未判定）**：同じテストが仕様に適合する2方式の両方で通ることを確認します。仕様が許す動作を誤って不合格にすると立証されたテストがあれば、提出テスト群は不適合で、そのまま受入判定には使えません。
- **不具合検出力（10点）**：仕様違反が立証されたテストだけを除外し、残った適合テストが検出した種類を数えます。同じ不具合は一度だけ数え、固定した不具合一覧に対する割合で加点します。テスト群が不適合でも、他のテストによる有効な検出は残ります。

実行結果と失敗の原因を独立して確認します。参照実装の不備、実行環境の異常、証拠不足は未判定とし、0点や合格に置き換えません。通常要件85点と変更範囲5点は従来どおりです。
