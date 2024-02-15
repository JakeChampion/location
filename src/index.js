/// <reference types="@fastly/js-compute" />

import { SecretStore } from "fastly:secret-store";
import { createFanoutHandoff } from "fastly:fanout";
import { env } from 'fastly:env';
import { Hono } from 'hono'
import { logger } from 'hono/logger'

import { includeBytes } from "fastly:experimental";

const page = includeBytes('./src/index.html')
const client = includeBytes('./src/client.js')

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

const app = new Hono()
app.onError((error, c) => {
  console.error('Internal App Error:', error, error.stack, error.message);
  return c.text('Internal Server Error', 500)
});
app.use('*', logger());
app.use('*', async (c, next) => {
  const FASTLY_SERVICE_VERSION = env('FASTLY_SERVICE_VERSION');
  console.log('FASTLY_SERVICE_VERSION', FASTLY_SERVICE_VERSION);
  await next();
  c.header('FASTLY_SERVICE_VERSION', FASTLY_SERVICE_VERSION);
  c.header("x-compress-hint", "on");
});

app.get('/', () => {
  return new Response(page, {
    headers: {
      "content-type": "text/html;charset=utf-8"
    }
  })
})

app.get('/client.js', () => {
  return new Response(client, {
    headers: {
      "content-type": "application/javascript;charset=utf-8"
    }
  })
})

const geolocation_marker = includeBytes('./src/geolocation_marker.png')
app.get('/geolocation_marker.png', () => {
  return new Response(geolocation_marker, {
    headers: {
      "content-type": "image/png"
    }
  })
})
const geolocation_marker_heading = includeBytes('./src/geolocation_marker_heading.png')
app.get('/geolocation_marker_heading.png', () => {
  return new Response(geolocation_marker_heading, {
    headers: {
      "content-type": "image/png"
    }
  })
})

async function publish(channel, event, data) {
  const store = new SecretStore('loc');
  const key = await store.get('fastly-token').then(a => a.plaintext())
  const content = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return fetch(`https://api.fastly.com/service/${env('FASTLY_SERVICE_ID')}/publish/`, {
    backend: 'fastly',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      "Fastly-Key": key
    },
    body: JSON.stringify({ "items": [{ channel, "formats": { "http-stream": { content } } }] })
  })
}

app.post('/update', async (c) => {
  const {channel, iv, encrypted} = await c.req.json()
  return await publish(channel, 'update', { iv, encrypted })
})
app.get('/stream/sse', c => {
  const channel = c.req.query('channel')
  // Request is from Fanout
  if (c.req.header('Grip-Sig')) {
    // Needed so that Firefox emits the 'open' event for the EventSource
    c.executionCtx.waitUntil(sleep(10).then(() => publish(channel, 'ping', {})))
    return grip_response("text/event-stream", "stream", channel)
  } else {
    // Not from Fanout, hand it off to Fanout to manage
    return createFanoutHandoff(c.executionCtx.request, 'self');
  }
})

function grip_response(contentType, gripHold, channel) {
  return new Response(null, {
    headers: {
      "Content-Type": contentType,
      "Grip-Hold": gripHold,
      "Grip-Channel": channel,
    }
  })
}

app.fire()
