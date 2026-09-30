# Create Aeronauticsサーバー

プロファイルID: `mc-create-aeronautics`。共通実行スロット `gameserver-prod` を使用するため、他のゲームサーバーとは同時起動しません。

Minecraft 1.21.1 / NeoForge 21.1.252 / Java 21、`itzg/minecraft-server:java21`。GPU不要。メモリ16GB、視野距離12、シミュレーション距離8。接続先は既存Minecraftホストの `30002/TCP`。

## 固定Mod

| Mod | バージョン | Modrinth version ID |
| --- | --- | --- |
| Create | 6.0.10 | UjX6dr61 |
| Create Aeronautics bundled | 1.3.2 | 44pLdPGg |
| Sable | 2.0.5 | U678xqle |
| Tectonic | 3.0.28 | n4iyW7aB |
| Terralith | 2.6.2 | IY93YaEe |
| Lithostitched | 1.8.0 | sPmtDq1X |
| Chunky | 1.4.23 | LuFhm4eU |
| FerriteCore | 7.0.3 | x7kQWVju |
| spark | 1.10.124 | v5qtqRQi |

ModrinthのSHA-512と照合してJARを配置済み。Aeronautics bundledにはSimulated・Aeronautics・Offroadが含まれます。標準Createの列車・駅・信号・スケジュールを使用します。

ワールドは `create-aeronautics-world`。地形Modは初回生成前に導入済み。既存ワールドからTerralith・Tectonicを削除しないでください。

## クライアント

`data/mc-create-aeronautics/client.mrpack` をModrinth AppまたはPrism Launcherにインポートします。Java 21を使用し、クライアントメモリはまず6～8GB。

Create・Aeronautics・Sableをサーバーと同じバージョンに固定し、FerriteCore・JEI・Xaero's Minimap・World Mapも同梱設定済み。Distant Horizonsは任意です。Tectonic・Terralith・Lithostitchedはサーバー側で生成するため、クライアントには不要です。

SableはSodiumの古い版やScalableLuxとの競合を宣言しています。初期パックにはSodium・Iris・物理破壊アドオンを含めません。

## 通信

既存BotはMinecraftのTCPポートのみを公開するため、Sableの `config/sable-common.toml` の `disable_udp_pipeline=true` を設定しています。物理状態をTCPで送る互換モードです。UDPより物理構造物の通信遅延が大きくなる可能性があります。

UDPを利用する場合は、Botのコンテナ生成処理で `30002/udp -> 25565/udp` を公開し、ルーター側のUDP転送も設定したうえで、この設定を戻します。

## 操作

Discord: `/start server:mc-create-aeronautics`。通常の `/stop`・`/status`・`/rcon` が使用できます。

Chunkyで範囲を拡大する例（プレイヤー不在時）:

```text
chunky world minecraft:overworld
chunky shape circle
chunky spawn
chunky radius 2000
chunky start
chunky progress
```

初期作成時にスポーン中心・円形・半径1,000ブロックの事前生成を開始しています。停止前は `chunky pause`、再開は `chunky continue`。プレイ中の大量事前生成はCPUを消費します。

初期バックアップは `data/mc-create-aeronautics/backups/initial-world-20261001.tar.gz`。事前生成途中に一時停止し、サーバーを停止して保存しています。

バックアップはサーバーを停止して、ワールド・`config`・`.sable` をまとめて保存します。物理構造物を保存するワールド全体を対象とし、更新前には必ず保存してください。自動定期バックアップは未設定です。
