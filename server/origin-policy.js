function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  if (!Array.isArray(allowedOrigins)) return false;
  return allowedOrigins.includes(origin);
}

module.exports = { isAllowedOrigin };
