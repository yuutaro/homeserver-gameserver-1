import json
import os
import boto3
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

# Environment variables
PUBLIC_KEY = os.environ["DISCORD_PUBLIC_KEY"]
SSM_PARAMETER_PATH_PREFIX = os.environ["SSM_PARAMETER_PATH_PREFIX"]

# Worker Lambda function names
START_LAMBDA_NAME = os.environ["START_LAMBDA_NAME"]
STOP_LAMBDA_NAME = os.environ["STOP_LAMBDA_NAME"]
STATUS_LAMBDA_NAME = os.environ["STATUS_LAMBDA_NAME"]

verify_key = VerifyKey(bytes.fromhex(PUBLIC_KEY))
lambda_client = boto3.client("lambda")
ssm_client = boto3.client("ssm")


def get_server_config(game_name):
    """SSM Parameter Storeからサーバー設定を取得する"""
    try:
        path = f"{SSM_PARAMETER_PATH_PREFIX}/{game_name}/"
        response = ssm_client.get_parameters_by_path(Path=path, Recursive=False)

        config = {}
        for param in response["Parameters"]:
            key = param["Name"].split("/")[-1]  # instance_id or service_name
            config[key] = param["Value"]

        # 必須パラメータのチェック (ddns_addressは任意なのでここには含めない)
        if "instance_id" not in config or "service_name" not in config:
            return None, f"設定が不完全です。`instance_id`と`service_name`が必要です。"

        return config, None
    except Exception as e:
        print(f"Error getting config for {game_name}: {e}")
        return None, f"サーバー `{game_name}` の設定取得に失敗しました。"


def lambda_handler(event, context):
    try:
        headers = {k.lower(): v for k, v in event["headers"].items()}
        signature = headers.get("x-signature-ed25519")
        timestamp = headers.get("x-signature-timestamp")
        body = event.get("body")

        verify_key.verify(f"{timestamp}{body}".encode(), bytes.fromhex(signature))
        body_dict = json.loads(body)

        if body_dict.get("type") == 1:  # PING-PONG
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"type": 1}),
            }

        if body_dict.get("type") == 2:  # SLASH COMMAND
            interaction_token = body_dict["token"]

            # コマンドとゲーム名を取得
            action = body_dict["data"]["name"]  # "start", "stop", "status"
            game_name = body_dict["data"]["options"][0][
                "value"
            ]  # "mc-forge-1-12-2" etc.

            # ゲームサーバーの設定を取得
            config, error = get_server_config(game_name)
            if error:
                # 設定取得に失敗したらエラーメッセージを返す
                return {
                    "statusCode": 200,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"type": 4, "data": {"content": f"❌ {error}"}}),
                }

            # ワーカーに渡すペイロードを定義
            payload = {
                "interaction_token": interaction_token,
                "instance_id": config["instance_id"],
                "service_name": config["service_name"],
                "game_name": game_name,
                "ddns_address": config.get("ddns_address", None),
            }

            # アクションに応じて適切なワーカーを呼び出し
            if action == "start":
                lambda_client.invoke(
                    FunctionName=START_LAMBDA_NAME,
                    InvocationType="Event",
                    Payload=json.dumps(payload),
                )
            elif action == "stop":
                lambda_client.invoke(
                    FunctionName=STOP_LAMBDA_NAME,
                    InvocationType="Event",
                    Payload=json.dumps(payload),
                )
            elif action == "status":
                lambda_client.invoke(
                    FunctionName=STATUS_LAMBDA_NAME,
                    InvocationType="Event",
                    Payload=json.dumps(payload),
                )

            # Discordに「処理中...」と即時応答
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"type": 5}),
            }

    except (BadSignatureError, KeyError, Exception) as e:
        print(f"Error: {e}")
        return {"statusCode": 401, "body": "Invalid request signature"}

    return {"statusCode": 404, "body": "Not Found"}
