この人工 repository の `task.md` にある atomic rule batch API を実装してください。
最初に既存の `AGENTS.md`、task、関連 docs/schema、実装、test を読み、
repository の情報で決められる事項は自分で確認してください。

変更は task の許可範囲（既存の5つの src と test/）に限定してください。
package.json、docs、task、ASK 管理ファイルを変更せず、依存を追加しないでください。
ネットワーク、認証、外部サービス、実プロジェクト、global 設定を使う必要はありません。
境界が守れない場合は停止し、不足する証拠を述べてください。

既存の failing test を確認し、実装と task が指定する focused regression
tests を追加して `node --test test/*.test.mjs` を実行してください。
最終応答には変更理由・許可範囲の patch・実行した正確な command/exit/result・
未検証事項を含めてください。ASK の既存 workflow が選んだ契約・proof selection・
evidence ref はその既存形式で示し、未実行の command を実行済みにしないでください。
この一件から ASK の有効性や release readiness を結論づけないでください。
