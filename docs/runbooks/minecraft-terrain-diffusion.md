# Minecraft Terrain Diffusionサーバー

`mc-neoforge-1-21-1`は共通実行スロット`gameserver-prod`で動作するMinecraft 1.21.1 / NeoForgeサーバーです。

## 固定構成

- Java 21、NeoForge 21.1.233
- Terrain Diffusion NeoForge preview `v2.2.0-neoforge.1` (`d08c048511b6d8301d9e17497bc4851186b1907f`)
- CUDA 12.8、cuDNN 9、ONNX Runtime GPU 1.20.0
- World Scale 2、GPUモデルoffload有効
- YUNG's構造物シリーズ、Chunky 1.4.23
- 接続先は既存Minecraft共通ポート`30002/TCP`

## CUDAイメージ

```bash
docker build -f infra/minecraft-cuda.Dockerfile \
  -t homeserver/minecraft-cuda:java21-cuda12.8-cudnn9 .
```

## Terrain Diffusion jar

タグとcommitを必ず照合してCUDA版をビルドします。

```bash
git clone --depth 1 --branch v2.2.0-neoforge.1 \
  https://github.com/Collin-Budrick/NeoTerrain-Diffusion.git /tmp/neoterrain-diffusion
test "$(git -C /tmp/neoterrain-diffusion rev-parse HEAD)" = d08c048511b6d8301d9e17497bc4851186b1907f
docker run --rm -v /tmp/neoterrain-diffusion:/work -w /work \
  eclipse-temurin:21-jdk ./gradlew clean build -PuseCuda=true --no-daemon
```

生成された`terrain-diffusion-mc-neoforge-2.2.0-neoforge.1-cuda+1.21.1.jar`をプロファイルの`mods/`へ置き、SHA-256を記録します。

## GPUホスト準備

Ubuntu推奨NVIDIAドライバーとNVIDIA Container Toolkitを導入し、Docker runtimeを設定します。ドライバー切替には再起動が必要です。

```bash
sudo apt-get update
sudo apt-get install -y nvidia-driver-595-open curl gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
```

ここではDockerやホストを手動再起動せずに停止します。作業ウィンドウを確保してから`sudo reboot`を実行してください。

再起動後の確認:

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 nvidia-smi
```

## 起動確認

Discordで`/update-server-list`を実行後、`/start server:mc-neoforge-1-21-1`で起動します。初回はTerrain Diffusionモデル約2.5GBを取得します。

ログで次を確認します。

- `Terrain diffusion inference: CUDA`
- Terrain Diffusion、YUNG's、Chunkyのロード成功
- CUDA、依存Mod、モデル検証のエラーがない

CPUへ切り替えて運用しません。CUDAエラー時はサーバーを停止してログを保全します。

## Chunky事前生成

プレイヤー不在時にOverworldと実際のスポーン地点を選び、半径2000ブロックを生成します。

```text
chunky world terrain-diffusion-world
chunky shape square
chunky spawn
chunky radius 2000
chunky start
chunky progress
```

完了前に停止する場合は`chunky pause`を使用します。ワールドを削除せず、次回`chunky continue`で再開します。
