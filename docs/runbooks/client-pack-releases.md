# 環境別クライアントパックの手動リリース

Issue #6、#17。サーバーCDとは分離し、本番で更新した `data/<環境ID>/packwiz/` をクライアント配布情報の正とする。
GitHub Pagesとバージョン付きmrpackを同じデータから生成する。Minecraftのみ対応。
サーバーのMODや個人用 `client.mrpack` は自動更新しない。

## Pi Skill

プロジェクト管理の `.agents/skills/release-client-pack/SKILL.md` で公開手順を定型化する。
`/skill:release-client-pack <環境ID>` で呼び出す（追加後は `/reload`）。
MOD変更済みのpackwizデータを入力とし、Pages・Release公開・Discord通知確認・Issue記録を行う。
リリース本文は変更項目のみ、Issueも短い箇条書きにする。サーバー操作・MOD変更は対象外。

## packwizからの公開候補生成

URL参照のみの候補を生成し、公開前にMOD差分とpolicy指紋を確認する。

```bash
python3 scripts/packwiz-export.py mc-create-aeronautics \
  --pack-dir "$HOME/apps/homeserver-gameserver-1/data/mc-create-aeronautics/packwiz" \
  --output /tmp/packwiz-public-candidate.mrpack
```

packwiz CLIとネットワーク接続が必要。元データを一時コピーして書き出し、
元のMOD一覧・URL・SHA-512と候補を照合し、JARや個人ファイルを同梱しない。
既存出力は上書きしない。候補の指紋が未承認の場合は公開しない。
公開mrpackは全MODをserver unsupportedとするクライアント専用。
packwiz側もclient専用とし、サーバーMODの管理には使用しない。

## packwizの公開

本番でMOD・packwizを更新して検証し、`pack.toml`のversionを増やす。
各MODは本番で検証したバージョンに固定し、クライアント専用MODも含めてsideをclientにする。
`cd "$PACK_DIR" && packwiz refresh` でindexとハッシュを更新する。
配布URLのファイルと本番JARのハッシュを照合し、前回Releaseとの差分をレビューする。
候補指紋をpolicyに記録してコミットする。`packwiz-export.py` は候補生成用であり、
公開の承認チェックを代替しない。prepareからPages公開完了まで元データを変更しない。

```bash
PACK_DIR="$HOME/apps/homeserver-gameserver-1/data/mc-create-aeronautics/packwiz"
python3 scripts/packwiz-publish.py prepare mc-create-aeronautics --pack-dir "$PACK_DIR"
# 生成された公開mrpackとRELEASE_NOTES.mdを確認・編集
python3 scripts/pack-release.py publish mc-create-aeronautics VERSION --client-verified
# draft確認後、Pagesを公開。対象環境以外を変更せず通常pushする。
python3 scripts/packwiz-publish.py pages mc-create-aeronautics --pack-dir "$PACK_DIR" --version VERSION
# gh run list等でpushしたコミットに対応するPagesデプロイを確認
# Pagesのpack.tomlとindex.tomlを取得し、公開した元データとのハッシュを照合
# 問題なければ gh release edit ... --draft=false でdraftを公開
# release.publishedのActions実行を照合し、Discord通知を確認する
```

`VERSION`は実際のバージョンに置き換える。Pages公開はクライアントに即時影響する。
Pages成功後にRelease公開が失敗した場合は部分公開をIssueに記録し、むやみに再実行しない。
`gh-pages`は専用の公開ブランチで、mainとのマージは不要。個人用ファイルは含めない。
現行の公開URL: https://yuutaro.github.io/homeserver-gameserver-1/minecraft/mc-create-aeronautics/pack.toml
packwiz installerによる既存Prismインスタンス移行時は古い未管理MODの残存に注意。
既存ファイルと配布対象の同名ファイルは上書きされ得るため、事前にバックアップする。
新規PrismインスタンスはMinecraft 1.21.1、NeoForge 21.1.252、Java 21で作成し、
`packwiz-installer-bootstrap.jar`をminecraftフォルダに置き、起動前コマンドを設定する。

```bash
"$INST_JAVA" -jar packwiz-installer-bootstrap.jar https://yuutaro.github.io/homeserver-gameserver-1/minecraft/mc-create-aeronautics/pack.toml
```

Pages公開済み1.3.11は新規Prism導入・本番接続を確認済み。既存Prism環境の移行と、
実際のMOD変更からPages・Release・Discord通知までの一連の運用は次回の実作業で検証する。
個人用schematicはPagesや公開mrpackに含めず、従来の個人用パックも自動更新されない。

## 導入案内ページ・PrismインスタンスZIP

`pages/minecraft/mc-create-aeronautics/` の `index.html` と `style.css` をGit管理する。
`packwiz-publish.py pages` はpackwizとは別にこの2ファイルを配置し、同じディレクトリへ
`prism-instance.zip` を生成する。案内は次回公開でも再配置される。
packwizのindexやmrpackにはHTML/CSS・Prism ZIPを含めない。

ZIPは `instance.cfg`、`mmc-pack.json`、`minecraft/packwiz-installer-bootstrap.jar`、
READMEとbootstrapのMITライセンスのみ。MOD・個人設定・アカウント・接続先は含めない。
Minecraft/NeoForgeのバージョンは公開対象のpack.tomlから取得し、起動前コマンドは
当該環境の固定Pages URLを参照する。Javaのローカルパスは固定しない（Java 21を各利用者が選択）。
bootstrap v0.0.3は公式Releaseから取得し、`scripts/prism-instance.py` の固定SHA-256と照合する。
bootstrap更新時は公式取得元・ハッシュ・ライセンスを再確認する。

案内のみ更新する場合も、現在公開済みのバージョンを指定して `pages` を実行する。
新しいReleaseやDiscord通知は不要。pack/indexのハッシュが変わっていないことに加え、
公開HTML/CSS/ZIPを取得してローカル生成物と照合する。
Minecraft/ローダーの更新時は案内HTMLの動作環境表記も更新する。
Prism GUIでのインポート・初回起動確認は、ZIPの構造検査・installer単体検証とは区別して記録する。

## 旧client.mrpack方式

以下は旧方式の参照用。現在のpackwiz用policy指紋とは異なり得るため、
このままでは公開できない場合がある。

## 初期設定

Python 3.11以上（標準ライブラリのみ）、packwiz CLI、gh、Gitを使う。
gh認証のほか、`gh-pages`へのGit push権限とGitのコミット用author設定が必要。

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

## 旧方式：更新から公開まで

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
6. RELEASE_NOTES.mdには追加・更新・削除したMODとバージョンだけを短い箇条書きで記入。
   検証状況・既知の問題はIssueに簡潔な箇条書きで記録し、権利表記はパック内に維持する。
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
