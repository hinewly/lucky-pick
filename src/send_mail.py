#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
send_mail.py —— 零依赖邮件发送脚本（供自动化调用，不经过任何 WorkBuddy 连接器）

背景：WorkBuddy 自动化在无人值守运行时，调度器会检查「依赖的数据源（连接器）」，
      凡 prompt 里调用 MCP 连接器工具（如 agent-mail / netease-mail）的任务会被
      直接终止，报「连接器均未连接成功」。本脚本改用标准库 smtplib 直连邮箱 SMTP，
      凭据读本地配置文件，从而让自动化彻底不依赖在线连接器。

用法：
    python3 send_mail.py --to a@b.com --subject "主题" --body "正文"
    python3 send_mail.py --to a@b.com --subject "主题" --body-file ./mail.txt
    python3 send_mail.py --check          # 只检查凭据与 SMTP 连通性，不发信

输出：固定 JSON 到 stdout：{"success": true} 或 {"success": false, "message": "..."}

凭据来源（按优先级）：
    1. 环境变量 MAIL_USER / MAIL_PASS
    2. ~/.workbuddy/mail_cred.json   {"user": "...", "pass": "..."}
    3. 脚本同目录 .mail_config.json  {"user": "...", "pass": "..."}
"""

import argparse
import json
import os
import smtplib
import ssl
import sys
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

# 常见邮箱 SMTP 配置：(host, port, ssl?)
SMTP_PRESETS = {
    "163.com": ("smtp.163.com", 465, True),
    "126.com": ("smtp.126.com", 465, True),
    "yeah.net": ("smtp.yeah.net", 465, True),
    "188.com": ("smtp.188.com", 465, True),
    "vip.163.com": ("smtp.vip.163.com", 465, True),
    "qq.com": ("smtp.qq.com", 465, True),
    "foxmail.com": ("smtp.qq.com", 465, True),
    "gmail.com": ("smtp.gmail.com", 465, True),
    "outlook.com": ("smtp.office365.com", 587, False),
    "hotmail.com": ("smtp.office365.com", 587, False),
    "sina.com": ("smtp.sina.com", 465, True),
    "sohu.com": ("smtp.sohu.com", 465, True),
    "aliyun.com": ("smtp.aliyun.com", 465, True),
    "139.com": ("smtp.139.com", 465, True),
}
DEFAULT_SMTP = ("smtp.163.com", 465, True)


def out(success, message=""):
    print(json.dumps({"success": success, "message": message}, ensure_ascii=False))
    sys.exit(0 if success else 1)


def load_cred():
    user = os.environ.get("MAIL_USER", "").strip()
    pwd = os.environ.get("MAIL_PASS", "").strip()
    if user and pwd:
        return user, pwd, "env"

    candidates = [
        os.path.expanduser("~/.workbuddy/mail_cred.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".mail_config.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                cfg = json.load(open(path, encoding="utf-8"))
                u = str(cfg.get("user", "")).strip()
                p = str(cfg.get("pass", "")).strip()
                if u and p:
                    return u, p, path
            except Exception as e:
                out(False, "凭据文件解析失败 %s: %s" % (path, e))
    out(False, "未找到邮箱凭据。请在 ~/.workbuddy/mail_cred.json 填入 "
               '{"user":"邮箱地址","pass":"SMTP授权码"}，或设置环境变量 MAIL_USER/MAIL_PASS。')


def resolve_smtp(addr):
    domain = addr.split("@")[-1].lower()
    return SMTP_PRESETS.get(domain, DEFAULT_SMTP)


def send(to, subject, body, cc=None):
    user, pwd, src = load_cred()
    host, port, use_ssl = resolve_smtp(user)

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr(("彩票提醒", user))
    msg["To"] = to
    if cc:
        msg["Cc"] = cc

    recipients = [parseaddr(x)[1] for x in [to] if x]
    if cc:
        recipients += [parseaddr(x)[1] for x in cc.split(",")]

    try:
        if use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as s:
                s.login(user, pwd)
                s.sendmail(user, recipients, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(user, pwd)
                s.sendmail(user, recipients, msg.as_string())
    except smtplib.SMTPAuthenticationError as e:
        out(False, "SMTP 认证失败（授权码可能错误或已失效）：%s" % e)
    except Exception as e:
        out(False, "发信失败（%s:%s）：%s: %s" % (host, port, type(e).__name__, e))

    out(True, "已发送至 %s（发件 %s，凭据来源 %s）" % (", ".join(recipients), user, src))


def check():
    user, pwd, src = load_cred()
    host, port, use_ssl = resolve_smtp(user)
    try:
        if use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
                s.login(user, pwd)
        else:
            with smtplib.SMTP(host, port, timeout=20) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(user, pwd)
    except Exception as e:
        out(False, "连通性检查失败（%s:%s）：%s: %s" % (host, port, type(e).__name__, e))
    out(True, "SMTP 可用：%s@%s:%s（凭据来源 %s）" % (user, host, port, src))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to")
    ap.add_argument("--subject")
    ap.add_argument("--body")
    ap.add_argument("--body-file")
    ap.add_argument("--cc")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    if a.check:
        check()
        return

    if not a.to or not a.subject:
        out(False, "缺少 --to 或 --subject")

    body = a.body
    if a.body_file:
        if not os.path.exists(a.body_file):
            out(False, "正文文件不存在：%s" % a.body_file)
        body = open(a.body_file, encoding="utf-8").read()
    if body is None:
        out(False, "缺少 --body 或 --body-file")

    send(a.to, a.subject, body, a.cc)


if __name__ == "__main__":
    main()
