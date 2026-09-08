function isInteger(value) {
  return Number.isInteger(value);
}

function validTimestamp(value) {
  return isInteger(value) && value > 0;
}

function validGpsE7(lat, lon) {
  return (
    isInteger(lat) &&
    isInteger(lon) &&
    lat >= -900000000 &&
    lat <= 900000000 &&
    lon >= -1800000000 &&
    lon <= 1800000000
  );
}

function validRecordsArray(records) {
  return Array.isArray(records) && records.length <= 200;
}

module.exports = { isInteger, validGpsE7, validRecordsArray, validTimestamp };
