const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  await page.route(/.*192\.168\.3\.5\/PoC\/ws\/api\/auth\/login\.php/i, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'OK', msg: 'Login exitoso', data: { token: 'tok', user: { id: 1, name: 'Juan Pérez', rut: '12345678-5', rol: 'Operador', correo: 'juan@test.cl' } } }) });
    } else { await route.continue(); }
  });
  await page.route(/.*192\.168\.3\.5\/PoC\/ws\/api\/sucursales\/index\.php/i, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'OK', msg: 'ok', data: [{ id: 1, codigo_sodimac: '4011', nombre: 'Sodimac La Florida', tipo: 'HIPER', zona_operativa: 'STGO', direccion: 'Av. La Florida 1234', comuna: 'La Florida', region: 'RM' }] }) });
  });
  await page.route(/.*192\.168\.3\.5\/PoC\/ws\/api\/eventos\/index\.php/i, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'OK', msg: 'ok', data: [{ id: 101, folio: 'DEMO-001', fecha_programada: '2026-07-16', fecha_ejecucion: null, categoria: 'GENERAL', estado: 'ABIERTO', codigo_sodimac: '4011', sucursal: 'Sodimac La Florida', coord_nombres: 'Ana', coord_apellidos: 'Rojas', analista_nombres: 'Luis', analista_apellidos: 'Soto' }] }) });
  });

  await page.goto('http://localhost:8100', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.locator('ion-input[formcontrolname="rut"]').locator('input').fill('12345678-5');
  await page.locator('ion-input[formcontrolname="password"]').locator('input').fill('123456');
  await page.locator('ion-button[type="submit"]').click();
  await page.waitForURL('**/home', { timeout: 15000 });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('ion-button'));
    const btn = btns.find(b => b.textContent?.trim() === 'Continuar' && !b.disabled);
    if (btn) btn.click();
  });
  await page.waitForURL('**/events', { timeout: 15000 });
  await page.waitForTimeout(3000);

  const dir = path.join(__dirname, 'docs', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'debug-events.png'), fullPage: true });

  const errorText = await page.evaluate(() => {
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay && overlay.shadowRoot) {
      const msg = overlay.shadowRoot.querySelector('.message-body, .message, pre');
      return msg ? msg.textContent?.substring(0, 2000) : overlay.shadowRoot.textContent?.substring(0, 2000);
    }
    return 'No vite-error-overlay found';
  });
  console.log('Error text:', errorText);

  await page.evaluate(() => {
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) overlay.remove();
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(dir, 'debug-events-after.png'), fullPage: true });

  await browser.close();
  console.log('Done');
})();
