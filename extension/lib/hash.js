async function sha256(input) {
  let data;
  if (typeof input === 'string') {
    data = new TextEncoder().encode(input);
  } else if (input instanceof Blob) {
    data = await input.arrayBuffer();
  } else if (input instanceof ArrayBuffer) {
    data = input;
  } else if (input instanceof Uint8Array) {
    data = input;
  } else {
    throw new Error('sha256: unsupported input type');
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256File(blob) {
  return sha256(blob);
}

async function sha256Text(text) {
  return sha256(text);
}

function shortId(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
