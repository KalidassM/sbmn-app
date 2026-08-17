// Resolves the public URL of this deployment - explicit override, then Railway's own env var,
// then a localhost fallback for local dev.
function baseUrl() {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return 'http://localhost:3000';
}

function portalUrl() {
  return `${baseUrl()}/portal`;
}

module.exports = { baseUrl, portalUrl };
