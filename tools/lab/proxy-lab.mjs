#!/usr/bin/env node
/*
 * Proxy del laboratorio: se pone entre la PDA (o las pruebas) y el servidor de
 * prueba, y estropea la conexión a pedido para reproducir lo que pasa en terreno.
 *
 * El caso que importa es "perder-respuesta": el pedido LLEGA al servidor, que lo
 * guarda y lo procesa, pero la respuesta nunca vuelve. Es exactamente lo que le
 * pasó al TAG 7001: el servidor lo tenía y la PDA no se enteró.
 *
 * Uso:
 *   node tools/lab/proxy-lab.mjs [--puerto 8081] [--destino http://127.0.0.1:8099]
 *                                [--real http://50.16.13.230/app/ws/sodimac/api]
 *
 * A DÓNDE VA CADA COSA
 *   tag-finalizado*.php y estado-cargas*.php  -> el servidor de PRUEBA (--destino). Un envío
 *                                               de laboratorio NUNCA llega al servidor real.
 *   ingreso, preparación y lo demás           -> el servidor REAL (--real), de solo lectura:
 *                                               así la PDA trae la muestra verdadera del
 *                                               operador. El ingreso lo escribe quien prueba.
 *   actualizaciones/*                         -> nunca al servidor real (no ofrecer APK).
 *
 * Control (desde un navegador o curl; no pasa al servidor):
 *   GET  /__lab/modo               modo actual
 *   POST /__lab/modo/<modo>        cambia el modo
 *   GET  /__lab/log                pedidos vistos (JSON)
 *   POST /__lab/reset              borra el registro y vuelve a "normal"
 *   POST /__lab/apagar             termina el proxy
 *
 * Modos (afectan solo a los pedidos a tag-finalizado*.php; el resto pasa igual,
 * salvo "caido"):
 *   normal                 todo pasa tal cual
 *   perder-respuesta       el servidor lo recibe y lo guarda; la respuesta se corta
 *   perder-respuesta-una   igual, solo la primera vez; luego vuelve a "normal"
 *   perder-respuesta-y-caer  el servidor lo guarda, la respuesta se corta y la conexión
 *                          queda caída (modo "caido"): ni siquiera se puede preguntar
 *                          después. Es el caso en que la PDA NO puede enterarse sola.
 *   cortar-antes           el pedido NO llega al servidor; la conexión se corta
 *   rechazar               responde 503 sin tocar el servidor
 *   lento-<ms>             responde pasados <ms> (más de 30000 hace vencer la app)
 *   caido                  corta TODO, también las consultas de estado
 */
import http from 'node:http';

const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defecto;
};

const PUERTO = Number(arg('puerto', '8081'));
const DESTINO = new URL(arg('destino', 'http://127.0.0.1:8099'));
const REAL = new URL(arg('real', 'http://50.16.13.230/app/ws/sodimac/api'));

let modo = 'normal';
const registro = [];

const esTag = (ruta) => /\/tag-finalizado[^/]*\.php/.test(ruta);
const esDeEnvios = (ruta) => /\/(tag-finalizado|estado-cargas)[^/]*\.php/.test(ruta);
const esActualizacion = (ruta) => /\/actualizaciones\//.test(ruta);

function anotar(req, aplicado, estado) {
  registro.push({ hora: new Date().toISOString(), metodo: req.method, ruta: req.url, modo: aplicado, estado });
  if (registro.length > 2000) registro.shift();
}

function responderJson(res, codigo, cuerpo) {
  res.writeHead(codigo, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    Connection: 'close',
  });
  res.end(JSON.stringify(cuerpo));
}

function control(req, res) {
  const ruta = req.url.split('?')[0];

  if (req.method === 'GET' && ruta === '/__lab/modo') return responderJson(res, 200, { modo });
  if (req.method === 'GET' && ruta === '/__lab/log') return responderJson(res, 200, registro);
  if (req.method === 'POST' && ruta === '/__lab/apagar') {
    responderJson(res, 200, { apagando: true });
    return setTimeout(() => process.exit(0), 100);
  }
  if (ruta === '/__lab/reset') {
    registro.length = 0;
    modo = 'normal';
    return responderJson(res, 200, { modo });
  }

  const m = ruta.match(/^\/__lab\/modo\/(.+)$/);
  if (m) {
    const nuevo = decodeURIComponent(m[1]);
    const valido = ['normal', 'perder-respuesta', 'perder-respuesta-una', 'perder-respuesta-y-caer', 'cortar-antes', 'rechazar', 'caido'].includes(nuevo)
      || /^lento-\d+$/.test(nuevo);
    if (!valido) return responderJson(res, 400, { error: `modo desconocido: ${nuevo}` });
    modo = nuevo;
    return responderJson(res, 200, { modo });
  }

  return responderJson(res, 404, { error: 'ruta de control desconocida' });
}

function reenviar(req, cuerpo, alTerminar) {
  /*
   * Envíos -> servidor de prueba. Lo demás -> servidor real (si hay), quitando el
   * prefijo /api que la PDA agrega y poniendo el de la ruta real.
   */
  const alReal = !esDeEnvios(req.url);
  const base = alReal ? REAL : DESTINO;
  const ruta = alReal ? REAL.pathname.replace(/\/$/, '') + req.url.replace(/^\/api/, '') : req.url;
  const opciones = {
    hostname: base.hostname,
    port: base.port,
    path: ruta,
    method: req.method,
    headers: { ...req.headers, host: base.host, 'content-length': Buffer.byteLength(cuerpo) },
  };
  const salida = http.request(opciones, (resp) => {
    const trozos = [];
    resp.on('data', (t) => trozos.push(t));
    resp.on('end', () => alTerminar(null, resp, Buffer.concat(trozos)));
  });
  salida.on('error', (err) => alTerminar(err));
  salida.end(cuerpo);
}

http.createServer((req, res) => {
  if (req.url.startsWith('/__lab/')) return control(req, res);

  // La app de desarrollo llama a los *_dev.php; el servidor del laboratorio solo tiene los
  // reales. Solo para los envíos: lo demás conserva su nombre (_dev) en el servidor real.
  if (esDeEnvios(req.url)) req.url = req.url.replace(/_dev(\.php)/, '$1');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      Connection: 'close',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  const trozos = [];
  req.on('data', (t) => trozos.push(t));
  req.on('end', () => {
    const cuerpo = Buffer.concat(trozos);

    if (esActualizacion(req.url)) {
      anotar(req, 'sin-actualizaciones', 404);
      return responderJson(res, 404, { status: 'ERROR', msg: 'El laboratorio no ofrece actualizaciones.' });
    }

    const tag = esTag(req.url) && req.method === 'POST';
    let aplicado = 'normal';

    if (modo === 'caido') {
      anotar(req, 'caido', 'cortado');
      return req.socket.destroy();
    }

    if (tag) {
      if (modo === 'cortar-antes') {
        anotar(req, modo, 'cortado antes de llegar');
        return req.socket.destroy();
      }
      if (modo === 'rechazar') {
        anotar(req, modo, 503);
        return responderJson(res, 503, { status: 'ERROR', msg: 'Servicio no disponible (laboratorio).' });
      }
      aplicado = modo;
    }

    reenviar(req, cuerpo, (err, resp, datos) => {
      if (err) {
        anotar(req, aplicado, `error: ${err.code ?? err.message}`);
        return responderJson(res, 502, { status: 'ERROR', msg: 'El laboratorio no llega al servidor de prueba.' });
      }

      if (tag && (modo === 'perder-respuesta' || modo === 'perder-respuesta-una' || modo === 'perder-respuesta-y-caer')) {
        // El servidor ya lo guardó (respondió). La PDA no recibirá nada.
        anotar(req, modo, `recibido por el servidor (${resp.statusCode}); respuesta perdida`);
        if (modo === 'perder-respuesta-una') modo = 'normal';
        if (modo === 'perder-respuesta-y-caer') modo = 'caido';
        return req.socket.destroy();
      }

      const espera = /^lento-(\d+)$/.test(modo) && tag ? Number(modo.slice(6)) : 0;
      setTimeout(() => {
        anotar(req, aplicado, resp.statusCode);
        // Connection: close. Chrome y el WebView de Android REINTENTAN solos un POST cuando una
        // conexión reutilizada se corta; con una conexión nueva por pedido, lo que se ve en el
        // registro es lo que la app mandó de verdad.
        res.writeHead(resp.statusCode ?? 502, { ...resp.headers, 'content-length': datos.length, connection: 'close' });
        res.end(datos);
      }, espera);
    });
  });
}).listen(PUERTO, '0.0.0.0', () => {
  console.log(`Laboratorio: proxy en :${PUERTO}  envíos -> ${DESTINO.origin}  resto -> ${REAL.href}  (modo: ${modo})`);
});
