#!/usr/bin/env python3
"""钉钉机器人 Webhook 消息推送"""
import json
import os
import urllib.request

def main():
    input_path = os.environ.get('SKILL_INPUT', 'input.json')
    output_path = 'output.json'
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        inp = data.get('input') or {}
        access_token = inp.get('access_token', '')
        url = f'https://oapi.dingtalk.com/robot/send?access_token={access_token}'
        content = inp.get('content', '')
        msgtype = inp.get('msgtype', 'text')
        body = {'msgtype': msgtype, msgtype: {'content': content}}
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({'errcode': -1, 'errmsg': str(e)}, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
