# 環境別クライアントパックの手動リリース

Issue #6。サーバーCDとは分離し、本番で更新した `data/<環境ID>/client.mrpack` を正とする。
生成・アップロードはサーバーや元パックを書き換えない。GitHub Actionsは追加しない。
現在はMinecraft mrpackのみ対応。Project Zomboidには別の生成処理が必要。

## 初期設定

Python 3.11以上（標準ライブラリのみ）とghを使う。

```bash
cp config/pack-release.env.example config/pack-release.env
chmod 600 config/pack-release.env
# 実際の本番データ・成果物ディレクトリを記入
# PACK_OUTPUT_DIRは個人用も保存するため非公開の場所にする
$EDITOR config/pack-release.env
gh auth status
# 未認証の場合のみ gh auth login
```

.envは単純なKEY=VALUE形式。シェルとして実行せず、変数展開もしない。
ホストパス・必要時のGH_TOKENだけを保存。bot.envは読まない。
認証は原則ghの保存済み認証を利用し、トークンを重複保存しない。
認証トークン・設定値をログに出さない。出力パスはローカル端末に表示される。

## 更新から公開まで

1. 従来どおり本番MODとclient.mrpackを更新（個人用schematicは維持）。
2. サーバー・クライアントで動作確認し、パックのversionIdを増やす。
3. `config/pack-policies/<環境ID>.json` の配布条件・公式URL変換・禁止MODを確認。
4. 個人用と公開候補を生成。

```bash
python3 scripts/pack-release.py prepare mc-create-aeronautics
```

`PACK_OUTPUT_DIR/minecraft/mc-create-aeronautics/1.3.5/` に以下を保存する。

- `mc-create-aeronautics-personal-1.3.5.mrpack`: 元パックの同一コピー（公開しない）
- `mc-create-aeronautics-public-1.3.5.mrpack`: 公開候補
- `THIRD_PARTY_NOTICES.md`, `SHA256SUMS`, `release-manifest.json`, `RELEASE_NOTES.md`

公開候補は元のoverridesを一切コピーしない（設定、schematic、旧noticeも除外）。
必要なら今後、レビュー済みの独自設定を個別許可リストとして実装する。
パック名・summaryも固定の公開用表記に置換。JAR同梱は確認済みURL変換だけを許可する。
パック内のダウンロード参照はmods/*.jarのみ、公式ホスト/HTTPS/サイズ/SHA1/SHA512を検査。
URLへの実アクセスや全MODの新規ダウンロード検証は行わない。Prismでの新規導入確認が必要。
GitHubへのアップロード対象は公開mrpackのみ。noticeはパック内に含め、SHA256SUMSはローカルに保存する。

5. 生成した公開候補を新規Prismインスタンスで確認する。
   個人版とはコピー設定の有無が違うので、個人版での確認だけでは代替しない。
6. RELEASE_NOTES.mdにMOD差分・旧MOD削除手順・必要Java/推奨メモリ・確認結果を記入。
   本番の非公開接続先や機密情報は書かない。リリース本文は手動レビューする。
7. 全許諾確認が済んだらpolicyのpending_permissionsを解消し、publication_approvedをtrueにする。
   根拠URL/条件をconditionsへ記録し、Gitレビューする。生成manifestのmod_manifest_sha256を
   policyのreviewed_mod_manifest_sha256に記録する。MOD一覧が変わると承認は無効になる。
   スクリプトは法的判断を代行しない。
   policy変更後は同じ版の未公開出力を確認して削除するか新しい版を使い、再生成する。
8. 検証済み公開候補だけをDraftへアップロード。

```bash
python3 scripts/pack-release.py publish mc-create-aeronautics 1.3.5 --client-verified
```

タグは `packs/minecraft/mc-create-aeronautics/v1.3.5`。
現在のpolicy・生成時policy双方の承認、公開ZIP許可リスト、成果物ハッシュを検査する。
既存リリース・既存タグを上書きしない。APIエラー時は停止する。
失敗後はGitHubを確認する（添付途中のDraftができている可能性がある）。
Draftの公開はghから実行できる（Web操作不要）。

```bash
gh release edit packs/minecraft/mc-create-aeronautics/v1.3.5 \
  --repo yuutaro/homeserver-gameserver-1 --draft=false
```

ユーザーがサーバー確認のみで公開を希望した場合は、`--client-verified` の代わりに
`--server-verified-only` を明示する。クライアント検証済みとは扱わない。
リリースノートは追加・変更項目を簡潔に記載し、権利表記はパック内に維持する。
これだけではPrismの既存インスタンスの
自動差分更新にはならない。Gitタグはghがリモートの既定ブランチを指して作るので、
タグが本番MODのGitコミットを表すわけではない。成果物とmanifestが構成の記録となる。

## 配布条件の現状

現行1.3.5の公式URL参照のみの公開について運用者が承認済み。
JAR本体・第三者の設定・schematicは再配布しない。FTBは1.3.5で除去済み。
Create Fluid/Sable Schematic Compatのメタデータ上の不明点は、リンクのみの
公開を止める理由とは扱わない。作者の追加許諾を得た、法的に保証された、という意味ではない。
具体的なパック配布先制限が判明した場合は再評価する。

- FTB: https://feed-the-beast.com/raw/docs/mod-license （パック配布先がCurseForge限定）
- Modrinth: https://support.modrinth.com/en/articles/8797527-obtaining-modpack-permissions
  （Modrinthにある対象ファイルのModrinthパック利用可。GitHubの包括許諾ではない）
- CurseForge: https://support.curseforge.com/support/solutions/articles/9000207877
  （作者の第三者配布設定。CDNから取得できることだけでは許諾確認にならない）
- Xaero: https://modrinth.com/mod/xaeros-minimap / https://modrinth.com/mod/xaeros-world-map
  （外部配布で公式リンク・クレジット、外部収益化には書面許可）
- Ore Excavation: https://www.curseforge.com/minecraft/mc-mods/ore-excavation
  （MODパック使用可、別指定とMinecraft EULAに従う）
- Create Connected: https://github.com/hlysine/create_connected/blob/main/LICENSE
  （AGPLと追加条項、原作者・公式リンク表示）
- Create Fluid: https://www.curseforge.com/minecraft/mc-mods/create-fluid
  （ライセンス表記に差異あり。今回JARを再アップロードしないため公開ブロック対象外）
- Sable Schematic Compat: https://www.curseforge.com/minecraft/mc-mods/sable-schematic-compat
  （MITメタデータ・同一公式ファイルは確認済み。公式URLのみの公開を運用承認済み）

本番pack-exportsのLICENSE_AUDIT.json/CONDITIONS_REVIEW.mdは調査の詳細記録。
監査ファイルを自動で公開にコピーはしない。無条件の再配布可能宣言はしない。
商用パック・有料公開サーバーを検討する場合は非商用条項を別途再確認する。

## Release公開時のDiscord通知

`.github/workflows/notify-pack-release.yml` は `release: published` と `packs/` タグを対象にする。
Environment **discord bot** のEnvironment Secretsに次を設定する。

- `DISCORD_TOKEN`: 既存Discord botのトークン（コード・新しい.envには保存しない）
- `RELEASE_NOTIFICATION_CHANNEL`: 通知先チャンネルID

guild IDはworkflowの非機密設定。チャンネルのguildをAPIで照合してから送信する。
現在の対象はguild `1555243086060200000` / channel `1556537643502932060`。
送信主は既存bot（Webhookではない）。botアプリの変更・再起動は不要。

権限はDiscordの対象チャンネルの「チャンネルを編集 → 権限」で、bot本人またはbotロールに
「チャンネルを見る」「メッセージを送信」「埋め込みリンク」を許可する。
Administratorは不要。個別の拒否設定やカテゴリ継承も確認する。

Releaseタイトル・リンク・本文をEmbedにし、メンションを抑止する。長い本文は省略する。
ghのユーザー認証で公開したReleaseはActionsが起動する。GITHUB_TOKENで作成したイベントは
再帰防止のため別workflowを起動しないことがある。既存公開版の本文編集だけでは通知しない。
Draft作成時も通知しない。将来のリリースタグにこのworkflowが含まれている必要がある。

送信先制限や権限不足はActionsの実行ログで確認する。トークン・API応答本文はログに出さない。
429は回数制限付き再試行。nonceは最近の重複送信を抑止するだけなので、再実行前にDiscordを確認する。
実際の通知が未送信なら、初回の公開で動作確認する。テストから実チャンネルへは送信しない。

## テスト

```bash
python3 -m unittest discover -s scripts/tests -v
```

Issue関連コミットのみ作成し、本番へのコード配備は別途通常の手順で行う。
