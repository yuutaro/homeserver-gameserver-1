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
    service_name = event["service_name"]  # service_nameを受け取る
    interaction_token = event["interaction_token"]
    game_name = event["game_name"]
    ddns_address = event.get("ddns_address")

    ec2 = boto3.client("ec2")
    ssm = boto3.client("ssm")  # SSMクライアントを追加

    try:
        response = ec2.describe_instances(InstanceIds=[instance_id])
        instance = response["Reservations"][0]["Instances"][0]
        state = instance["State"]["Name"]

        if state == "stopped":
            # 1. EC2を起動
            send_followup_message(
                interaction_token,
                f"🚀 サーバー `{game_name}` のEC2インスタンスを起動中...",
            )
            ec2.start_instances(InstanceIds=[instance_id])

            # 2. EC2がRunningになるまで待機
            waiter = ec2.get_waiter("instance_running")
            waiter.wait(InstanceIds=[instance_id])

            # 3. RunningになってもSSMが準備できるまで少しラグがあるため待機
            # (System Manager Agentが立ち上がるのを待つ)
            time.sleep(15)

            # 4. ゲームプロセスを起動 (systemctl start)
            send_followup_message(
                interaction_token,
                f"🎮 EC2が起動しました。ゲームサービス `{service_name}` を開始しています...",
            )

            command = f"sudo systemctl start {service_name}"
            ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={"commands": [command]},
            )

            # ※ここで systemctl is-active をループ監視して「完全に起動しました」と出すことも可能ですが、
            # Minecraftは起動に時間がかかるため、とりあえず「コマンドは送った」状態でIPを返します。

            # IP取得
            response = ec2.describe_instances(InstanceIds=[instance_id])
            instance = response["Reservations"][0]["Instances"][0]
            public_ip = instance.get("PublicIpAddress", "取得できませんでした")

            # DDNSアドレスがあればそれも表示する
            address_info = f"接続先IPアドレス:\n```\n{public_ip}\n```"
            if ddns_address:
                address_info += f"\n接続先アドレス (DDNS):\n```\n{ddns_address}\n```\n"

            message = (
                f"🎉 **サーバー `{game_name}` の起動コマンドを送信しました！**\n"
                f"実際に遊べるようになるまで2〜3分かかります。\n"
                f"{address_info}\n"
            )
            send_followup_message(interaction_token, message)

        elif state == "running":
            # 既に起動している場合でも、念のためプロセス起動コマンドを送っておくと親切（落ちている場合に復帰できる）
            command = f"sudo systemctl start {service_name}"
            ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={"commands": [command]},
            )

            public_ip = instance.get("PublicIpAddress", "取得できませんでした")

            # DDNSアドレスがあればそれも表示する
            address_info = f"接続先IPアドレス:\n```\n{public_ip}\n```"
            if ddns_address:
                address_info += f"\n接続先アドレス (DDNS):\n```\n{ddns_address}\n```"

            message = (
                f"✅ **サーバー `{game_name}` は既に起動しています。**\n"
                f"(念のためサービス起動コマンドを送信しました)\n"
                f"{address_info}\n"
            )
            send_followup_message(interaction_token, message)

        elif state in ["pending", "stopping"]:
            send_followup_message(
                interaction_token,
                f"🟡 サーバー `{game_name}` は現在、別の処理中です (`{state}`) 。",
            )
        else:
            send_followup_message(
                interaction_token,
                f"❔ サーバー `{game_name}` は不明な状態 (`{state}`) のため、起動できません。",
            )

        return {"statusCode": 200}
    except Exception as e:
        print(f"Error: {e}")
        error_message = f"❌ サーバー `{game_name}` の起動処理中に予期せぬエラーが発生しました。\n`{str(e)}`"
        send_followup_message(interaction_token, error_message)
        return {"statusCode": 500}

