# Literal body と対象要件の読取り診断

この追加APIは文字列を解析するだけで、shell、model、workerを起動しない。元command evidence wire、1.3/1.4 parser、manifest、raw digest、match_state、scoreは変更しない。現在のprivate matcher、reference、bundle、admissionへ自動接続しない。

## Command body

`diagnoseSavedCommandBody({ rawCommand, contract })` は `ask-saved-command-body-observation.mjs` のpure diagnostic exportである。public宣言の各shell commandについて `body_bytes_equal`、`canonical_render_bytes_equal`、`shell_envelope_equal` を分けて返す。bodyの一致はdecode後のbytes完全一致で、shell semanticsの同値化、scriptの実行、任意digestの再認証は行わない。

有限の `/bin/bash -lc`、`/bin/bash -c`、`/bin/zsh -lc` literal envelopeを最大2段までdecodeする。引用片の連結・literal escapingをdataとして処理し、outer substitution/変数展開、extra statement/argument、NUL、未知shell/flag、過深nestはUnknown。body内の追加statementや`cd`は指定bodyと異なれば一致しない。rawやbody本文は返さずdigestを保持する。

`scoring_eligible=false` は常に固定。working_directory、execution_actor、source_loaded、outcomeは常にunverifiedとして返す。callerが渡したcontractや文字列は、それだけではproducer/runtime authorityを認証しない。既存manifestにこの診断を混ぜず、`matched_command_id`やpassへ変換しない。正規consumerが利用するなら、検証済みcarrierの元command evidence ID・source stream digestへ別途結び付け、body観測と実行authorityを区別する。

公開回帰fixtureは保存されたbuild/docの9 command rendersの形を保ち、公開source hashesを全てsynthetic a*64へ置換した。原stdout/output、workspace絶対パス、run IDs、秘密、privateケース、正解本文を含めない。fixture文字列は実行しない。

## Target requirement

`classifyTargetRequirement(actionText, { aliases })` は `ask-review-target-requirement.mjs` のpure helperで、`required` / `not_required` / `unknown` を返す。aliasesはliteral文字列で、同節の明示的な対象・述語・否定だけを認識する。別対象のtestをblockingにする指示、条件付き・提案・引用・正負の矛盾、認識できない表現はUnknown。自然言語全般を理解したとは主張しない。

Bの将来版private matcherに渡す接続点は、このhelperのimportと対象aliasの公開定義である。`required`を認識できた場合だけ対象必須という観測に使い、`unknown`を自動pass・非blockerへ変換しない。private consumerの採点影響、source closure、reference/review/admissionはBが別の版で検証する。本PRでprivate側を接続済みとは扱わない。

## 非モデル検査

```text
node --test scripts/test-ask-saved-command-body-observation.mjs scripts/test-ask-review-target-requirement.mjs
node --test scripts/test-ask-primary-saved-command-capture.mjs
node scripts/test-ask-benchmark-command-evidence.mjs
```

confidenceの対象とcurrent blocker/resume gateの最小文言案は `primary-evaluation-contract-clarifications-proposed.md`。現行の公開課題・固定採点の変更ではない。
