# プロジェクト用テンプレートと例

以下は開始用のテンプレートであり、記入済みの事実や実行済みの証拠ではない。既存の同等ファイルがあれば統合する。不要な項目は省く。コマンドや業務判断を推測で埋めない。

## プロジェクトプロファイル

推奨先は`docs/ai/executable-spec-profile.md`。ASKのcontext statusを使い、コマンドが未設定なら`template`のままにする。設定や参照が古くなったら`stale`へ戻す。

```markdown
---
context_status: template
last_updated: "<確認日>"
evidence_owner: "<確認担当>"
source_scope: "<確認したリポジトリ範囲>"
---
# 実行可能な仕様のプロジェクト設定

- 適用範囲: 新規開発。言語と対象モジュールは確認後に記入
- 規約: インストール済みspec-driven-developmentの該当参照
- 正本: 既存Specの項目を参照するか、通常のテストをSpecにするか
- 業務コンテキストと有効なADR: 確認した場所
- テスト配置・ランナー・ID記法: 確認した規約
- 索引: docs/spec-index.json
- 生成・鮮度検査コマンド: unavailable（未設定）
- テスト探索とselector照合: unavailable（未設定）
- 通常の高速検証: unavailable（未設定）
- 境界別の結合・契約・操作検証: unavailable（未設定）
- 広域検証・CI必須検証: unavailable（未設定）
- 実行条件: 必要なサービス、設定、権限を確認して記入
- 未対応範囲と見直す条件: 確認した不足のみ記入
```

上記のラベルは説明用。採用先では実際のファイル・コマンド・根拠へ置き換える。生成と検査の実行、selector照合、代表ケースの確認が済んでから`initialized`とする。

## プロジェクトルールの入口

既存のプロジェクトルールへ、実際に解決できるパスで追加する。CodexへのASK導入では通常`.agents/skills/spec-driven-development/`へ投影されるが、使用中のadapter stateとファイルを確認する。他の導入形式へそのパスを無条件にコピーしない。

ASKでは`.agent-spectrum-kernel/codex-install-state.json`の`selected_skills`に`spec-driven-development`が含まれることを確認する。現行の`daily`、`organizational`、`full`には含まれ、既定の`implementation`だけでは含まれない。既存の導入手順から必要なスキルを含むプロファイル、または依存関係を満たす明示的な選択を使う。単に正本リポジトリへファイルが存在するだけでは、導入済みと扱わない。

```markdown
このプロジェクトは実行可能な仕様の開発手法を採用する。
仕様変更・バグ修正・リファクタリングでは、まず
docs/ai/executable-spec-profile.md を読み、対象の仕様項目から
テスト本体、業務コンテキスト、現在有効なADRへ進む。
読む範囲と実行する検証範囲は別々に決める。
記述規約・索引・取得手順・選定ルールは、インストール済み
spec-driven-development の必要な参照だけを読む。
```

## 言語別の通常テスト

[JavaScriptのテスト](examples/javascript/reservation.test.mjs)と[Pythonのテスト](examples/python/test_reservation.py)は、同じ架空の予約処理をそれぞれ独立した小さなプロジェクトとして示す。採用先の業務仕様ではない。[ドメインの説明](examples/domain-context.md)には目的と用語を置き、観測可能な条件はテストに置く。

- suiteの`@spec`コメントにSpecのID、revision、合意状態、コンテキスト参照を一度置く。
- ケース近傍の`@acceptance`コメントに項目IDと変更寿命を置く。
- テスト名、明示的な入力、通常のassertで条件と結果を表す。独自のassert DSLを導入しない。
- コメント形式は索引アダプターを作る場合の一例。採用先にdecorator/tag等があれば再利用する。メタデータの存在だけでrunner selectorが解決したことにしない。

サンプルの実行コマンドはスキルのディレクトリを起点として次のとおり。実際のプロジェクトへ無条件に持ち込まない。

```sh
node --test references/examples/javascript/reservation.test.mjs
python -m unittest discover -s references/examples/python -p 'test_*.py'
```

## 索引の一項目の例

次のJSONは形式の説明であり、生成済みの索引ではない。placeholderを持つ出力を有効な索引として使わない。

```json
{
  "format_version": "1.0",
  "source_fingerprint": "<actual input hash>",
  "source_scope": {"include": ["<actual source roots>"], "exclude": []},
  "generator": {"command": "<actual command>", "source": "<actual generator path>"},
  "items": [{
    "spec_ref": {"artifact_id": "SPEC-RESERVATION", "item_id": "AC-EXCEEDS-CAPACITY", "observed_revision": 1},
    "source": {"path": "<actual test path>", "anchor": "AC-EXCEEDS-CAPACITY"},
    "status": "accepted",
    "lifetime": "business",
    "checks": [{"path": "<actual test path>", "selector": "<discovered runner selector>", "kind": "unit"}],
    "gaps": []
  }]
}
```

ユニットテストで保証できない並行予約の条件等は、別の受入条件と結合検証への参照を同じ索引へ載せる。検証が未実装なら`checks: []`と具体的な`gaps`を残す。テストがgreenだからという理由で省かない。
