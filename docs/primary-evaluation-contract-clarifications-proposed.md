# 本評価の公開契約への最小明確化案

Status: Proposed。将来版の公開契約を所有する担当への変更案であり、現行task、schema、private evaluator、reference、admission、原採点を変更しない。採用時は独立した版・固定ID・reviewを付けて、開始前に計画へ記録する。

## Performance: confidence の対象

公開contractへの追加候補:

> `confidence` は今回の性能悪化の因果説明に対する確信を指す。機構の明瞭さや相関の強さだけでは `high` にしない。今回の因果を識別するcontrolled interventionが未完了なら、主仮説は `supported` としてもconfidenceを `low` または `medium` にする。

理由: 保存回答は全条件とも因果未証明を明記しながら主仮説をhighにした。現行の公開文言では「機構を支持する確信」と「今回の障害の因果確信」の尺度が分かれていない。これは将来の入力明確化案であり、既存highの意味を遡及的に決めたりraw failを改訂したりしない。

公開正例の設計: 明瞭なcache identity機構・観測相関があっても、本障害の因果未証明ならsupported/medium。負例の設計: 相関だけを理由に今回の因果が確定したと扱う。具体的なprivateケースや正解本文はこの案へ含めない。

## Migration: current pause と resume gate

公開taskへの追加候補:

> `current_state.blocking_condition_ids` はoperation stateが記録した現在のpause reasonsを同じ集合として記録する。再開承認の不足などresume gateの制約は、resume gateとcontinuationの停止条件に記録し、現在のpause reasonsへ混ぜない。

理由: 保存回答の差は承認欠落ではなく、現在の停止理由と再開条件の分類粒度だった。既存handoffとraw scoreは維持する。将来版で明確に分離する場合にだけ、この文言を採用する。

公開正例の設計: 現在のpause理由を保ち、承認待ちは再開gateと継続停止条件に置く。負例の設計: 承認待ちを欠落させる、または根拠のない再開承認を生成する。

## 採用責任と固定境界

Bのprivate参照開発と公開task所有者が、採用する版の公開文言・採点要求・source identityを照合する。本PRは提案文書を加えるだけで、カタログ追加、7課題の採用、fixed資産の再生成、旧runの再採点、モデル実行を行わない。
