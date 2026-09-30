# Create 鉄道系 Addon メモ — Minecraft 1.21.1 / NeoForge

最終確認: 2026-10-01

このメモは Minecraft 1.21.1 + NeoForge + Create 6 系で鉄道系 Addon を組むときの注意点を、あとから構成を作り直せるようにまとめたものです。

## 結論

1.21.1 / NeoForge でも主要な Create 鉄道 Addon はかなり揃っています。まず次を候補にします。

- Create
- Create: Steam 'n' Rails (1.21.1 NeoForge port)
- Create: Blocks & Bogies
- Create Railways Navigator
- Create Train Parts
- Create: Track Map (必要なら)

蒸気機関車の大径動輪、連結棒、バルブギア付き大型台車を追加したい場合は **Create: Blocks & Bogies** が重要です。

Steam 'n' Rails 自体にも鉄道向け要素は多数ありますが、「蒸気機関車らしい大型動輪付き Bogey」を目的にするなら Blocks & Bogies を併用するのが分かりやすいです。

## 前提環境

基本構成:

    Minecraft 1.21.1
    └─ NeoForge
       └─ Create 6.0.x
          ├─ Steam 'n' Rails
          ├─ Blocks & Bogies
          ├─ Railways Navigator
          ├─ Train Parts
          └─ Track Map

Create Addon は Create 本体への依存が強く、Minecraft と NeoForge のバージョンが同じでも **Create のマイナーバージョン差で起動不能になることがあります**。

Create を単独で最新版へ更新するのではなく、サーバーで使う Addon 全体の対応状況を確認してから更新します。

## 1. Create: Steam 'n' Rails

1.21.1 向けは本家とは別の unofficial port として公開されています。

- Modrinth: https://modrinth.com/mod/create-steam-n-rails-1.21.1
- Minecraft 1.21.1
- NeoForge
- Client + Server
- Create 6 系

追加内容は追加線路、鉄道装飾、Conductors、Smokestack、車両向けブロック、列車運用機能などです。

### Create バージョンとの関係

1.21.1 port では Create 更新に伴う起動クラッシュが何度か修正されています。たとえば 0.1.0-rc では Create 6.0.8+ 周辺、0.3.0-alpha.2 では Create 6.0.10 での起動クラッシュ修正が入っています。

そのため Create を更新するときは Steam 'n' Rails 側の changelog も確認します。

## 2. Create: Blocks & Bogies

- Modrinth: https://modrinth.com/mod/blocks-bogies

**蒸気機関車を作るなら重要な Addon。** 大型 Bogey とバルブギア付き Bogey を追加します。

用途:

- 大径動輪
- 連結棒
- バルブギア
- 多軸の機関車風 Bogey

「蒸気機関車用の台車を追加する Addon」として思い出しているものは、まずこれを確認するとよいです。

1.21.1 / NeoForge 対応版があります。1.0.6 では Create 6.0.7+ で Bogey が黒くなる問題の修正も入っています。

### Steam 'n' Rails との互換性

Steam 'n' Rails 1.21.1 port の初期 RC では Blocks & Bogies が非互換扱いでしたが、その後の Steam 'n' Rails 0.1.0 では互換性復旧が明記されています。

したがって古い 1.21.1 port を使わず、両方とも比較的新しい版を使用します。

問題が起きた場合は Create + Steam 'n' Rails + Blocks & Bogies の 3 つだけでテストワールドを作ると切り分けやすいです。

## 3. Create Railways Navigator

- Modrinth: https://modrinth.com/mod/create-railways-navigator

鉄道網が大きくなってから便利になる運行管理系 Addon です。

- 駅間ルート検索
- 発車案内表示
- 列車内表示
- 乗り換え案内
- Schedule 拡張
- Train Separation などの運行制御

1.21.1 / NeoForge / Create 6 用ビルドがあります。ファイル名に **C6** と付く版が Create 6 対応です。

0.9.0 以降は DragonLib が追加依存になるため、依存 MOD を忘れないようにします。

## 4. Create Train Parts

- Modrinth: https://modrinth.com/mod/create-train-parts

車両・駅設備の細かい部品を増やします。

- 踏切 / Crossing Gate
- Sliding Window
- Train Step
- 車両向け装飾・機能ブロック

1.21.1 / NeoForge 対応版があります。0.4.0 は Create 6.0.9 を明示的に依存先としているため、Create バージョン選定時の制約として確認します。

## 5. Create: Track Map

- Modrinth: https://modrinth.com/mod/create-track-map-%28unofficial-fork%29

Create の鉄道網と列車位置をブラウザから確認する Web Map です。1.21.1 対応版は unofficial fork です。

- NeoForge 1.21.1 対応
- Server-side で利用可能
- ブラウザから路線・列車を確認可能
- Kotlin for Forge が依存

2.1 / 1.21.1 NeoForge 版は Create 6.0.9 へ更新されています。ホームサーバー運用と相性がよい機能ですが、外部公開する場合は listen address、ポート、認証、Firewall / Reverse Proxy を確認します。

## 推奨導入順

最初は最小構成から始めます。

    Minecraft 1.21.1
    NeoForge
    Create 6.0.x
    Steam 'n' Rails
    Blocks & Bogies

ここで列車の組立・走行・保存・再起動後の復元を確認します。その後 Railways Navigator と Train Parts を追加し、必要なら最後に Track Map を追加します。

一度に全部入れるより、段階的に追加した方がクラッシュ時の原因を切り分けやすいです。

## Create のバージョンをどう決めるか

**Minecraft 1.21.1 だから全部互換、ではありません。** Addon ごとに Create 6.0.7 / 6.0.8 / 6.0.9 / 6.0.10 などへの追従タイミングが異なります。

確認項目:

1. Minecraft Version = 1.21.1
2. Loader = NeoForge
3. Create major version = 6
4. Addon の changelog に使用中の Create version に関する crash fix がないか
5. 追加 dependency がないか

既存ワールドでは動いている組み合わせを固定し、Create だけを先行更新しない方が安全です。

推奨手順:

    Create / Addon の対応確認
    → world バックアップ
    → テストコピーで起動
    → 列車の組立・走行確認
    → 本番ワールドへ反映

MOD を自動で「最新」にする運用は避けます。

## Aeronautics と併用する場合

Create: Aeronautics も使う場合は、鉄道 Addon と Aeronautics が **同じ Create バージョンで動くこと** が最優先です。

つまり Aeronautics、Steam 'n' Rails、Blocks & Bogies、その他 Addon が対応する Create バージョンの共通部分を選びます。

Aeronautics は物理系へ大きく手を入れるため、問題が出たときは Create + Aeronautics と Create + Railways 系を別々にテストして切り分けます。

## このリポジトリでのサーバー運用 Tips

このリポジトリでは Minecraft サーバーデータは data/<server-id>/ 以下で管理され、Git 管理対象外です。鉄道環境も専用プロファイルに分けておくと安全です。

例:

    data/
    └── mc-create-1-21-1/
        ├── server.env
        ├── mods/
        ├── config/
        └── world/

jar 自体を Git 管理しなくても、導入バージョン一覧は別途残しておくと復旧が楽です。

例:

    minecraft=1.21.1
    loader=neoforge
    create=...
    steam-n-rails=...
    blocks-bogies=...
    railways-navigator=...
    dragonlib=...
    train-parts=...
    track-map=...
    kotlin-for-forge=...

可能なら Modrinth の project/version ID も記録します。

## Client / Server の差

Steam 'n' Rails、Blocks & Bogies、Railways Navigator、Train Parts などは基本的に Client と Server の双方へ導入します。Track Map は server-side で利用できます。

## トラブルシューティング

### 起動直後にクラッシュ

まず疑うもの:

1. Create と Addon のバージョン不一致
2. Forge 用 jar と NeoForge 用 jar の取り違え
3. Minecraft 1.20.1 用 jar の混入
4. 必須 dependency の不足
5. Steam 'n' Rails の古い port
6. Blocks & Bogies の古い版

### 列車組立時だけ落ちる

Create の Bogey / Contraption 周辺へ Hook する Addon の競合を疑い、Create + Steam 'n' Rails + Blocks & Bogies まで戻して確認します。

### 描画がおかしい

Create/Flywheel、Bogey rendering、shader、描画最適化 MOD の相互作用を疑います。サーバーではなくクライアントだけで起きるなら描画系から切り分けます。

## 現時点で確認できている対応状況

| Addon | MC 1.21.1 | NeoForge | 用途 |
|---|---|---|---|
| Create | Yes | Yes | 本体 |
| Steam 'n' Rails 1.21.1 port | Yes | Yes | 鉄道総合拡張 |
| Blocks & Bogies | Yes | Yes | 大型 Bogey・蒸気機関車向け動輪 |
| Create Railways Navigator | Yes | Yes | 経路検索・案内表示・Schedule |
| Create Train Parts | Yes | Yes | 車両・踏切・装飾 |
| Create Track Map unofficial fork | Yes | Yes | Web 路線図・列車位置 |

## 更新時チェックリスト

- [ ] Minecraft は 1.21.1 のままか
- [ ] NeoForge 用ファイルか
- [ ] Create のバージョンを先に決めたか
- [ ] Steam 'n' Rails の changelog を確認したか
- [ ] Blocks & Bogies の対応を確認したか
- [ ] Railways Navigator が Create 6 用 (C6) か
- [ ] DragonLib など追加 dependency を確認したか
- [ ] Train Parts の Create 依存バージョンを確認したか
- [ ] world をバックアップしたか
- [ ] 本番ワールドではなくコピーで起動確認したか