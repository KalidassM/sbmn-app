// English -> Tamil for the sign-off of Tamil WhatsApp messages. Uses Google's public transliteration
// (names) and translation (designations) endpoints; results are cached, and any failure returns null
// so the caller falls back to the English text.
const cache = new Map();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  let value = null;
  try {
    value = (await fn()) || null;
  } catch (err) {
    console.error('Tamil conversion failed:', err.message);
  }
  if (value) cache.set(key, value);
  return value;
}

// Sound-alike spelling in Tamil script, e.g. "Kalidass Murugesan" -> "காளிதாஸ் முருகேசன்"
function transliterate(text) {
  return cached(`n:${text}`, async () => {
    const data = await getJson(
      `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=ta-t-i0-und&num=1&ie=utf-8&oe=utf-8&app=demopage`
    );
    return data?.[0] === 'SUCCESS' ? data[1]?.[0]?.[1]?.[0] : null;
  });
}

// Common association designations, where a generic translation picks the wrong sense
// (e.g. "Vice President" comes out as the national office).
const DESIGNATIONS = {
  president: 'தலைவர்',
  'vice president': 'துணைத் தலைவர்',
  'vice-president': 'துணைத் தலைவர்',
  secretary: 'செயலாளர்',
  'joint secretary': 'இணைச் செயலாளர்',
  treasurer: 'பொருளாளர்',
  'joint treasurer': 'இணைப் பொருளாளர்',
  'executive member': 'செயற்குழு உறுப்பினர்',
  'committee member': 'குழு உறுப்பினர்',
  advisor: 'ஆலோசகர்',
  patron: 'புரவலர்',
};

// Meaning-based translation, e.g. "Joint Secretary" -> "இணைச் செயலாளர்"
function translate(text) {
  const known = DESIGNATIONS[text.trim().toLowerCase()];
  if (known) return Promise.resolve(known);
  return cached(`d:${text}`, async () => {
    const data = await getJson(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ta&dt=t&q=${encodeURIComponent(text)}`
    );
    return data?.[0]?.map((s) => s[0]).join('') || null;
  });
}

module.exports = { transliterate, translate };
