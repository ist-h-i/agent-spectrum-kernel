# 初期fixtureの意味

共通外形はclock(UTC)、actors、grants、dataです。actor IDは一意、tenantはrealm、role名は表示・操作案内のための情報で、認可は明示grantで行います。grantはactor ID、tenant、operations文字列配列、必要ならscope(ID配列)、deny(boolean、省略false)。参照は同じfixture内の同tenant対象を指し、特に定義した循環だけを許します。未知fieldは評価要件に使いません。data内の以下の配列は、省略時は空配列です。起動時に意味不正なfixtureが渡された場合は評価側の準備不良であり、候補の業務違反にはしません。

defaultProjectはprojectsのID。projectsはid、tenant、sources(source IDをキー、{version,text}を値に持つobject)、targets(ID配列)、config(JSON)、sourceVersion(不透明snapshot版)を持つ。requestsはproject/id、sourceVersion、targets、config、state:running/succeeded/failed/cancelled/interrupted、owner(actor ID)と結果/理由を持つ。publishedはproject、requestId、sourceVersion、targetArtifactsを持つ。compilerExamplesは公開compilerの入出力例で初期app状態ではない。特定のsource文字列を候補が構文解析する契約ではなく、必要な関係はcompiler応答で得る。新build入力でsource snapshotを置換し、旧要求のsnapshotは不変。initialConcurrencyは1〜8で運用者が後から同範囲に変更できる。

fixtures/example.jsonはこれらの構造の公開例です。token対応表はfixtureと別に評価側が渡し、実アカウントは不要です。

## 追加業務データ

channels, releasePlans, releases は追加業務の初期状態です。公開例では原則空で、実行中の操作から生成できます。追加状態のimport形式を固定する必要はなく、初期化は空の追加状態からでよい。CH06 channelsだけはid/tenant/version/requiredTags/releaseId(nullまたは公開版identity)を初期値として読む。その他の追加状態は評価側が公開操作で準備します。既存fixtureの形式は維持します。
