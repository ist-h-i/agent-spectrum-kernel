# Stream contract index

- api.md: event、window、batchと戻り値。
- storage.md: 生産者sequence、checkpoint v1/v2/v3、返値の所有権。
- resources.md と data/load.json: 必要な生存状態と固定負荷・測定条件。
- harness/consumer.mjs と src/legacy.mjs: 既存consumerの呼出し形。
- harness/sink.mjs: 出力・拒否の観測。
- harness/values.mjs: 公開JSON返値を保持しset/readする汎用操作。
- scenario-tests.md: ソース分離された追加テストの提出形式。
