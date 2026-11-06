# 業務契約

共通C01〜C06と以下は受入条件です。方式や修正箇所を指定せず、同じ業務結果を満たす別設計を受け入れます。

## B01 プロジェクト境界

要求はproject・不透明なrequestId・source版・config・target集合に束縛する。別projectや別configの成果物を混ぜず、旧クライアントのdefault project/all targetsの呼出しも同じ業務意味で実行する。

各build入力は、その要求が扱う全sourceのimmutable snapshot（ID、版、本文）を伴う。次要求はsourceの追加/変更/削除を含む新snapshotを渡せる。別のsource編集APIは必須ではない。要求受理後のsnapshotは変わらない。旧クライアントはfixtureのdefaultProjectを使用し、省略targetsはsnapshotの全sourceとする。明示空targetsはcompiler呼出し0の成功である。

## B02 依存発見

compilerは公開source/config/dependency artifactからartifactと追加依存を返す。通常import、動的discovery、glob集合の追加と削除を扱う。循環・依存欠落・compiler失敗は理由付き失敗で、成功artifactとして再利用しない。選択targetと無関係な壊れたsourceだけで要求を失敗させない。

## B03 成果物整合

一要求の成功公開は、選択targetとその必要依存が同じ要求の意味で整合した成果物となる。途中成果物を成功として公開せず、失敗要求で以前の成功成果物を失わない。公開はアプリの一つの不可分判断である。

## B04 重なる要求

同projectの後発要求が現在の要求となる。古い要求の遅い成功/失敗は現在の可視成果物・状態・再利用可能情報を変更しない。別projectの正当な進行を止め続けない。

## B05 取消

取消された要求が後で完了しても新しい成果物や利用可能cacheへ反映しない。既に発行済みcompiler処理の終了と、アプリとしての要求取消を区別して運用画面で確認できる。

## B06 再利用

成功した現在の要求と同じsource/config/依存artifact/targetの再要求では追加compiler呼出しゼロ。変更の影響しない選択targetも追加呼出しゼロ。古いdiscovery/glob関係を現在の必要依存へ残さない。呼出し記録は評価compilerが独立に保持する。

## B07 資源と復旧

運用者が指定した同時compiler上限を全projectと重複要求に跨って守る。再起動後も公開済み成果物と要求履歴を失わず、途中要求は再開または中断の事実を明示する。失敗/取消を成功として復元しない。

上限を実行中件数未満へ下げた場合、既に開始した呼出しを遡って違反とせず、新規開始を使用数が新上限未満になるまで止める。B06の追加呼出しゼロは同じアプリ稼働中の直近成功に対する要求であり、再起動を跨ぐcache保持は必須ではない。

## B08 利用者体験

project/targetを選び実行、取消、失敗原因と履歴、現在の公開成果物を画面で確認できる。現行/旧要求、処理中/公開済み、compiler結果/業務要求結果を混同しない。
