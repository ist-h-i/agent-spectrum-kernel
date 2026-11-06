# 利用者と操作の対応

fixtureのactorと明示grantに従います。role名だけで権限を自動付与しません。以下は操作名の意味と通常の担当であり、評価fixtureは許可の追加・削除・denyを行えます。管理機能から暗黙の業務実行権は得られません。Ownは認証actor自身が開始した操作を意味します。read/auditもtenantと対象scopeを制限します。対象指定scopeが空なら対象なし、scope省略は明示tenant内全対象です。

| 通常担当 | 操作名 |
|---|---|
| producer | ingest, ingestBatch, readOwnDelivery |
| reconciler | read |
| operator | read, importCheckpoint, exportCheckpoint |
| closer | read, advanceWatermark |
| auditor | read, audit |

各操作の対象とHTTP対応は提出説明に示してください。別利用者・他tenantの操作IDや通知を操作権限の代わりに使えません。deny:trueの一致grantはallowより優先します。読取・通知・外部効果も同じ対象scopeに制約されます。

## この版の操作と認可対象

以下の追加操作も明示grantで許可し、role名だけでは付与しない。scope省略/空配列とdeny優先の意味は上記と同じ。操作名は業務権限を指し、HTTP命名を指定しない。複数の対象条件はすべて必要。認可されない対象の存在・件数・metadataを返さない。

| 操作 | scopeに使う対象 |
|---|---|
| proposeRefund, amendRefund, approveRefund, sendRefund, withdrawRefund, readRefund | refund ID（新規申請も指定するID） |
| settle, readSettlement | 窓のUTC開始文字列（例2026-11-01T10:00:00Z） |
| auditRefund | refund ID |

元売上の照合/表示はそのeventIdへのread権限を別途要する。承認/送信は対象refundへの許可と同tenantの元売上へのreadを要する。精算は対象窓の許可で窓合計とその窓の返金metadataを扱い、任意event本文を読む権利は与えない。

申請の変更は申請者本人または同じamend権限の担当に限る。自己承認は禁止で、承認権と実行権は別である。追加一覧・照会は上表のread操作、監査は上表のaudit操作へ対応する。既存read/auditだけから新しい業務操作を暗黙に許可しない。
