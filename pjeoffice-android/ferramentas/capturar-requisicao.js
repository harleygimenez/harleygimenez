// capturar-requisicao.js
// Cola este trecho no Console do navegador (F12 -> Console) na pagina de login
// do tribunal, ANTES de clicar em "entrar com certificado". Ele intercepta a
// chamada que a pagina faz ao PjeOffice (127.0.0.1:8800) e imprime o JSON da
// requisicao: tarefaId, servidor, enviarPara e o algoritmoAssinatura — ou seja,
// exatamente como aquele servidor exige a autenticacao. Nao envia nada a mais;
// so observa a chamada que a propria pagina ja faria.

(function () {
  const alvo = /127\.0\.0\.1:8800|localhost:8800/;
  const grab = (u) => {
    try {
      if (!u || !alvo.test(u)) return;
      const m = /[?&]r=([^&]+)/.exec(u);
      if (!m) { console.log('[PJe] chamada ao assinador:', u); return; }
      const r = JSON.parse(decodeURIComponent(m[1]));
      let tarefa = r.tarefa;
      if (typeof tarefa === 'string') { try { tarefa = JSON.parse(tarefa); } catch (_) {} }
      const alg = (tarefa && tarefa.algoritmoAssinatura) || '(ausente -> padrao MD5withRSA)';
      console.log('[PJe] requisicao capturada:', r);
      console.log('[PJe] tarefaId=%s | servidor=%s | enviarPara=%s | algoritmoAssinatura=%s',
        r.tarefaId, r.servidor, (tarefa && tarefa.enviarPara) || '', alg);
    } catch (e) { console.log('[PJe] erro ao ler r=', e); }
  };

  // 1) new Image().src = "...127.0.0.1:8800..."  (forma mais comum do PjeOffice)
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(v) { grab(v); return desc.set.call(this, v); },
    get() { return desc.get.call(this); }, configurable: true,
  });
  // 2) fetch
  const of = window.fetch;
  window.fetch = function (u, ...a) { grab(typeof u === 'string' ? u : (u && u.url)); return of.apply(this, [u, ...a]); };
  // 3) XMLHttpRequest
  const oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...a) { grab(u); return oo.apply(this, [m, u, ...a]); };

  console.log('[PJe] captura LIGADA. Agora clique em "entrar com certificado".');
})();
