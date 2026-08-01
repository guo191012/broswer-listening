// @ts-nocheck
/**
 * MAIN world 注入脚本
 * 拦截 fetch / XHR / EventSource 获取响应体，
 * 通过 window.postMessage 传递给 ISOLATED world 的 content script.
 */
(function() {
console.log('[vibcoding-inject] 注入脚本已加载');

function post(type, data) {
  console.log('[vibcoding-inject] post:', type, (data.url || '').slice(0, 80));
  window.postMessage({ source: 'vibcoding-inject', type: type, payload: data }, '*');
}

// ---- patch fetch ----
var _fetch = window.fetch.bind(window);

function isSSEContentType(ct) {
  return ct && ct.indexOf('text/event-stream') !== -1;
}

function readStreamAsSSE(url, method, status, stream) {
  var reader = stream.getReader();
  var decoder = new TextDecoder();
  var accumulated = '';
  var chunkCount = 0;

  console.log('[vibcoding-inject] 开始读取 SSE 流:', url);

  function pump() {
    reader.read().then(function(result) {
      if (result.done) {
        // 流关闭，发送最终 response
        console.log('[vibcoding-inject] SSE 流结束，累计', chunkCount, '块，总长度:', accumulated.length);
        post('sse-chunk', { url: url, data: null, done: true });
        post('response', { url: url, method: method, status: status, body: accumulated.slice(0, 65536) || null });
        return;
      }
      var chunk = decoder.decode(result.value, { stream: true });
      accumulated += chunk;
      chunkCount++;
      console.log('[vibcoding-inject] SSE chunk:', chunkCount, '大小:', chunk.length, '累计:', accumulated.length);
      post('sse-chunk', { url: url, data: chunk, done: false });
      pump();
    }).catch(function(err) {
      console.log('[vibcoding-inject] fetch stream err:', err);
      post('response', { url: url, method: method, status: status, body: accumulated.slice(0, 65536) || null });
    });
  }
  pump();
}

window.fetch = function(input, init) {
  var url = (typeof input === 'string' ? input
    : input instanceof Request ? input.url
    : input.toString());
  // 补全相对路径为完整 URL (background 用完整 URL 匹配)
  if (url.startsWith('/')) {
    url = window.location.origin + url;
  } else if (!url.startsWith('http')) {
    url = window.location.origin + '/' + url;
  }
  var method = ((init && init.method) || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  console.log('[vibcoding-inject] fetch:', method, url);

  return _fetch(input, init).then(function(resp) {
    console.log('[vibcoding-inject] fetch resp:', method, url, resp.status);
    var ct = resp.headers.get('content-type') || '';
    console.log('[vibcoding-inject] fetch content-type:', ct);
    var isStream = isSSEContentType(ct) || (resp.body && typeof resp.body.getReader === 'function' && ct.indexOf('text/') !== -1);
    console.log('[vibcoding-inject] isStream:', isStream, 'has body:', !!resp.body);

    if (isStream && resp.body) {
      // SSE 流：用 ReadableStream 逐块读取
      readStreamAsSSE(url, method, resp.status, resp.body);
    } else {
      // 普通响应：clone 后读完整 body
      resp.clone().text().then(function(body) {
        console.log('[vibcoding-inject] fetch body len:', body ? body.length : 0);
        post('response', { url: url, method: method, status: resp.status, body: body.slice(0, 65536) });
      }).catch(function(err) {
        console.log('[vibcoding-inject] fetch text err:', err);
        post('response', { url: url, method: method, status: resp.status, body: null });
      });
    }
    return resp;
  }).catch(function(err) {
    console.log('[vibcoding-inject] fetch err:', err);
  });
};
window.fetch.toString = function() { return 'function fetch() { [native code] }'; };

// ---- patch XMLHttpRequest ----
var OrigXHR = window.XMLHttpRequest;

function PatchedXHR() {
  var xhr = new OrigXHR();
  var origOpen = xhr.open;
  var origSend = xhr.send;
  var _url = '';
  var _method = 'GET';

  xhr.open = function(method, url) {
    var restArgs = Array.prototype.slice.call(arguments, 2);
    _url = typeof url === 'string' ? url : url.toString();
    // 补全相对路径
    if (_url.startsWith('/')) {
      _url = window.location.origin + _url;
    } else if (_url && !_url.startsWith('http')) {
      _url = window.location.origin + '/' + _url;
    }
    _method = method.toUpperCase();
    return origOpen.apply(xhr, [method, url].concat(restArgs));
  };

  xhr.send = function() {
    var args = arguments;
    var listener = function() {
      try {
        if (xhr.readyState === 4) {
          var ct = xhr.getResponseHeader('content-type') || '';
          console.log('[vibcoding-inject] XHR done:', _method, _url, xhr.status, 'ct:', ct);
          // 无条件捕获所有响应体，不在 inject 侧过滤
          var body = xhr.responseText ? xhr.responseText.slice(0, 65536) : null;
          post('response', { url: _url, method: _method, status: xhr.status, body: body });
          xhr.removeEventListener('readystatechange', listener);
        }
      } catch(e) {
        console.log('[vibcoding-inject] XHR err:', e);
      }
    };
    xhr.addEventListener('readystatechange', listener);
    return origSend.apply(xhr, args);
  };

  return xhr;
}
Object.setPrototypeOf(PatchedXHR, OrigXHR);
Object.setPrototypeOf(PatchedXHR.prototype, OrigXHR.prototype);
window.XMLHttpRequest = PatchedXHR;

// ---- patch EventSource ----
var OrigEventSource = window.EventSource;
function PatchedEventSource(url, config) {
  var urlStr = typeof url === 'string' ? url : url.toString();
  var es = new OrigEventSource(url, config);
  var chunks = [];
  es.addEventListener('message', function(e) {
    chunks.push(e.data);
    post('sse-chunk', { url: urlStr, data: e.data });
  });
  es.addEventListener('error', function() {
    if (es.readyState === EventSource.CLOSED) {
      post('response', { url: urlStr, method: 'GET', status: 0, body: chunks.join('\n') || null });
    }
  });
  return es;
}
Object.setPrototypeOf(PatchedEventSource, OrigEventSource);
Object.setPrototypeOf(PatchedEventSource.prototype, OrigEventSource.prototype);
window.EventSource = PatchedEventSource;
console.log('[vibcoding-inject] 注入完成');
})();
