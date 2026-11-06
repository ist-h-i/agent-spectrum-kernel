# 帳票の配信・取消・復旧を行う業務アプリ

旧帳票クライアント、運用担当者、監査担当者が同じtenantの帳票要求と配信結果を扱う。稼働中の旧形式要求と保存済み記録を保ち、担当交代と障害からの復旧を運用画面で行う。

contract.md、acceptance.md、roles.md、fixture-format.md、[共通操作・観測契約](../../common/operation-and-observation.md)、nonfunctional.md、delivery-provider.mdに従い、画面・通信・サーバー・永続状態を含むアプリを実装してください。[担当間の業務シナリオ](workflows.md)は、同じ契約を複数担当で使う局面を示します。fixtures/example.jsonは小さな初期入力例で、全受入条件を網羅しません。内部設計・言語・保存方式・画面配置は自由です。

起動、初期化、認証、操作・観測の対応、実装済み・未達・未確認と根拠、所要時間と終了理由を報告してください。360分は共通の作業目安であり強制停止ではありません。未確認を成功と断定せず、一部が阻害されても独立した作業を続けてください。

版 business-five-20261106-decisions1。配布入力はinput manifestで識別します。難度の校正や全実機受入の完了を意味しません。

[business-decisions.md](business-decisions.md)の追加業務契約も実装対象です。ここでは承認・確定事実・回復を複数担当で扱います。旧版の点数や特定の解法は受入条件ではありません。
