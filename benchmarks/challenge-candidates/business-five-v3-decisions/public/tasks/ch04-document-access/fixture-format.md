# 初期fixtureの意味

共通外形はclock(UTC)、actors、grants、dataです。actor IDは一意、tenantはrealm、role名は表示・操作案内のための情報で、認可は明示grantで行います。grantはactor ID、tenant、operations文字列配列、必要ならscope(ID配列)、deny(boolean、省略false)。参照は同じfixture内の同tenant対象を指し、特に定義した循環だけを許します。未知fieldは評価要件に使いません。data内の以下の配列は、省略時は空配列です。起動時に意味不正なfixtureが渡された場合は評価側の準備不良であり、候補の業務違反にはしません。

resourcesはid、tenant、parentId(nullまたは同tenantのresource ID)、kind:folder/document、version。documentsはresourceと同じid/tenant、body文字列、versionを持つ。groupsはid、tenant、members(actor ID)、includes(同tenantのgroup ID)、version。policiesはid、tenant、subject:{kind:actor/group,id}、resourceId、operations、effect:allow/deny、version。親resourceへのpolicyは子孫へ継承する。delegationsはid、tenant、issuer/recipient(actor ID)、parentId(nullまたは同tenantのdelegation ID)、resourceIds、operations、expiresAt(UTC)、active:boolean、version。chainが循環・参照不正なら使用不可で、無関係の正当な権限まで停止しない。contextsはid、actor、tenant、version、active。空のcontextsは未openで、利用者が認証主体に対応するcontextを生成する。

fixtures/example.jsonはこれらの構造の公開例です。token対応表はfixtureと別に評価側が渡し、実アカウントは不要です。

## 追加業務データ

dossiers, documentVersions は追加業務の状態です。初期入力は空配列とし、評価側も公開操作で準備します。既存データのimport/restore契約は維持します。追加データの保存形式を固定せず、対応は提出説明で示してください。
