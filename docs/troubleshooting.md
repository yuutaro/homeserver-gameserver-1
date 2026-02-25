# トラブルシュート（詰まったポイント集 + 自力で直すための知識）

このプロジェクトは「Discord Bot が Docker を操作して Minecraft コンテナ `mc-prod` を生成する」設計です。
そのため、問題が起きた時は **Bot / Docker / Minecraft(itzg) / ネットワーク / メモリ** のどこで止まっているかを切り分けます。

---

## 0. まず押さえる前提（仕組みの全体像）

### 起動の流れ（概略）

1. Discordで `/start server:<server-name>` を実行
2. BotがホストDockerへ接続（`/var/run/docker.sock`）
3. 既存 `mc-prod` があれば停止・削除（排他起動）
4. `data/<server-name>/server.env` を読み込み、`itzg/minecraft-server:*` を `mc-prod` として起動
5. `mc-prod` はホストの `MC_HOST_PORT`（例: 30002）を `25565/tcp` に publish
6. クライアントは `ホストIP:MC_HOST_PORT` に接続

### 重要なディレクトリ（本番ホスト）

- デプロイ先: `/opt/homeserver-gameserver-1/`
- サーバーデータ（Git管理外）: `/opt/homeserver-gameserver-1/data/<server-name>/`
  - `server.env` は **このディレクトリ直下**に置く
- Bot設定（Git管理外）: `/opt/homeserver-gameserver-1/config/bot.env`

---

## 1. “接続できない” の切り分け手順（最短）

### 1-1) まずポートpublishを確認する

Minecraftに入れない多くの原因は「ホストの待受ポートが想定と違う」「まだ起動完了していない」です。

```bash
docker ps --filter name=mc-prod --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

- 期待: `0.0.0.0:30002->25565/tcp` のように見える（30002は設定次第）
- ここが `25565->25565` になっているなら、クライアントは `:25565` に繋ぐ必要があります

### 1-2) “Connection refused” の意味

`Connection refused` は「そのポートに到達したが、受け手がlistenしていない」状態です。

よくある原因:
- `mc-prod` がまだ起動中（Forge+MODは数分かかることがあります）
- MODのクラッシュでサーバープロセスが落ちている
- `server.properties` 等でポート/バインドが変わっている（稀）

### 1-3) “起動完了したか” はログで判断する

```bash
docker logs -f mc-prod
```

起動完了の目安（例）:
- `Done (` が出る
- `For help, type "help"` が出る

`Done (` が出ていない状態で接続を試すと、タイミングによっては `Connection refused` になります。

---

## 2. /start で `No such image: itzg/minecraft-server:latest`

### 症状

Discordで `/start` すると、`No such image` で失敗する。

### 背景知識

Dockerは **イメージがローカルに無いとコンテナを作れません**。
通常 `docker run` は自動pullしますが、Docker API を直接叩く場合は明示的に pull が必要なことがあります。

### 対処

このBotは「イメージが無ければpull」するよう実装済みです。
それでも起きる場合は、ホスト側で手動pullして確認してください。

```bash
docker pull itzg/minecraft-server:latest
```

---

## 3. Javaのバージョン不一致でクラッシュする（`NoSuchMethodError ... Unsafe.ensureClassInitialized`）

### 症状

ログに以下のようなエラーが出てサーバーが起動完了しない:

- `java.lang.NoSuchMethodError: 'void sun.misc.Unsafe.ensureClassInitialized(java.lang.Class)'`
- Cobblemon Showdown / GraalVM 系が絡んでいる

### 背景知識（なぜ起きるか）

- Minecraft/Forge/MODは **対応Javaバージョンが強く影響**します
- `itzg/minecraft-server:latest` はタグが同じでも中のJavaが更新されることがあります
- MOD側が想定していないJavaだと、クラス/ネイティブ周りで起動時クラッシュします

### 対処（推奨）

Bot設定 `config/bot.env` でイメージを固定します。

例:
```env
MC_IMAGE=itzg/minecraft-server:java17
```

「latestで動いていたのに急に壊れた」は **中身のJava更新**が原因のことが多いので、
運用では `java17` のように **タグを固定**するのが安全です。

---

## 4. メモリ不足（`OutOfMemoryError: Java heap space`）

### 症状

クライアント接続時に:
- `Internal Exception: io.netty.handler.codec.EncoderException: java.lang.OutOfMemoryError: Java heap space`

またはサーバーログに `OutOfMemoryError` が出る。

### 背景知識（MEMORYの意味）

`server.env` の `MEMORY=...` は、主に **Javaヒープ(-Xmx)の設定**です。
しかし、コンテナが使うメモリはヒープだけではありません。

ヒープ以外の例:
- Metaspace / CodeCache（クラスやJIT）
- スレッドスタック（MODが多いほど増えがち）
- Direct memory（Netty等のオフヒープ）
- ネイティブライブラリ
- さらに、状況によってはページキャッシュも見かけ上増えます

そのため `MEMORY=24G` でも `docker stats` で `26GiB` になることがあります。

### 対処

`server.env` に `MEMORY` を設定し、`/stop` → `/start` で反映します。

例（32GBホストの目安）:
```env
MEMORY=14G
USE_AIKAR_FLAGS=true
```

チェック:
```bash
free -h
docker stats --no-stream mc-prod
```

目安:
- `available` が数GBまで落ちると、他プロセスや一時的な増加で落ちやすい
- 安定する `MEMORY` は **MOD構成と同時接続数**で変わるので、増減させて決める

---

## 5. `mc-prod (unhealthy)` について

### 症状

`docker ps` で `(unhealthy)` や `(health: starting)` と出る。

### 背景知識

Dockerの healthcheck は「プロセスが起動したか」より厳しく、
**アプリが応答できる状態になったか**を見ます。
Forge+大量MODでは起動に時間がかかるため、しばらく `starting` のままでも不自然ではありません。

ただし、ずっと `unhealthy` のままなら起動失敗・クラッシュを疑い、ログを確認します。

```bash
docker logs --tail 200 mc-prod
```

---

## 6. `server.env` / `bot.env` の“書き間違い”が致命傷になる

### ありがちな例

- `EULA=TRUE` のキー名を間違える（例: `EURA=TRUE`）
- `RCON_PASSWORD` のキー名を間違える（例: `RCPM_PASSWORD=...`）
- `MC_HOST_PORT` に `30002/tcp` のような表記を混ぜる（数字のみ推奨）

### 自力で見つけるコツ

- `docker logs mc-prod` に「EULA未同意」等が出ていないか
- `docker exec mc-prod printenv | rg 'EULA|RCON'` で環境変数が入っているか

---

## 7. Composeの落とし穴（env_file と変数置換は別物）

### 症状

`docker compose -f infra/compose.bot.yaml ps` が
- `The "DATA_DIR" variable is not set...`
- `invalid spec: ::ro`
のように落ちる。

### 背景知識

- Composeの `${VAR}` 置換は **“シェル環境変数”** から参照します
- `env_file:` は **コンテナに渡す環境変数**であり、`${VAR}` 置換には使えません

そのため、`infra/compose.bot.yaml` を使うときは `BOT_ENV_FILE` と `DATA_DIR` を **シェル環境変数として export** してから実行します。

```bash
export BOT_ENV_FILE=/opt/homeserver-gameserver-1/config/bot.env
export DATA_DIR=/opt/homeserver-gameserver-1/data
docker compose -f infra/compose.bot.yaml up -d --build --force-recreate
```

---

## 8. “最終的に自力で直せる” ためのチェックリスト

1. **ポート**: `docker ps` の `Ports` が想定どおりか（`30002->25565`）
2. **起動完了**: `docker logs -f mc-prod` に `Done (` が出たか
3. **Java**: MODが重い場合は `MC_IMAGE=...:java17` に固定しているか
4. **メモリ**: `OutOfMemoryError` が出ていないか、`free -h` の `available` を潰していないか
5. **env typo**: `server.env` のキー名ミスが無いか（EULA/RCON/MEMORY）

