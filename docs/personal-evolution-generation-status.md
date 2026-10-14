# 個人ループの生成状態を確認する

生成要求の object digest から、既存の開始印と終了 receipt を読み、次の扱いを確認します。
終了 receipt の digest を呼び出し側が受け取れなかった場合にも使えます。
これは Issue #379 の PV1-7／PV1-8 の部分実装です。実生成、評価、採否、実 Mac への
適用・復元、次サイクルまでの完了を表すものではありません。

## 一つの読み取り入口

既存の生成要求を準備した際の独立した trust と、対象要求の ID を JSON にまとめます。
入力には次の2項目と、必要な既存 trust 配列だけを指定します。

```text
storeRoot
requestObjectDigest
trustedAssetAuthorityContexts       # 必要な場合
trustedPortfolioAuthorityContexts   # 必要な場合
trustedHighImpactApprovalGrants     # 必要な場合
```

保存済み JSON の正確な byte digest を、内容確認時に別途固定して渡します。
digest は `sha256:` に SHA-256 の64桁を続けた形式です。JSONの整形変更も別の bytes
になるため、確認済み digest と一致しなければ停止します。この pin は生成権限や
trust の独立性を認証しません。context はローカルに保持し、公開 Issue／PR へ添付しません。

```sh
node scripts/ask-personal-evolution-status.mjs generation \
  --context "$PRIVATE_STATUS_CONTEXT" \
  --context-digest "$REVIEWED_CONTEXT_BYTE_DIGEST"
```

コマンドは JSON を標準出力へ表示するだけで、ファイルを書きません。provider、CLI、
比較、採点、適用、復元を呼びません。開始・再開・再試行のモードはありません。
不正なコマンド／context は一般化したエラーと exit 10 を返します。読み取れた既存
記録の不整合は `invalid_evidence` の JSON と exit 10 です。その他は exit 0 ですが、
これは状態確認の成功であり、候補の採用や実行許可を示しません。

## 状態と次の扱い

| status | 確認できたこと | 次の扱い |
| --- | --- | --- |
| `NOT_RUN` | 対象要求が検証でき、開始印が存在しない | 送信範囲・provider・要求を確認し、別途必要な新しい実行権限を得る |
| `consumed_unknown` | 開始印があるが、検証可能な終了 receipt がない | 開始印を保持し、進行中・停止・終了不明を調べる。要求を再実行しない |
| `candidate_ready` | 既存 verifier で終了 receipt、import、CAS候補、preparation がつながった | source を独立レビューし、固定評価を新しく準備する |
| `held` | partial／failed／例外などの保留 receipt が検証できた | 保留理由と測定できた部分ファイルの hash を保持し、次サイクルを判断する |
| `invalid_evidence` | 記録・CAS・trust・pathのいずれかが検証できない | 記録を保持し、不整合を調べる。候補・preparation の参照は利用しない |

`invocation_consumed` は観測時点の開始印の有無です。unsafe path 等で判断できなければ
`null` です。開始権限ではなく、別の開始との競合を予約するものでもありません。
`consumed_unknown` は進行中のproviderとクラッシュを区別しません。タイムアウトや
プロセス終了を推測せず、途中の hash を新しい結果として登録しません。

終了済みの場合だけ、元の `execution_receipt_object_digest` を表示します。
`candidate_ready` には検証済みの候補と preparation の参照が含まれます。`held` は
参照を与えず、既存 receipt の bounded failure と部分ファイルの測定結果を残します。
生成内容、observation の本文、context の path、raw error は表示しません。

## 既存の次工程につなぐ

1. [生成 connector](personal-evolution-generation-connector.md) が所有する開始印と receipt
   を、このコマンドで確認する。
2. 候補登録済みなら、既存の独立 source review と
   [準備済み driver](personal-evolution-driver.md) の alignment／評価前固定へ進む。
   `candidate_ready` は source classification、品質、採用、適用の承認を意味しない。
3. 固定した比較の正規実行と保存結果の判断は
   [primary pair](personal-evolution-primary-pair-contract.md) の既存手順で扱う。
4. 保留・終了不明・不整合の記録はそのまま残す。次の候補では新しい観測、要求、候補版、
   評価計画の identity を明示し、必要な権限を別途満たす。開始印の削除や旧要求の
   暗黙の再開を、次サイクルの準備にしない。

状態は呼出時に既存記録から計算され、別の台帳・状態機械には保存しません。caller-owned
store の範囲を超えた一意性、provider の真正性、privacy 宣言の真実、実モデルの実行、
品質向上はこの確認から証明できません。`generation_effectiveness` は `Unknown` のままです。
fake provider の検査は `model_execution: not_applicable`、宣言された実providerは
`Unknown` として既存 receipt の扱いを維持します。

## 非モデル検証

```sh
node --test scripts/test-ask-personal-evolution-generation-connector.mjs
```

未開始、空の開始印、進行中の fake、正常／部分／失敗／例外の終了、receiptや開始記録の
すり替え、CAS欠落、symlink、context drift と strict parsing を検査します。
各状態確認前後でファイル／ディレクトリの内容を比較し、既存の一度限りのdispatchを
増やさないことを確認します。実モデルの通信や実Mac対象への適用は含みません。
