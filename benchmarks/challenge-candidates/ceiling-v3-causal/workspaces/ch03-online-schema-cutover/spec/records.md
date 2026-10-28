# 保存形式と利用側

R1 各recordは `(tenant,id)` で独立し `{tenant,id,revision,incarnation,deleted,v1,v2}`。revisionとincarnationは正safe integer。初期fixtureで省略されたdeletedはfalse、incarnationは1。削除後にも識別情報は残り、次の作成はincarnationが増える。削除済みrecordのreadV1/readV2は成功value:null。削除前の予約commandは、同じidの後のincarnationに効果を及ぼさない。

R2 v1はnullまたは `{price,currency}`。currencyはUSD(2桁)かJPY(0桁)。priceは`0|[1-9][0-9]*`に通貨桁以下の任意小数部を持つ非負文字列。指数・符号・空白・余分なfield・過剰小数・先頭ゼロは不正。v2はnullまたは `{amountMinor,currency,taxMode}`、amountMinorは非負正規10進整数文字列、taxModeはincluded|excluded。桁数は48桁以内、Number精度への丸めは不可。nullと0は別の業務値。

R3 mixed phaseでincludedの両表現は同じ価格を示し、v2→v1は通貨桁まで0埋め。excludedのwriteはmixedではMIXED_TAX。v2 phaseのexcludedは許され、readV1ではUNREPRESENTABLE。旧不正値をreadV2しても元データを壊さずUNMIGRATABLE。未知idはvalue:null。

R4 store.registerWriter(t,w,'v1'|'v2')のhandleは `{tenant,writerId,version,epoch,generation}`。再登録は同versionでもgenerationが異なる。直接write/removeには現登録のactive/version/generation/epochが必要。予約command `{version,id,value,handle,expectedIncarnation}` は投入時に有効だったhandleに束縛される。退役後も同generation・同epochなら予約済みcommandをdrainできるが、再登録されたgenerationや後のepochへ付け替えない。expectedIncarnationは正safe integerで、存在しない初作成だけ0。commandの不正shapeはINVALID_INPUT。

R5 `legacyScreen(service,t).load(id)`は成功をstatus200/body、save(id,value,handle)は成功status204、業務失敗status409/body:{code}へ変換する。modernFormのread/save/remove/refresh、legacyBatchImportを提供する。protected利用側のsourceを編集せず両方の意味を保つ。
