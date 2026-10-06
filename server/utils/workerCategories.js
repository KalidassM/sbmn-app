// A worker can belong to several categories; they are stored comma-separated in worker_contacts.profession
function splitCategories(value) {
  return (value || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function joinCategories(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const c = (raw || '').toString().replace(/,/g, ' ').trim().slice(0, 60);
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      out.push(c);
    }
  }
  return out.slice(0, 10).join(',');
}

function withCategories(row) {
  return row ? { ...row, categories: splitCategories(row.profession) } : row;
}

module.exports = { splitCategories, joinCategories, withCategories };
