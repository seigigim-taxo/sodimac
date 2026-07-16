const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'docs', 'screenshots');
const BASE_URL = 'http://localhost:8100';
const API_BASE = 'http://192.168.3.5/PoC/ws/api';

const MOCK_USER = { id: 1, name: 'Juan Pérez', rut: '12345678-5', rol: 'Operador de Inventario', correo: 'juan@ejemplo.cl' };
const MOCK_TOKEN = 'f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2';

const MOCK_STORES = [
  { id: 1, codigo_sodimac: '4011', nombre: 'Sodimac La Florida', tipo: 'HIPER', zona_operativa: 'STGO', direccion: 'Av. La Florida 1234', comuna: 'La Florida', region: 'RM' },
];

const MOCK_EVENTS = [
  {
    id: 101,
    folio: 'DEMO-SGO-20260716-001',
    fecha_programada: '2026-07-16',
    fecha_ejecucion: null,
    categoria: 'GENERAL',
    estado: 'ABIERTO',
    codigo_sodimac: '4011',
    sucursal: 'Sodimac La Florida',
    coord_nombres: 'Ana', coord_apellidos: 'Rojas',
    analista_nombres: 'Luis', analista_apellidos: 'Soto',
  },
  {
    id: 102,
    folio: 'DEMO-SGO-20260720-002',
    fecha_programada: '2026-07-20',
    fecha_ejecucion: null,
    categoria: 'CÍCLICO',
    estado: 'ABIERTO',
    codigo_sodimac: '4011',
    sucursal: 'Sodimac La Florida',
    coord_nombres: 'Pedro', coord_apellidos: 'Muñoz',
    analista_nombres: 'Claudia', analista_apellidos: 'Vargas',
  },
];

const MOCK_ZONES = [
  { id: 1, zona_id: 10, codigo: 'Z-VENTA', zona_nombre: 'Venta', tipo: 'VENTA', tipo_descripcion: 'Zona de piso de venta' },
  { id: 2, zona_id: 11, codigo: 'Z-BODEGA', zona_nombre: 'Bodega', tipo: 'BODEGA', tipo_descripcion: 'Zona de bodega' },
  { id: 3, zona_id: 12, codigo: 'Z-ALTILLO', zona_nombre: 'Altillo', tipo: 'ALTILLO', tipo_descripcion: 'Zona de altillo' },
];

async function setupRouteMocks(page) {
  // Use regex patterns for broader matching
  await page.route(/.*auth\/login\.php/i, async (route) => {
    if (route.request().method() === 'POST') {
      console.log('   [mock] intercepted POST auth/login.php');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'OK',
          msg: 'Login exitoso',
          data: { token: MOCK_TOKEN, user: MOCK_USER }
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(/.*sucursales\/index\.php/i, async (route) => {
    console.log('   [mock] intercepted GET sucursales/index.php');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'OK',
        msg: 'Consulta exitosa',
        data: MOCK_STORES
      }),
    });
  });

  await page.route(/.*eventos\/index\.php/i, async (route) => {
    console.log('   [mock] intercepted GET eventos/index.php');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'OK',
        msg: 'Consulta exitosa',
        data: MOCK_EVENTS
      }),
    });
  });

  await page.route(/.*asignaciones-zona\/index\.php/i, async (route) => {
    console.log('   [mock] intercepted GET asignaciones-zona/index.php');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'OK',
        msg: 'Consulta exitosa',
        data: MOCK_ZONES
      }),
    });
  });
}

async function dismissErrorOverlay(page) {
  await page.evaluate(() => {
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) overlay.remove();
  });
}

async function waitForAppReady(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await dismissErrorOverlay(page);
}

async function clickContinueButton(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('ion-button'));
    const btn = btns.find(b => b.textContent?.trim() === 'Continuar' && !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  });
}

async function main() {
  const fs = require('fs');
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();

  await setupRouteMocks(page);

  // ===== 1. LOGIN PAGE =====
  console.log('1. Capturing login page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForAppReady(page);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-login.png'), fullPage: false });
  console.log('   ✓ 01-login.png');

  // ===== 2. FILL LOGIN AND SUBMIT =====
  console.log('2. Logging in...');

  // Wait for login form to be fully rendered
  await page.waitForSelector('ion-input[formcontrolname="rut"]', { timeout: 5000 });

  // Use Playwright locator with deep shadow piercing for ion-input
  const rutNative = page.locator('ion-input[formcontrolname="rut"]').locator('input');
  const pwdNative = page.locator('ion-input[formcontrolname="password"]').locator('input');

  await rutNative.click();
  await rutNative.fill('12345678-5');
  await page.waitForTimeout(300);

  await pwdNative.click();
  await pwdNative.fill('123456');
  await page.waitForTimeout(300);

  // Debug: check form state
  const submitBtn = page.locator('ion-button.btn-primary[type="submit"]');
  const isBtnDisabled = await submitBtn.isDisabled();
  console.log(`   Login button disabled: ${isBtnDisabled}`);

  await submitBtn.click();
  console.log('   Login submitted, waiting for navigation...');
  await page.waitForTimeout(2000);

  // Wait for navigation to /home
  await page.waitForURL('**/home', { timeout: 15000 });
  console.log('   Navigated to /home');

  // ===== 3. HOME PAGE - STORE (AUTO-SELECTED) =====
  console.log('3. Capturing store page (single store)...');
  await page.waitForTimeout(2500);
  await dismissErrorOverlay(page);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-store-selection.png'), fullPage: true });
  console.log('   ✓ 02-store-selection.png');

  // ===== 4. CONTINUE =====
  console.log('4. Clicking Continue...');
  await clickContinueButton(page);
  await page.waitForURL('**/events', { timeout: 15000 });
  console.log('   Navigated to /events');
  await page.waitForTimeout(2000);
  await dismissErrorOverlay(page);
  await page.waitForTimeout(2000);

  // ===== 5. EVENTS PAGE =====
  console.log('5. Capturing events page...');
  await dismissErrorOverlay(page);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-event-selection.png'), fullPage: true });
  console.log('   ✓ 03-event-selection.png');

  // ===== 6. SELECT FIRST EVENT AND CONTINUE =====
  console.log('6. Selecting first event...');
  await page.evaluate(() => {
    const card = document.querySelector('.event-card');
    if (card) card.click();
  });
  await page.waitForTimeout(500);

  await clickContinueButton(page);
  console.log('   Waiting for navigation to /zone-select...');
  await page.waitForURL('**/zone-select', { timeout: 15000 });
  console.log('   Navigated to /zone-select');
  await page.waitForTimeout(2000);
  await dismissErrorOverlay(page);

  // ===== 7. ZONE SELECT + TAG SCANNING PAGE =====
  console.log('7. Capturing zone + TAG page...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-zone-tag-scan.png'), fullPage: true });
  console.log('   ✓ 04-zone-tag-scan.png');

  // ===== 8. SCAN TAG =====
  console.log('8. Scanning TAG...');
  const tagNative = page.locator('app-scan').first().locator('ion-input').locator('input');
  await tagNative.click();
  await tagNative.fill('TAG-C001-VENTA');
  await page.waitForTimeout(300);

  const tagBtn = page.locator('app-scan').first().locator('ion-button');
  await tagBtn.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-zone-tag-confirmed.png'), fullPage: true });
  console.log('   ✓ 05-zone-tag-confirmed.png');

  // ===== 9. SELECT ZONE =====
  console.log('9. Selecting zone...');
  const zoneSelect = page.locator('ion-select.zone-select');
  await zoneSelect.click();
  await page.waitForTimeout(1500);

  // Click first option in the overlay/action sheet
  const optionBtns = page.locator('.alert-radio-label, .select-interface-option, .action-sheet-button');
  const optCount = await optionBtns.count();
  console.log(`   Zone option buttons: ${optCount}`);

  if (optCount > 0) {
    await optionBtns.first().click();
  } else {
    // Use keyboard navigation
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1500);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-zone-selected.png'), fullPage: true });
  console.log('   ✓ 06-zone-selected.png');

  // ===== 10. CONTINUE TO COUNTING =====
  console.log('10. Continuing to counting...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('ion-button'));
    const btn = btns.find(b => b.textContent?.trim() === 'Continuar' && !b.disabled);
    if (btn) {
      btn.click();
    }
  });
  console.log('   Waiting for navigation to /counting...');
  await page.waitForURL('**/counting', { timeout: 15000 });
  console.log('   Navigated to /counting');
  await page.waitForTimeout(2000);

  // ===== 11. COUNTING PAGE =====
  console.log('11. Capturing counting page...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-counting-empty.png'), fullPage: true });
  console.log('   ✓ 07-counting-empty.png');

  // ===== 12. SCAN SKUs =====
  console.log('12. Scanning SKUs...');

  // Quantity
  const qtyNative = page.locator('ion-input[type="number"]').locator('input');
  await qtyNative.click();
  await qtyNative.fill('5');
  await page.waitForTimeout(300);

  // SKU input
  const skuNative = page.locator('app-scan').first().locator('ion-input').locator('input');
  await skuNative.click();
  await skuNative.fill('SKU-12345');
  await page.waitForTimeout(300);

  const skuBtn = page.locator('app-scan').first().locator('ion-button');
  await skuBtn.click();
  await page.waitForTimeout(1000);

  // Second SKU
  await qtyNative.click();
  await qtyNative.fill('3');
  await page.waitForTimeout(300);

  await skuNative.click();
  await skuNative.fill('SKU-67890');
  await page.waitForTimeout(300);
  await skuBtn.click();
  await page.waitForTimeout(1000);

  // Third SKU  
  await qtyNative.click();
  await qtyNative.fill('10');
  await page.waitForTimeout(300);

  await skuNative.click();
  await skuNative.fill('SKU-11111');
  await page.waitForTimeout(300);
  await skuBtn.click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08-counting-with-items.png'), fullPage: true });
  console.log('   ✓ 08-counting-with-items.png');

  // ===== 13. FINALIZE COUNTING =====
  console.log('13. Finalize confirm dialog...');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09-counting-finalize.png'), fullPage: true });
  console.log('   ✓ 09-counting-finalize.png');

  await browser.close();
  console.log('\n✅ All screenshots captured!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
