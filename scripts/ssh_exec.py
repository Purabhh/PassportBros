#!/usr/bin/env python3
"""Run one or more commands on the droplet over SSH.

Usage:
  ssh_exec.py "command 1" "command 2" ...

Reads droplet creds from env:
  DROPLET_IP, DROPLET_USER (default root), DROPLET_PASSWORD

Each command runs in its own shell; the output is streamed back combined.
Exits non-zero if any command exits non-zero.
"""
import os
import sys
import paramiko

# Force utf-8 output so unicode characters from build tools don't crash us.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ip = os.environ.get("DROPLET_IP", "")
user = os.environ.get("DROPLET_USER", "root")
password = os.environ.get("DROPLET_PASSWORD", "")

if not ip or not password:
    print("DROPLET_IP and DROPLET_PASSWORD must be set", file=sys.stderr)
    sys.exit(2)

commands = sys.argv[1:]
if not commands:
    print("usage: ssh_exec.py <cmd> [<cmd> ...]", file=sys.stderr)
    sys.exit(2)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(ip, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)

failed = 0
for cmd in commands:
    print(f"\n=== $ {cmd}", flush=True)
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=600)
    for line in iter(stdout.readline, ""):
        if not line:
            break
        sys.stdout.write(line)
        sys.stdout.flush()
    err = stderr.read().decode("utf-8", errors="replace")
    if err:
        sys.stderr.write(err)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"=== exit {code}", file=sys.stderr)
        failed = code

client.close()
sys.exit(failed)
