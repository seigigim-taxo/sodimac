import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:4200';
const SHOTS = 'C:/laragon/www/PoC/sodimac_apk_v2.0/sodimac/docs/capturas';
mkdirSync(SHOTS, { recursive: true });

const MOCKS = {
  login: {
    status: 'OK', msg: 'Login exitoso', data: {
      token: 'mock-token-12345',
      user: { id: 42, name: 'Ana María González', rut: '12345678-9', rol: 'Operador', correo: 'ana.gonzalez@sodimac.cl' }
    }
  },
  stores: { status: 'OK', msg: '', data: [
    { id: 1, codigo_sodimac: 'S001', nombre: 'Sodimac Homecenter La Dehesa', tipo: 'Homecenter', zona_operativa: 'Norte', direccion: 'Av. La Dehesa 1200', comuna: 'Lo Barnechea', region: 'Metropolitana' },
    { id: 2, codigo_sodimac: 'S002', nombre: 'Sodimac Constructor San Bernardo', tipo: 'Constructor', zona_operativa: 'Sur', direccion: 'Av. Portales 2450', comuna: 'San Bernardo', region: 'Metropolitana' }
  ]},
  events: { status: 'OK', msg: '', data: [
    { id: 101, folio: 'INV-2025-001', fecha_programada: '2025-07-15', fecha_ejecucion: null, categoria: 'GENERAL', estado: 'Programado', codigo_sodimac: 'S001', sucursal: 'Sodimac La Dehesa', coord_nombres: 'Carlos Muñoz', coord_apellidos: 'Pérez', analista_nombres: 'Ana María', analista_apellidos: 'González' }
  ]},
  zones: { status: 'OK', msg: '', data: [
    { id: 1, zona_id: 'Z-A01', codigo: 'A01', zona_nombre: 'Piso Venta Sector A', tipo: 'PISO_VENTA', tipo_descripcion: 'Piso de Venta' },
    { id: 2, zona_id: 'Z-B02', codigo: 'B02', zona_nombre: 'Altillo Sector B', tipo: 'ALTILLO', tipo_descripcion: 'Altillo' }
  ]}
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Log page errors but don't let them block
  page.on('pageerror', e => console.log('  ⚠️ Page error:', e.message.slice(0, 80)));

  // Mock API
  await page.route('**/api/**', async (route, req) => {
    const url = req.url();
    let body;
    if (url.includes('login.php')) body = MOCKS.login;
    else if (url.includes('sucursales')) body = MOCKS.stores;
    else if (url.includes('eventos')) body = MOCKS.events;
    else if (url.includes('asignaciones')) body = MOCKS.zones;
    else return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const shot = async (name) => {
    await page.waitForTimeout(500);
    // Remove Vite error overlay if present
    try { await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove()); } catch {}
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    console.log(`   ✅ ${name}.png`);
  };

  // === 1. LOGIN ===
  console.log('📸 Login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await shot('01-login');

  // Fill form via Angular internals (bypass shadow DOM issues)
  await page.evaluate(() => {
    const el = document.querySelector('[formControlName="rut"]');
    if (el) {
      const ionInput = el.closest('ion-input') || el;
      ionInput.value = '12345678-9';
      ionInput.dispatchEvent(new Event('ionInput'));
    }
  });
  await page.evaluate(() => {
    const el = document.querySelector('[formControlName="password"]');
    if (el) {
      const ionInput = el.closest('ion-input') || el;
      ionInput.value = '123456';
      ionInput.dispatchEvent(new Event('ionInput'));
    }
  });
  await page.waitForTimeout(500);
  // Also set Angular FormControl directly
  await page.evaluate(() => {
    const app = document.querySelector('app-login');
    if (app) {
      const cmp = app.__component || app.ngComponentInstance;
      if (cmp && cmp.form) {
        cmp.form.patchValue({ rut: '12345678-9', password: '123456' });
      }
    }
  });
  await page.waitForTimeout(300);
  await shot('02-login-llenado');

  // Click Ingresar (bypass any overlay)
  let btn = page.locator('ion-button:has-text("Ingresar")').first();
  await btn.click({ force: true, timeout: 10000 }).catch(() => {
    // Fallback: dispatch click via JS
    return page.evaluate(() => {
      const btns = document.querySelector('ion-button[type="submit"], .btn-primary');
      if (btns) btns.click();
    });
  });
  await page.waitForTimeout(3000);

  // === 2. HOME ===
  console.log('📸 Home...');
  // Navigate directly if not already there
  if (!page.url().includes('/home')) {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2000);
  await shot('03-home');

  // Click first card
  const cardSel = '.card, .store-card, [class*="card"]';
  const card = page.locator(cardSel).first();
  if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    await card.click({ force: true });
    await page.waitForTimeout(500);
    await shot('04-home-seleccionado');

    // Click Continuar
    await page.locator('ion-button:has-text("Continuar")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // === 3. EVENTS ===
  console.log('📸 Eventos...');
  if (!page.url().includes('/events')) {
    await page.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2000);
  await shot('05-eventos');

  if (await page.locator(cardSel).first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator(cardSel).first().click({ force: true });
    await page.waitForTimeout(500);
    await shot('06-eventos-seleccionado');
    await page.locator('ion-button:has-text("Continuar")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // === 4. ZONE SELECT ===
  console.log('📸 Zona de conteo...');
  if (!page.url().includes('/zone-select')) {
    await page.goto(`${BASE}/zone-select`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2000);
  await shot('07-zone-select');

  // Fill TAG and confirm
  const scanInp = page.locator('app-scan input').first();
  if (await scanInp.isVisible({ timeout: 3000 }).catch(() => false)) {
    await scanInp.click({ force: true });
    await scanInp.fill('TAG-001B');
    await page.waitForTimeout(300);
    await page.locator('ion-button:has-text("Confirmar")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot('08-zone-select-tag');
    await page.locator('ion-button:has-text("Continuar")').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // === 5. COUNTING ===
  console.log('📸 Conteo...');
  if (!page.url().includes('/counting')) {
    await page.goto(`${BASE}/counting`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2000);
  await shot('09-counting');

  await browser.close();
  console.log('\n✅ Capturas completadas en docs/capturas/');
})();
