# 利用者と操作の対応

fixtureのactorと明示grantに従います。role名だけで権限を自動付与しません。以下は操作名の意味と通常の担当であり、評価fixtureは許可の追加・削除・denyを行えます。管理機能から暗黙の業務実行権は得られません。Ownは認証actor自身が開始した操作を意味します。read/auditもtenantと対象scopeを制限します。対象指定scopeが空なら対象なし、scope省略は明示tenant内全対象です。

| 通常担当 | 操作名 |
|---|---|
| reader | read, export, cancelOwn |
| delegator | read, grantDelegation, revokeOwnDelegation |
| policyAdmin | readPolicy, setPolicy, revokeDelegation |
| auditor | audit |

各操作の対象とHTTP対応は提出説明に示してください。別利用者・他tenantの操作IDや通知を操作権限の代わりに使えません。deny:trueの一致grantはallowより優先します。読取・通知・外部効果も同じ対象scopeに制約されます。

委譲を作る利用者には対象操作の元権限とgrantDelegationの両方が必要です。policyAdminだけでは本文read/exportを付与されません。delegateのscope/操作/期限は元権限と全chainの範囲内です。
