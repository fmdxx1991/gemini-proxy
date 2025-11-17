// /api/index.js
import express from 'express';
import { Readable } from 'stream';
const app = express();
const TARGET_API_URL = 'https://generativelanguage.googleapis.com';
const TARGET_HOSTNAME = new URL(TARGET_API_URL).hostname;
const TARGET_ORIGIN = new URL(TARGET_API_URL).origin;

// 處理根路徑，返回全屏 iframe
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Status Page</title>
        <style>
            body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
            iframe { width: 100%; height: 100%; border: none; }
        </style>
    </head>
    <body>
        <iframe src="/status"></iframe>
    </body>
    </html>
  `);
});

// 處理 /status 路徑，代理到 https://aistudio.google.com/status
app.all('/status', async (req, res) => {
  const targetUrl = 'https://aistudio.google.com/status';
  console.log(`\n==================== 狀態頁面代理請求 ====================`);
  console.log(`[${new Date().toISOString()}]`);
  console.log(`代理請求: ${req.method} /status`);
  console.log(`轉發目標: ${targetUrl}`);
  
  const headers = { ...req.headers };
  // 設定目標主機的標頭
  headers.host = 'aistudio.google.com';
  headers.origin = 'https://aistudio.google.com';
  headers.referer = 'https://aistudio.google.com';
  
  // 移除 hop-by-hop 標頭
  const hopByHopHeaders = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade'
  ];
  for (const header of hopByHopHeaders) {
    delete headers[header];
  }
  
  try {
    const apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: (req.method !== 'GET' && req.method !== 'HEAD') ? req : undefined,
      duplex: 'half',
    });
    
    // 過濾回應標頭
    const responseHeaders = {};
    for (const [key, value] of apiResponse.headers.entries()) {
      if (!['content-encoding', 'transfer-encoding', 'connection', 'strict-transport-security'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    }
    res.writeHead(apiResponse.status, responseHeaders);
    
    // 流式傳輸回應內容
    if (apiResponse.body) {
      Readable.fromWeb(apiResponse.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(`代理 /status 時發生錯誤:`, error);
    if (!res.headersSent) {
      res.status(502).send('代理伺服器錯誤 (Bad Gateway)');
    }
  }
});

// 通用代理邏輯 for Gemini API
app.all('*', async (req, res) => {
  const targetUrl = `${TARGET_API_URL}${req.url}`;
  
  console.log(`\n==================== 新的代理請求 ====================`);
  console.log(`[${new Date().toISOString()}]`);
  console.log(`代理請求: ${req.method} ${req.url}`);
  console.log(`轉發目標: ${targetUrl}`);
  console.log(`--- 原始請求標頭 (Raw Request Headers) ---`);
  console.log(JSON.stringify(req.headers, null, 2));
  console.log(`------------------------------------------`);
  
  let rawApiKeys = '';
  let apiKeySource = '';
  if (req.headers['x-goog-api-key']) {
    rawApiKeys = req.headers['x-goog-api-key'];
    apiKeySource = 'x-goog';
    console.log('在 x-goog-api-key 標頭中找到 API 金鑰');
  } 
  else if (req.headers.authorization && req.headers.authorization.toLowerCase().startsWith('bearer ')) {
    rawApiKeys = req.headers.authorization.substring(7); 
    apiKeySource = 'auth';
    console.log('在 Authorization 標頭中找到 API 金鑰');
  }
  
  let selectedKey = '';
  if (apiKeySource) {
    const apiKeys = String(rawApiKeys).split(',').map(k => k.trim()).filter(k => k);
    if (apiKeys.length > 0) {
      selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
      console.log(`Gemini Selected API Key: ${selectedKey}`);
    }
  }
  
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'x-goog-api-key' && lowerKey !== 'authorization') {
      headers[key] = value;
    }
  }
  
  if (selectedKey) {
    if (apiKeySource === 'x-goog') {
      headers['x-goog-api-key'] = selectedKey;
    } else if (apiKeySource === 'auth') {
      headers['Authorization'] = `Bearer ${selectedKey}`;
    }
  }
  
  headers.host = TARGET_HOSTNAME;
  headers.origin = TARGET_ORIGIN;
  headers.referer = TARGET_API_URL;
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || req.protocol;
  
  const hopByHopHeaders = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade'
  ];
  for (const header of hopByHopHeaders) {
    delete headers[header];
  }
  
  try {
    const apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: (req.method !== 'GET' && req.method !== 'HEAD') ? req : undefined,
      duplex: 'half',
    });
    
    const responseHeaders = {};
    for (const [key, value] of apiResponse.headers.entries()) {
      if (!['content-encoding', 'transfer-encoding', 'connection', 'strict-transport-security'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    }
    res.writeHead(apiResponse.status, responseHeaders);
    
    if (apiResponse.body) {
      Readable.fromWeb(apiResponse.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(`代理請求時發生錯誤:`, error);
    if (!res.headersSent) {
      res.status(502).send('代理伺服器錯誤 (Bad Gateway)');
    }
  }
});

export default app;