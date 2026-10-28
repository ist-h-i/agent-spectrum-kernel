# 認可の意味

P1 tenantごとのPolicyStore snapshotは `{revision,users,groups,resources,rules}`。groupsはgroupIDからuser:id/group:idの配列で、入れ子/cycleを含む。resourcesはidから `{parent:null|id,body}`、rulesは `{subject,resource,action:'read'|'export',effect:'allow'|'deny'}`。本人/到達group、対象/到達祖先、同actionのruleが適用される。deny優先、通常allowも有効なcapabilityもなければ拒否。未知user/resource拒否。cycleは有限に処理する。本文はASCII、tenant間で識別子や本文を混ぜない。

P2 CapabilityStore.grant(value)が返すIDをcontext.capabilityIdへ渡せる。valueは `{tenant,resource,actions,audience,expiresAt,parent?}`、audienceはuserIDか'*'、parentはcapability IDかnull。contextがcapabilityを明示した場合、対象からparentまで全chainが存在・active・同tenant、audienceが本人か'*'、actionを含み、resourceが対象自身か対象の祖先、かつnow<expiresAtでなければ拒否。cycleまたは長さ32超過は拒否。全て満たすcapabilityはallow候補だがP1のdenyに優先しない。parentの変更や失効はchildにも即座に適用される。capabilityを使わないcontextでは通常policyだけで判定する。

P3 ContextStoreのcontextは `{id,revision,active,tenant,user,capabilityId}`。同IDのreplaceはrevisionを増やし、過去のidentityへ結果を付け替えない。期限境界now==expiresAtは無効。capabilityのrevision/active/期限とpolicy/contextの変更は、通知が未配信でも以後に開始した取得に反映する。通知はcacheの真実源とは定めない。
