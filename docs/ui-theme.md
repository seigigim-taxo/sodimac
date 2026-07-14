# Design System — Sodimac PDA Control de Inventario

> Documento generado con el apoyo de la skill **UI/UX Pro Max**, adaptado al estilo ya aplicado en la pantalla de login.

## 1. Resumen

- **Estilo visual:** Glassmorphism suave sobre fondo oscuro profundo.
- **Sensación:** Moderna, premium, técnica y legible en condiciones de bodega/tienda.
- **Modo:** Dark-first. La app siempre se presenta en modo oscuro; no hay alternancia de tema.
- **Objetivo:** Que todas las pantallas (login, tienda, eventos, muestras, zonas, conteo, cierre) se vean como parte del mismo sistema.

## 2. Principios de diseño

1. **Fondo profundo, capas translúcidas.** El fondo es un degradado oscuro; las tarjetas y superficies usan vidrio esmerilado (`backdrop-filter`).
2. **Toques grandes.** Los operadores usan la app con guantes o en movimiento: botones e inputs de **64 px** de alto, targets táctiles mínimo **44 px**.
3. **Acentos vibrantes.** Morado, índigo y rosa como gradiente de acción; verde/ámbar para estados.
4. **Contraste accesible.** Texto principal blanco; textos secundarios con opacidad controlada. Relación de contraste mínima **4.5:1**.
5. **Movimiento contenido.** Transiciones de **150-300 ms**; respetar `prefers-reduced-motion`.

## 3. Paleta de colores (tokens)

| Token | Valor | Uso |
|-------|-------|-----|
| `--app-bg-start` | `#0f172a` | Inicio del degradado de fondo |
| `--app-bg-mid` | `#1e1b4b` | Punto medio del degradado |
| `--app-bg-end` | `#312e81` | Fin del degradado de fondo |
| `--app-surface` | `rgba(255, 255, 255, 0.08)` | Fondo glass de tarjetas |
| `--app-surface-hover` | `rgba(255, 255, 255, 0.10)` | Superficie glass al hacer hover |
| `--app-border` | `rgba(255, 255, 255, 0.16)` | Bordes glass |
| `--app-border-strong` | `rgba(255, 255, 255, 0.20)` | Bordes de inputs |
| `--app-border-focus` | `rgba(167, 139, 250, 0.60)` | Borde de input enfocado |
| `--app-primary` | `#6366f1` | Índigo — color primario sólido |
| `--app-secondary` | `#8b5cf6` | Violeta — color secundario |
| `--app-accent` | `#ec4899` | Rosa — acento del gradiente CTA |
| `--app-cta-gradient` | `linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)` | Degradado principal de botones |
| `--app-text` | `#ffffff` | Texto principal |
| `--app-text-secondary` | `rgba(255, 255, 255, 0.70)` | Texto secundario |
| `--app-text-muted` | `rgba(255, 255, 255, 0.55)` | Texto terciario / ayuda |
| `--app-success` | `#22c55e` | Éxito / cantidad correcta |
| `--app-warning` | `#f59e0b` | Advertencia |
| `--app-error` | `#ef4444` | Error |
| `--app-error-text` | `#fecaca` | Texto dentro de pills de error |
| `--app-error-surface` | `rgba(239, 68, 68, 0.12)` | Fondo de pills de error |
| `--app-focus-ring` | `rgba(167, 139, 250, 0.15)` | Halo de foco |

## 4. Tipografía

- **Pareja recomendada por UI/UX Pro Max:** `Rubik` (títulos) + `Nunito Sans` (cuerpo) — *E-commerce Clean*.
- **Fallback offline:** stack de sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- **Escala:**
  - **Display / brand:** `2 rem`, peso `800`.
  - **H1 de página:** `1.75 rem`, peso `700`.
  - **H2 / sección:** `1.25 rem`, peso `700`.
  - **Cuerpo:** `1 rem`, peso `400`.
  - **Pequeño:** `0.875 rem`, peso `400/600`.
  - **Mini:** `0.8125 rem`, peso `400`.

## 5. Espaciado y dimensiones

| Elemento | Valor |
|----------|-------|
| Ancho máximo de contenido móvil | `420 px` |
| Padding lateral base | `1.5 rem` |
| Radio de tarjeta glass | `32 px` |
| Padding interno de tarjeta | `2.5 rem 1.75 rem` |
| Alto de input | `64 px` |
| Radio de input | `16 px` |
| Padding interno de input | `20 px 1 rem` |
| Alto de botón principal | `64 px` |
| Radio de botón | `18 px` |
| Espacio entre grupos de input | `1.25 rem` |
| Target táctil mínimo | `44 x 44 px` |

## 6. Efectos y elevación

- **Glass card:**
  - `background: rgba(255, 255, 255, 0.08)`
  - `border: 1px solid rgba(255, 255, 255, 0.16)`
  - `backdrop-filter: blur(24px)`
  - `box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`
- **Input enfocado:** halo de `0 0 0 4px var(--app-focus-ring)`.
- **Botón CTA:** sombra de resplandor `0 12px 32px rgba(139, 92, 246, 0.35)`.
- **Transiciones:** `150-300 ms ease`, preferiblemente sobre `transform` y `opacity`.

## 7. Componentes base

### 7.1 Botón principal (`app-button`)

Fondo degradado, texto blanco, alto `64 px`, radio `18 px`, sombra de resplandor. En hover: degradado más intenso y sombra más grande. Deshabilitado: fondo translúcido gris, sin sombra.

### 7.2 Input (`app-input`)

Fondo translúcido, borde `1px`, radio `16 px`, altura `64 px`, etiqueta flotante. Foco: borde violeta + halo.

### 7.3 Tarjeta glass (`glass-card`)

Superficie esmerilada con borde translúcido y sombra profunda. Usada para formularios, resúmenes y paneles.

### 7.4 Pill de error (`error-pill`)

Fondo rojo translúcido, borde rojo translúcido, texto rojo claro, bordes redondeados `12 px`, con icono a la izquierda.

### 7.5 Lista de selección (`selectable-list-item`)

Fondo glass, borde sutil, radio `16 px`, altura mínima `64 px`. Estado activo/selected: borde violeta + fondo ligeramente más claro.

### 7.6 Chips / badges (`chip`)

Fondo glass, radio `9999 px`, altura `32 px`, texto pequeño. Variantes: `chip-primary`, `chip-success`, `chip-warning`, `chip-error`.

## 8. Aplicación global en Ionic

- Definir los tokens en `src/theme/variables.scss` bajo `:root`.
- Sobreescribir variables de Ionic:
  - `--ion-background-color: var(--app-bg-start)`
  - `--ion-text-color: var(--app-text)`
  - `--ion-color-primary: var(--app-primary)`
  - `--ion-color-secondary: var(--app-secondary)`
  - `--ion-color-tertiary: var(--app-accent)`
  - `--ion-color-success`, `--ion-color-warning`, `--ion-color-danger`.
- Importar `dark.always.css` en `src/global.scss` para que los componentes Ionic usen modo oscuro permanentemente.
- Usar las clases utilitarias globales en cada página; no repetir valores hardcodeados.

## 9. Accesibilidad y UX

- Todos los botones/iconos interactivos deben tener target táctil visible.
- Los inputs deben tener etiquetas asociadas.
- No usar emojis como iconos; usar Ionicons o SVG.
- Respetar `prefers-reduced-motion`: si está activo, desactivar transiciones y blur animado.
- Asegurar que el texto sobre fondo glass mantenga contraste 4.5:1.

## 10. Referencias de skill

- **Design system base generado con UI/UX Pro Max:**
  - Query: `"inventory PDA retail warehouse glassmorphism dark modern"`
  - Flags: `--design-system --project-name "Sodimac PDA Control de Inventario" --format markdown`
- **Búsquedas complementarias usadas:**
  - `--domain style "glassmorphism dark"` → estilo glassmorphism + dark mode OLED.
  - `--domain color "fintech dark"` → fondo `#0F172A` con acentos vibrantes.
  - `--domain typography "modern technical retail"` → pareja `Rubik` + `Nunito Sans` (*E-commerce Clean*).

## 11. Ejemplo de uso en una página

```scss
.my-page {
  --background: linear-gradient(135deg, var(--app-bg-start) 0%, var(--app-bg-mid) 40%, var(--app-bg-end) 100%);

  .page-card {
    @extend .glass-card;
  }

  .action-button {
    @extend .app-button;
  }
}
```
