#!/usr/bin/env python3
"""Upload a local file to the droplet via SFTP.

Usage:
  sftp_put.py <local_path> <remote_path>

Reads creds from env DROPLET_IP, DROPLET_USER (default root), DROPLET_PASSWORD.
"""
import os
import sys
import paramiko

ip = os.environ["DROPLET_IP"]
user = os.environ.get("DROPLET_USER", "root")
password = os.environ["DROPLET_PASSWORD"]

local, remote = sys.argv[1], sys.argv[2]

t = paramiko.Transport((ip, 22))
t.connect(username=user, password=password)
sftp = paramiko.SFTPClient.from_transport(t)

size = os.path.getsize(local)
print(f"uploading {local} ({size/1024/1024:.1f} MB) -> {remote}", flush=True)

last_pct = [-1]
def cb(sent, total):
    pct = int(sent / total * 100)
    if pct != last_pct[0] and pct % 10 == 0:
        print(f"  {pct}%", flush=True)
        last_pct[0] = pct

sftp.put(local, remote, callback=cb)
sftp.close()
t.close()
print("done", flush=True)
