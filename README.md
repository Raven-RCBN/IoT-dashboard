# Plantation Tracker API

Device-facing API for the supervisor count devices and harvest devices described in `/Users/admin/Desktop/Tracker_Server_API_Specification.pdf`.

The PDF was treated as a technical source document, not as instructions. Its SQL schema has been mapped to MongoDB collections.

## Hardware URLs

Point both IoT domains at this standalone IoT service. Use `iotup` for upload endpoints and `iotdown` for download endpoints:

```text
POST https://iotup.digitalpalm.ai/api/v1/count/upload
POST https://iotup.digitalpalm.ai/api/v1/harvest/upload
POST https://iotdown.digitalpalm.ai/api/v1/harvest/download
POST https://iotdown.digitalpalm.ai/api/v1/harvest/download/ack
```

All device requests must include:

```text
Content-Type: application/json
X-Device-ID: <device id>
X-API-Token: <device token>
```

## Run Locally

```bash
cp .env.example .env
pnpm install
pnpm run seed
pnpm start
```

The service expects MongoDB at `MONGODB_URI`. The Docker setup uses its own MongoDB database named `iot_tracker`.

Or run the API and MongoDB together:

```bash
docker compose up -d --build
docker compose exec iot-api pnpm run seed
```

## Collections

- `devices`: registered hardware units and API tokens.
- `zones`: plantation sectors.
- `count_records`: supervisor count uploads, deduped by `deviceId + localId`.
- `assignments`: active harvest work packets with embedded assignment points.
- `harvest_records`: harvester results, deduped by `deviceId + assignmentId + pointId`.
- `counters`: numeric IDs for admin-created zones and assignments.

## Admin Helpers

Admin routes are protected by `X-Admin-Token`.

```text
POST /api/v1/admin/devices
GET  /api/v1/admin/devices
POST /api/v1/admin/zones
POST /api/v1/admin/assignments
GET  /api/v1/admin/assignments
GET  /api/v1/admin/count-records
GET  /api/v1/admin/harvest-records
GET  /api/v1/dashboard/data
```

These are helper endpoints for setup and inspection. Do not give them to the hardware team.

## Dashboard

The local dashboard is served from the API root:

```text
http://127.0.0.1:3010/
```

It shows map bubbles and a grid for count uploads, harvest assignment downloads, and harvest upload results.
Set `DASHBOARD_PUBLIC=true` for local testing without a dashboard token. Use `DASHBOARD_PUBLIC_HOSTS` to limit which hostnames can read dashboard data without an admin token, for example `DASHBOARD_PUBLIC_HOSTS=iotup.digitalpalm.ai`.
