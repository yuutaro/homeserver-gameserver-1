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
    ddns_address = event["ddns_address"]

    ec2 = boto3.client("ec2")
    ssm = boto3.client("ssm")

    try:
        response = ec2.describe_instances(InstanceIds=[instance_id])
        if not response.get("Reservations") or not response["Reservations"][0].get(
            "Instances"
        ):
            send_followup_message(
                interaction_token, f"❓ インスタンスが見つかりません。ID: {instance_id}"
            )
            return {"statusCode": 404}

        instance = response["Reservations"][0]["Instances"][0]
        ec2_state = instance["State"]["Name"]

        status_message = f"### サーバー `{game_name}` の状態\n"

        if ec2_state == "running":
            status_message += f"🟢 **インスタンス**: `running` (起動中)\n"
            public_ip = instance.get("PublicIpAddress", "N/A")

            # ゲームサーバーの状態を取得
            command = f"systemctl is-active {service_name}"  # 動的にサービス名を指定
            ssm_response = ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={"commands": [command]},
            )
            command_id = ssm_response["Command"]["CommandId"]

            time.sleep(2)  # SSMコマンドの伝搬を少し待つ
            output = ssm.get_command_invocation(
                CommandId=command_id, InstanceId=instance_id
            )
            while output["Status"] in ["Pending", "InProgress"]:
                time.sleep(1)
                output = ssm.get_command_invocation(
                    CommandId=command_id, InstanceId=instance_id
                )

            if output["Status"] == "Success":
                service_status = output["StandardOutputContent"].strip()
                if service_status == "active":
                    status_message += f"🎮 **ゲームサービス**: `active` (稼働中)\n"
                else:
                    status_message += f"⚠️ **ゲームサービス**: `{service_status}` (停止中またはエラー)\n"
            else:
                status_message += f"❌ **ゲームサービス**: `状態取得失敗`\n"

            status_message += f"接続先IPアドレス:\n```\n{public_ip}\n```"
            if ddns_address:
                status_message += (
                    f"\n接続先アドレス (DDNS):\n```\n{ddns_address}\n```\n"
                )

        elif ec2_state == "stopped":
            status_message += f"🔴 **インスタンス**: `stopped` (停止中)"
        elif ec2_state == "pending":
            status_message += f"🟡 **インスタンス**: `pending` (起動処理中)"
        elif ec2_state == "stopping":
            status_message += f"🟡 **インスタンス**: `stopping` (停止処理中)"
        else:
            status_message += f"❔ **インスタンス**: `{ec2_state}` (不明な状態)"

        send_followup_message(interaction_token, status_message)
        return {"statusCode": 200}

    except Exception as e:
        print(f"Error: {e}")
        error_message = (
            f"❌ `{game_name}` のステータス取得中にエラーが発生しました。\n`{str(e)}`"
        )
        send_followup_message(interaction_token, error_message)
        return {"statusCode": 500}

