# Device API Contract

## Shared Rules

- HTTPS only in production.
- JSON UTF-8 only.
- Maximum request body size is 16 KB.
- Maximum `records` array length is 200.
- Device authentication uses `X-Device-ID` and `X-API-Token`.
- Timestamps are UTC unix seconds.
- GPS coordinates are E7 integers.

## Upload Count Records

```text
POST https://iotup.digitalpalm.ai/api/v1/count/upload
```

```json
{
  "fw": "1.0.0",
  "seq": 150,
  "battery": 84,
  "records": [
    {
      "id": 10001,
      "lat": 24567123,
      "lon": 1021178123,
      "ts": 1786003200
    }
  ]
}
```

Success:

```json
{
  "success": true,
  "data": {
    "received": 1,
    "duplicates": 0,
    "server_time": 1786006800,
    "next_upload": 3600
  }
}
```

## Download Harvest Assignment

```text
POST https://iotdown.digitalpalm.ai/api/v1/harvest/download
```

```json
{
  "fw": "1.0.0"
}
```

Success:

```json
{
  "success": true,
  "data": {
    "assignment_id": 501,
    "sector_id": 12,
    "sector_name": "Sector B",
    "generated_at": 1786003000,
    "points": [
      {
        "id": 10001,
        "lat": 24567123,
        "lon": 1021178123
      }
    ]
  }
}
```

## Acknowledge Download

```text
POST https://iotdown.digitalpalm.ai/api/v1/harvest/download/ack
```

```json
{
  "assignment_id": 501
}
```

Success:

```json
{
  "success": true
}
```

## Upload Harvest Results

```text
POST https://iotup.digitalpalm.ai/api/v1/harvest/upload
```

```json
{
  "assignment_id": 501,
  "records": [
    {
      "point_id": 10001,
      "lat": 24567120,
      "lon": 1021178125,
      "ts": 1786010000
    }
  ]
}
```

Success:

```json
{
  "success": true,
  "data": {
    "received": 1,
    "duplicates": 0,
    "server_time": 1786010200
  }
}
```
