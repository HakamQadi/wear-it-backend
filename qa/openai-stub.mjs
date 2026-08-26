/**
 * Minimal stand-in for the OpenAI Images API so the end-to-end suite can exercise
 * the full look-generation path without spending real credits.
 * Point the backend at it with OPENAI_BASE_URL=http://127.0.0.1:4999/v1
 */
import { createServer } from 'http';

const PORT = Number(process.env.STUB_PORT || 4999);
// 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let failuresRemaining = 0;
let lastImageParts = 0;

createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const url = request.url || '';

    if (url.startsWith('/__fail')) {
      // The OpenAI SDK retries 5xx responses, so arm enough failures to outlast every retry.
      failuresRemaining = 6;
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end('{"armed":true}');
    }

    // Fixtures for the image-import checks: a real PNG, something that only claims to be
    // one, and redirects to a good and a forbidden destination.
    if (url.startsWith('/__image.png')) {
      const png = Buffer.from(PNG_BASE64, 'base64');
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
      return response.end(png);
    }

    if (url.startsWith('/__notimage')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      return response.end('<html>not an image</html>');
    }

    if (url.startsWith('/__redirect-internal')) {
      response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      return response.end();
    }

    if (url.startsWith('/__redirect')) {
      response.writeHead(302, { location: '/__image.png' });
      return response.end();
    }

    if (url.startsWith('/__parts')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ lastImageParts }));
    }

    if (url.startsWith('/__ok')) {
      failuresRemaining = 0;
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end('{"armed":false}');
    }

    if (url.includes('/images/edits')) {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        response.writeHead(500, { 'content-type': 'application/json' });
        return response.end(JSON.stringify({ error: { message: 'stubbed image failure' } }));
      }
      const body = Buffer.concat(chunks).toString('latin1');
      // Counts how many image files the SDK actually serialised into the multipart body.
      lastImageParts = (body.match(/name="image\[\]"/g) || []).length || (body.match(/name="image"/g) || []).length;
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ created: 1, data: [{ b64_json: PNG_BASE64 }] }));
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":{"message":"stub: unhandled route"}}');
  });
}).listen(PORT, '127.0.0.1', () => console.log(`openai stub listening on ${PORT}`));
