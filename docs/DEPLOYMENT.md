# Deployment Notes

## DNS

Create `A` records for both domains pointing to the server public IP:

```text
iotup.digitalpalm.ai    A    <server-ip>
iotdown.digitalpalm.ai  A    <server-ip>
```

Both IoT domains point to the same standalone IoT API service. The API uses its own MongoDB database named `iot_tracker`; do not proxy these hostnames to AgriIntel and do not use the AgriIntel database.

## Reverse Proxy

Terminate HTTPS at a reverse proxy, then forward to the IoT Node API on local port `3010`.

Example Nginx upstream:

```nginx
upstream plantation_tracker_api {
  server 127.0.0.1:3010;
}

server {
  listen 443 ssl;
  server_name iotup.digitalpalm.ai iotdown.digitalpalm.ai;

  client_max_body_size 16k;

  location / {
    proxy_pass http://plantation_tracker_api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Use Certbot, your cloud load balancer, or your hosting provider to issue certificates for both domains.

## Fix SSL Certificate For IoT Domains

The API is reachable on both IoT domains, but the certificate must include both hostnames:

```text
iotup.digitalpalm.ai
iotdown.digitalpalm.ai
```

On the Nginx server, run this for the IoT domains:

```bash
sudo certbot --nginx \
  -d iotup.digitalpalm.ai \
  -d iotdown.digitalpalm.ai
```

Then verify:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://iotup.digitalpalm.ai/health
curl -I https://iotdown.digitalpalm.ai/health
```

The `curl` checks must pass without `-k` and must not report a certificate hostname mismatch.

## Production Checklist

- Set a strong `ADMIN_API_TOKEN`.
- Keep device tokens private; send each hardware team only the token for its own device.
- Run `pnpm run seed` once with device token environment variables set.
- Confirm `GET /health` returns `mongodb: connected`.
- Give hardware teams only the four device endpoint URLs in `docs/API_CONTRACT.md`.
