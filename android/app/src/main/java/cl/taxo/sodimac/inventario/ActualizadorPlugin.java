package cl.taxo.sodimac.inventario;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/*
 * Instalación de una APK descargada.
 *
 * Existe porque no hay plugin de Capacitor —ni oficial ni comunitario
 * mantenido— que haga esto. Es lo único de la autoactualización que no se puede
 * escribir en TypeScript: entregarle un archivo al instalador del sistema
 * requiere un Intent y un content:// URI, y ninguna de las dos cosas se puede
 * armar desde el WebView.
 *
 * Son tres operaciones y nada más. La descarga, la verificación del hash y toda
 * la decisión de cuándo actualizar viven del lado de Angular, donde se pueden
 * probar.
 */
@CapacitorPlugin(name = "Actualizador")
public class ActualizadorPlugin extends Plugin {

    /*
     * Desde Android 8 "instalar apps desconocidas" se concede por app y a mano;
     * no alcanza con declarar el permiso en el manifiesto. Preguntar antes evita
     * mandar al operador a Ajustes cuando ya lo concedió, que es la mayoría de
     * las veces: se concede una sola vez por equipo y queda para siempre.
     */
    @PluginMethod
    public void puedeInstalar(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("valor", tienePermiso());
        call.resolve(ret);
    }

    /*
     * Abre la pantalla de Ajustes del permiso, ya filtrada a esta app.
     *
     * Se manda el paquete en la URI a propósito: sin eso Android abre la lista
     * completa de aplicaciones y el operador tiene que buscar la nuestra entre
     * decenas. Con el paquete, cae directo en el switch que tiene que activar.
     *
     * No espera el resultado. El operador vuelve con el botón de atrás cuando
     * quiere, así que quien reanuda el flujo es la capa de Angular al detectar
     * que la app volvió a primer plano.
     */
    @PluginMethod
    public void abrirAjustesInstalacion(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }

        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo abrir la pantalla de permisos", e);
        }
    }

    /*
     * Le pasa la APK al instalador del sistema.
     *
     * El archivo NO se puede entregar como file://: desde Android 7 eso lanza
     * FileUriExposedException y la app se cae. Va como content:// a través del
     * FileProvider que ya está declarado en el manifiesto, con permiso de
     * lectura otorgado al instalador para esa URI puntual.
     *
     * A partir de acá el control es del sistema: muestra su diálogo de
     * confirmación y, si el operador acepta, cierra esta app para reemplazarla.
     * No hay callback de "instalado con éxito" — la app simplemente muere y
     * vuelve a arrancar en la versión nueva.
     */
    @PluginMethod
    public void instalar(PluginCall call) {
        String ruta = call.getString("ruta");
        if (ruta == null || ruta.isEmpty()) {
            call.reject("Falta la ruta del archivo a instalar");
            return;
        }

        if (!tienePermiso()) {
            call.reject("SIN_PERMISO");
            return;
        }

        File apk = new File(Uri.parse(ruta).getPath() != null ? Uri.parse(ruta).getPath() : ruta);
        if (!apk.exists()) {
            call.reject("El archivo descargado no está donde se esperaba: " + apk.getAbsolutePath());
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo abrir el instalador de Android", e);
        }
    }

    /*
     * SHA-256 del archivo descargado.
     *
     * Va acá y no en Angular porque crypto.subtle no tiene API de streaming:
     * exige el archivo entero en un ArrayBuffer. Leer 28 MB desde Filesystem
     * implica pasarlos como base64 —otro 33% arriba— y tener las dos copias
     * vivas al mismo tiempo. En Java se lee de a 8 KB y la memoria no se mueve.
     */
    @PluginMethod
    public void hash(PluginCall call) {
        String ruta = call.getString("ruta");
        if (ruta == null || ruta.isEmpty()) {
            call.reject("Falta la ruta del archivo");
            return;
        }

        File archivo = new File(Uri.parse(ruta).getPath() != null ? Uri.parse(ruta).getPath() : ruta);
        if (!archivo.exists()) {
            call.reject("El archivo no existe: " + archivo.getAbsolutePath());
            return;
        }

        try (java.io.FileInputStream in = new java.io.FileInputStream(archivo)) {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int leidos;
            while ((leidos = in.read(buffer)) != -1) {
                md.update(buffer, 0, leidos);
            }

            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest()) {
                // El %02x es lo que hace que un byte como 0x0a salga "0a" y no
                // "a": sin el cero a la izquierda el hash queda corrido y nunca
                // coincide, con un error imposible de leer.
                hex.append(String.format("%02x", b));
            }

            JSObject ret = new JSObject();
            ret.put("valor", hex.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo calcular el hash del archivo", e);
        }
    }

    private boolean tienePermiso() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }
        return getContext().getPackageManager().canRequestPackageInstalls();
    }
}
