# MongoDB Schema

The source PDF includes SQL definitions for `device`, `zone`, `countrecord`, and `assignment`. It references `assignmentpoint` and `harvestrecord` but the visible/extractable PDF pages do not include their SQL table definitions, so those two shapes are inferred from the API payloads.

## devices

```js
{
  deviceId: "CNT00002",
  token: "shared-secret",
  role: "count", // count | harvest
  lastSeen: 1786006800,
  battery: 84,
  firmware: "1.0.0",
  seq: 150
}
```

Indexes:

- Unique `deviceId`.

## count_records

```js
{
  deviceId: "CNT00002",
  localId: 10001,
  lat: 24567123,
  lon: 1021178123,
  ts: 1786003200,
  battery: 84,
  receivedAt: 1786006800,
  zoneId: 12
}
```

Indexes:

- Unique compound `{ deviceId: 1, localId: 1 }`.
- `{ deviceId: 1 }`.
- `{ zoneId: 1 }`.

## zones

```js
{
  zoneId: 12,
  name: "Sector B",
  description: "",
  createdAt: 1786000000
}
```

Indexes:

- Unique `zoneId`.

## assignments

Assignment points are embedded because they are downloaded together as one device work packet.

```js
{
  assignmentId: 501,
  zoneId: 12,
  harvesterDeviceId: "HRV00002",
  sectorName: "Sector B",
  generatedAt: 1786003000,
  ackedAt: 1786004000,
  active: true,
  createdAt: 1786003000,
  points: [
    {
      pointId: 10001,
      lat: 24567123,
      lon: 1021178123,
      countRecordId: ObjectId("...")
    }
  ]
}
```

Indexes:

- Unique `assignmentId`.
- `{ harvesterDeviceId: 1, active: 1, generatedAt: -1 }`.

## harvest_records

```js
{
  deviceId: "HRV00002",
  assignmentId: 501,
  pointId: 10001,
  lat: 24567120,
  lon: 1021178125,
  ts: 1786010000,
  receivedAt: 1786010200
}
```

Indexes:

- Unique compound `{ deviceId: 1, assignmentId: 1, pointId: 1 }`.

This dedupe key is inferred because the PDF harvest upload payload has no separate local result id.
