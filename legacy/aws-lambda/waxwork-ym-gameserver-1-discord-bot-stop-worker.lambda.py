import json
import boto3
import requests
import os
import time


def send_followup_message(interaction_token, content):
    url = f"https://discord.com/api/v10/webhooks/{os.environ['DISCORD_APP_ID']}/{interaction_token}/messages/@original"
    payload = {"content": content}
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.patch(url, data=json.dumps(payload), headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error sending follow-up message: {e}")


def lambda_handler(event, context):
    instance_id = event["instance_id"]
    service_name = event["service_name"]
    interaction_token = event["interaction_token"]
    game_name = event["game_name"]

    ec2 = boto3.client("ec2")
    ssm = boto3.client("ssm")

    try:
        response = ec2.describe_instances(InstanceIds=[instance_id])
        instance = response["Reservations"][0]["Instances"][0]
        state = instance["State"]["Name"]

        if state == "running":
            send_followup_message(
                interaction_token,
                f"✅ 停止リクエスト受信。`{game_name}` のゲームサービスを安全に停止します... (ワールド保存のため数分かかる場合があります)",
            )

            # 1. 停止コマンドを送信
            command = f"sudo systemctl stop {service_name}"
            response = ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={"commands": [command]},
            )
            command_id = response["Command"]["CommandId"]

            # 2. 【重要】コマンド完了（＝セーブ完了）までループ監視
            # 5秒おきに確認、最大60回（約5分）待機
            max_retries = 60
            for _ in range(max_retries):
                time.sleep(5)
                output = ssm.get_command_invocation(
                    CommandId=command_id, InstanceId=instance_id
                )
                status = output["Status"]

                if status == "Success":
                    # 正常に停止完了
                    break
                elif status in ["Failed", "Cancelled", "TimedOut"]:
                    # コマンド自体が失敗した場合
                    error_log = output.get("StandardErrorContent", "No error output")
                    raise Exception(
                        f"サービスの停止コマンドが失敗しました。ステータス: {status}\nログ: {error_log}"
                    )
                # Pending や InProgress の場合はループを継続
            else:
                # forループがbreakされずに終わった場合（タイムアウト）
                raise Exception(
                    "サービスの停止がタイムアウトしました(5分)。保存が終わっていない可能性がありますが、処理を中断します。"
                )

            # 3. EC2を停止
            send_followup_message(
                interaction_token,
                f"✅ セーブ完了を確認しました。`{game_name}` のEC2インスタンスを停止します...",
            )

            ec2.stop_instances(InstanceIds=[instance_id])

            # 完全に停止するまで待機（任意：Lambdaの実行時間に余裕があれば）
            waiter = ec2.get_waiter("instance_stopped")
            waiter.wait(InstanceIds=[instance_id])

            send_followup_message(
                interaction_token,
                f"💤 **サーバー `{game_name}` が完全に停止しました。** お疲れ様でした！",
            )

        elif state == "stopped":
            send_followup_message(
                interaction_token, f"✅ サーバー `{game_name}` は既に停止しています。"
            )
        elif state in ["pending", "stopping"]:
            send_followup_message(
                interaction_token,
                f"🟡 サーバー `{game_name}` は現在、別の処理中です (`{state}`) 。",
            )
        else:
            send_followup_message(
                interaction_token,
                f"❔ サーバー `{game_name}` は不明な状態 (`{state}`) のため、停止できません。",
            )

        return {"statusCode": 200}
    except Exception as e:
        print(f"Error: {e}")
        error_message = f"❌ サーバー `{game_name}` の停止処理中に予期せぬエラーが発生しました。\n`{str(e)}`"
        send_followup_message(interaction_token, error_message)
        return {"statusCode": 500}

