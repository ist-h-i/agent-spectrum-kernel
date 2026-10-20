# 全24課題のv2採点資産への接続

Artifact ID: `verification-primary24-private-v2-20261020`。基点main `4c0b9d348cc5c705ba1a72f20df3a79660a9d857`、Issues #207/#379、PR407、`primary-evaluation-correctness-v7.md` と `primary-24-task-assembly.md` の継続実装。

既存23課題のwriter/validatorへ互換opt-inを追加し、全24 private bodyのtask固有要件を共通v2導出へ接続する。既定v1、入力/要件ID/点/公開意味、旧runと凍結資産を保持する。性能archiveは既存identity/formatを再利用する。private答案・rubric・oracle・実資産は公開Gitへ入れず、対応source/asset digestを外部の新規保存先で記録する。

Verification Contract (Formal、既存formal pathを維持):

| Obligation ID | 実証する動作 | 必要な証拠 |
|---|---|---|
| P24V2-WRITER | 23接続と既存handoffがv1/v2 profileを選び、output/freeze/referenceの整合性を保つ | 課題別新規source/private rootでの生成・再検証、未知profile/不一致拒否、既定v1互換 |
| P24V2-ASSETS | source-onlyはworker/sandboxを起動せず非実行の資産検証だけを行う | resource-assets-only正常例・boundary競合/欠損拒否、生成失敗時の元資産保持 |
| P24V2-MEANING | 全24 bodyが実要件ID/点/evidenceを保持し、v2共通導出を使う | 課題別正常/代表的不良/判定不能と正常な代替解・scope逸脱、manual/nullと既知fail0の区別 |
| P24V2-BINDING | 新private bundle/review/admission/selectorと両role24mapを正確なsourceへ固定する | source/asset raw digest、独立review、既存selector/loader/preflightの課題別結果。人工trustを実admissionに流用しない |
| P24V2-ROUNDTRIP | 既存個人ループの保存・再読・採点で24件を扱い、失敗後の個別証拠を保持する | 実公開入力と新資産へのbinding、非モデルfixture transport、保存済み結果の再読、重複dispatch0 |
| P24V2-MERGE | 最終公開sourceの互換性とprivate漏洩なし | 関連CI終端・独立レビュー・差分と資産境界の確認 |

実モデル/Codex比較は開始しない。以前拒否されたnative実行・停止経路は再試行せず、別経路で回避しない。その実行権限を要する検証だけは不足証拠を課題別に保存し、他の必須コード/資産接続は続ける。未評価/採点不能を品質0で埋めない。private source-only生成やfake成功をnative安全性・実測・ASK優位性の証拠にしない。

不足機能は既存責務に最小追加して解消する。新しい監査基盤・管理層・課題は追加しない。完了主張には上表の実証が必要で、人間用プロンプトだけでは開発完了としない。

v2では入力破損を実際のtyped authorityまたはnormalized command evidenceから導く。候補の虚偽引用などtask evidenceの不良は、全要件が採点可能なら`completed / invalid_evidence`として保存し、command verificationとは独立に判定する。未確認要件が混在する場合は既存の`manual_review_required`、分類省略、null点を保持し、既知のevidence fail・finding・採点済み点を消さない。typed input invalidの優先度とv1解釈は保持する。供給済みstatus/classificationを入力破損の根拠にせず、semantic causal referencesも元のfinal output等へ閉じる。

Proof selection: `ask.verification-proof-policy@1.0.0` の `formal_verification_contract`。formal triggersは公開互換性、cross-module/persistence、multi-session、merge trace。選択refは本書のArtifact ID。既存formalからのdowngradeは行わない。
