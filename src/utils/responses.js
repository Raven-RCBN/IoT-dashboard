function success(res, data, status = 200) {
  if (data === undefined) {
    return res.status(status).json({ success: true });
  }
  return res.status(status).json({ success: true, data });
}

function failure(res, status, error, message) {
  return res.status(status).json({ success: false, error, message });
}

module.exports = { success, failure };
