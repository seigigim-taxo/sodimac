# Design System — Sodimac PDA App

> Documento generado a partir del código implementado. Esta es la fuente de verdad; al modificar el diseño, actualizar este archivo.

---

## 1. Resumen

- **Estilo visual:** Flat design con superficies sólidas, sin glassmorphism ni blur.
- **Sensación:** Limpia, técnica, legible en condiciones de PDA / almacén.
- **Modo:** Light/dark con toggle. La clase `.dark` se aplica al `<ion-app>` para alternar.
- **Objetivo:** Toda la app (login, tienda, eventos, muestras, zonas, conteo, cierre) comparte los mismos tokens.

---

## 2. Sistema de temas

El tema se controla con la clase `.dark` en `<ion-app>`:

```
<ion-app>          → modo light
<ion-app class="dark"> → modo dark
```

- `ThemeFacade` inyecta/remueve la clase `.dark` y persiste la preferencia en `@capacitor/preferences`.
- `StatusBar` nativo se actualiza para coincidir con el tema.
- **No se usa** `dark.always.css` ni `color-scheme: dark` a nivel de documento.

---

## 3. Paleta de colores (tokens CSS)

### Light (default)

| Token | Valor | Uso |
|-------|-------|-----|
| `--app-bg-start` | `#f5f5f0` | Fondo degradado inicio |
| `--app-bg-mid` | `#f0f0eb` | Fondo degradado medio |
| `--app-bg-end` | `#e8e8e3` | Fondo degradado fin |
| `--app-bg-gradient` | `linear-gradient(135deg, ...)` | Fondo completo |
| `--app-surface` | `#ffffff` | Tarjetas, inputs |
| `--app-surface-hover` | `#f0f0eb` | Hover state |
| `--app-border` | `rgba(0,0,0,0.14)` | Bordes sutiles |
| `--app-border-strong` | `rgba(0,0,0,0.30)` | Bordes inputs |
| `--app-border-focus` | `#F97316` | Borde enfocado |
| `--app-placeholder` | `#5c6370` | Placeholder inputs |
| `--app-primary` | `#F97316` | Naranja primario |
| `--app-secondary` | `#FB923C` | Naranja secundario |
| `--app-accent` | `#EA580C` | Naranja acento |
| `--app-cta-gradient` | `linear-gradient(135deg, #EA580C, #F97316)` | Botón CTA |
| `--app-cta-gradient-hover` | `linear-gradient(135deg, #C2410C, #EA580C)` | CTA hover |
| `--app-cta-gradient-active` | `linear-gradient(135deg, #9A3412, #C2410C)` | CTA active |
| `--app-text` | `#1c1c1e` | Texto principal (16.8:1) |
| `--app-text-secondary` | `rgba(28,28,30,0.80)` | Texto secundario (8.2:1) |
| `--app-text-muted` | `rgba(28,28,30,0.65)` | Texto terciario (5.4:1) |
| `--app-success` | `#16a34a` | Éxito (4.7:1) |
| `--app-success-bg` | `rgba(22,163,74,0.10)` | Fondo éxito |
| `--app-warning` | `#b45309` | Advertencia |
| `--app-error` | `#dc2626` | Error |
| `--app-error-text` | `#b91c1c` | Texto error |
| `--app-error-surface` | `rgba(220,38,38,0.10)` | Fondo error |
| `--app-focus-ring` | `rgba(249,115,22,0.30)` | Halo foco |
| `--app-menu-bg` | `#1c1c1e` | Fondo menú |
| `--app-menu-text` | `#ffffff` | Texto menú |
| `--app-menu-text-muted` | `rgba(255,255,255,0.65)` | Texto menú secundario |

### Dark

| Token | Valor |
|-------|-------|
| `--app-bg-start` | `#000000` |
| `--app-bg-mid` | `#0a0a0a` |
| `--app-bg-end` | `#141414` |
| `--app-surface` | `#1c1c1e` |
| `--app-surface-hover` | `#252528` |
| `--app-border` | `rgba(255,255,255,0.10)` |
| `--app-border-strong` | `rgba(255,255,255,0.30)` |
| `--app-border-focus` | `#FB923C` |
| `--app-placeholder` | `#a3aab5` |
| `--app-primary` | `#F97316` |
| `--app-secondary` | `#FB923C` |
| `--app-accent` | `#EA580C` |
| `--app-cta-gradient` | `linear-gradient(135deg, #EA580C, #F97316)` |
| `--app-cta-gradient-hover` | `linear-gradient(135deg, #C2410C, #EA580C)` |
| `--app-cta-gradient-active` | `linear-gradient(135deg, #9A3412, #C2410C)` |
| `--app-text` | `#ffffff` |
| `--app-text-secondary` | `rgba(255,255,255,0.80)` |
| `--app-text-muted` | `rgba(255,255,255,0.65)` |
| `--app-success` | `#4ADE80` (7.2:1) |
| `--app-success-bg` | `rgba(74,222,128,0.10)` |
| `--app-warning` | `#f59e0b` |
| `--app-error` | `#ef4444` |
| `--app-error-text` | `#fecaca` |
| `--app-error-surface` | `rgba(239,68,68,0.10)` |
| `--app-focus-ring` | `rgba(249,115,22,0.35)` |
| `--app-menu-bg` | `#0a0a0a` |
| `--app-menu-text` | `#ffffff` |
| `--app-menu-text-muted` | `rgba(255,255,255,0.65)` |

---

## 4. Tipografía

Stack del sistema. No se usan Google Fonts.

```css
--ion-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

Escala (clases utilitarias en `global.scss`):

| Clase | Uso |
|-------|-----|
| `.page-title` | `text-2xl font-bold` + `color: var(--app-text)` |
| `.page-subtitle` | `text-base leading-relaxed` + `color: var(--app-text-muted)` |

---

## 5. Espaciado y dimensiones

| Elemento | Valor |
|----------|-------|
| Ancho máximo contenido | `420px` |
| Padding lateral | `1.5rem` (`px-6` en `page-inner`) |
| Gap entre grupos | `1.5rem` (`gap-6` en `page-inner`) |
| Alto de input | `64px` |
| Radio input | `16px` |
| Alto botón CTA | `64px` |
| Radio botón CTA | `18px` |
| Radio tarjeta | `32px` (`rounded-2xl` = 16px, ver nota) |
| Padding tarjeta | `1.25rem` |
| Radio borde tarjeta | `0.75rem` (Tailwind `rounded-2xl` ≈ 12px) |
| Target táctil mínimo | `44×44px` |
| Alto mínimo botón fantasma | `56px` |

> **Nota:** Las tarjetas usan `rounded-2xl` de Tailwind (16px en pantalla 1×), no 32px como dice el doc original.

---

## 6. Componentes base

### 6.1 Botón principal (`.btn-primary`)

```css
background: var(--app-cta-gradient);  /* naranja degradado */
min-height: 64px;
border-radius: 18px;
font-weight: bold, uppercase, tracking-wide;
box-shadow: 0 8px 24px rgba(249,115,22,0.30);
```

Estados:
- **Hover:** `--box-shadow` aumenta, `translateY(-1px)`
- **Active:** `translateY(0)`
- **Disabled:** `opacity: 0.45`, `box-shadow: none`

### 6.2 Botón fantasma (`.btn-ghost`)

```css
background: transparent;
min-height: 56px;
border-radius: 16px;
color: var(--app-text);
```
- Hover: `--background: var(--app-surface-hover)`
- Active: `scale(0.98)`

### 6.3 Input base (`.input-base`)

```css
background: var(--app-surface);
border: 2px solid var(--app-border-strong);
border-radius: 16px;
min-height: 64px;
color: var(--app-text);
placeholder: var(--app-placeholder);
```

Estados:
- **Focus:** `border-color: var(--app-border-focus)`, `box-shadow: 0 0 0 4px var(--app-focus-ring)`

### 6.4 Tarjeta (`.card`)

```css
background: var(--app-surface);
border: 1px solid var(--app-border);
border-radius: 0.75rem;  /* rounded-2xl */
padding: 1.25rem;
```

Variantes:
- `.card-interactive` → `cursor-pointer` + hover background
- `.card-selected` → `border-color: var(--app-primary)` + fondo naranja translúcido

### 6.5 Pill de error (`.error-pill`)

```css
background: var(--app-error-surface);
border: 1px solid var(--app-error-border);
color: var(--app-error-text);
border-radius: 0.75rem;
padding: 0.75rem 1rem;
```

### 6.6 Pill de éxito (`.success-pill`)

```css
background: var(--app-success-bg);
border: 1px solid var(--app-success-border);
color: var(--app-success);
border-radius: 0.75rem;
```

### 6.7 Session badge (`.session-badge`)

```css
background: rgba(34,197,94,0.10);
color: var(--app-success);
border-radius: 9999px;  /* pill */
padding: 0.5rem 1rem;
font-size: 0.875rem;
```

---

## 7. Layout

### Estructura de página

```html
<ion-header>         ← toolbar glass con borde
  <ion-toolbar>
    <ion-buttons slot="start"> <ion-menu-button> </ion-buttons>
    <ion-title>
    <ion-buttons slot="end">  <ion-button back/extra> </ion-buttons>
  </ion-toolbar>
</ion-header>

<ion-content style="--background: var(--app-bg-gradient);">
  <div class="page-inner">   ← max-w-[420px] mx-auto px-6 gap-6
    ... contenido ...
  </div>
</ion-content>
```

### Menú hamburguesa

Fondo: `var(--app-menu-bg)` (#1c1c1e en light, #0a0a0a en dark).
Items: `.menu-theme-item` y `.menu-logout-item`.

---

## 8. Override de Ionic

### Variables globales Ionic

```scss
:root {
  --ion-background-color: var(--app-bg-start);
  --ion-text-color: var(--app-text);
  --ion-color-primary: var(--app-primary);
  --ion-color-primary-contrast: #ffffff;
  --ion-item-background: transparent;
  --ion-card-background: var(--app-surface);
}

:root {
  --ion-toolbar-background: var(--app-surface);
  --ion-toolbar-border-color: var(--app-border);
  --ion-toolbar-text-color: var(--app-text);
}
```

### Fuentes Ionic

No se importan Google Fonts. Ionic usa `--ion-font-family`.

---

## 9. Accesibilidad

- **Contraste:** todos los textos principales ≥4.5:1 (WCAG AA). La doc de tokens indica la relación en cada tema.
- **Target táctil mínimo:** 44×44px en todos los interactivos.
- **Focus visible:** `box-shadow: 0 0 0 4px var(--app-focus-ring)` en inputs y botones.
- **Sin emojis como iconos:** se usan Ionicons exclusivamente.
- **`prefers-reduced-motion`:** las transiciones de 150-300ms son rápidas; si el usuario prefiere menos movimiento, el navegador lo respeta automáticamente al ser valores fijos (no hay animaciones basadas en scroll o parallax).

---

## 10. Archivos del sistema

| Archivo | Propósito |
|---------|-----------|
| `src/theme/variables.scss` | Tokens CSS light/dark + overrides de Ionic |
| `src/global.scss` | Clases utilitarias Tailwind `@layer components` |
| `src/app/state/theme/theme.facade.ts` | Lógica de toggle de tema + persistencia |
| `src/app/app.component.ts` | Toggle en el menú |
| `src/capacitor.config.ts` | Configuración de `StatusBar` nativo |

---

## 11. Ejemplo de uso en una página

```html
<ion-content style="--background: var(--app-bg-gradient);">
  <div class="page-inner">

    <h2 class="page-title">Título de sección</h2>
    <p class="page-subtitle">Texto secundario explicativo</p>

    <div class="card">
      <div class="store-row">
        <span class="store-label">Label</span>
        <span class="store-value">Valor</span>
      </div>
    </div>

    <ion-button expand="block" class="btn-primary">
      Acción principal
    </ion-button>

  </div>
</ion-content>
```

```scss
// Scoped page styles (si se necesitan)
.my-section {
  // Usar tokens, no hardcodear colores
  color: var(--app-text);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 0.75rem;
}
```
