# @emdzej/stm-tunnel

Small Node CLI that bridges a local serial port to a WebSocket, so browsers without Web Serial (Firefox, Safari, iOS) can talk to the STM web app.

```
stm-tunnel --port /dev/ttyUSB0 --baud 115200
STM_TUNNEL_TOKEN=<secret> stm-tunnel --port COM3 --listen 0.0.0.0:8787 --allowed-origin https://stm.example.com
stm-tunnel --port /dev/ttyACM0 --tls-cert cert.pem --tls-key key.pem
stm-tunnel --exec "bash -i" --clean-env
```

One port per process.

## Security model

- **A token is always required.** If you don't give one (`--token` or the
  `STM_TUNNEL_TOKEN` env var), a random token is generated and printed at
  startup. The web client sends it in the `Sec-WebSocket-Protocol` header, so
  it never appears in URLs or access logs.
- **Origin allowlist.** Browser connections are only accepted from
  `https://stm.emdzej.pl` and `http://localhost:*` / `127.0.0.1:*` /
  `[::1]:*`. Browsers don't apply CORS to WebSockets, so without this any
  website you had open could reach the tunnel. `--allowed-origin` replaces the
  list and can be repeated; `scheme://host:*` matches any port, `*` matches
  anything. Clients that send no `Origin` header (non-browser tools) are
  allowed.
- `--no-auth` is only accepted for loopback binds in `--port` mode.
- `--exec` gives a shell to whoever connects. It always needs a token; add
  `--clean-env` so the child doesn't inherit your credentials.
- Binding a non-loopback address without TLS prints a warning: the token
  travels in cleartext.
- One client at a time. Inbound frames are capped at 1 MiB, the device is
  paused while the client falls behind (backpressure), and clients that miss a
  30 s heartbeat are dropped.
