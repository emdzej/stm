# @emdzej/stm-tunnel

Small Node CLI that bridges a local serial port to a WebSocket, so browsers without Web Serial (Firefox, Safari, iOS) can talk to the STM web app.

```
stm-tunnel --port /dev/ttyUSB0 --baud 115200
stm-tunnel --port COM3 --listen 0.0.0.0:8787 --token <secret> --allowed-origin https://stm.example.com
stm-tunnel --port /dev/ttyACM0 --tls-cert cert.pem --tls-key key.pem
```

One port per process. Non-loopback binds require `--token`.
