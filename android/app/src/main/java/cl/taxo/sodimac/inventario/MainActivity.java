package cl.taxo.sodimac.inventario;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.lang.reflect.Method;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Va ANTES del super: el bridge lee la lista de plugins al construirse,
        // y registrarlo después lo deja fuera sin ningún error visible — la
        // llamada desde JS falla recién en tiempo de ejecución.
        registerPlugin(ActualizadorPlugin.class);
        super.onCreate(savedInstanceState);

        // PDA con teclado físico: el teclado virtual nunca debe mostrarse,
        // aunque el usuario siga escribiendo en un input. A nivel nativo es
        // determinista (el approach inputmode="none" vía JS es reactivo y la
        // WebView lo reabre al inyectar texto).
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // setShowSoftInputOnFocus es un método @hide del framework: no está
            // en el android.jar público de compilación, así que se invoca por
            // reflexión (disponible en el dispositivo real).
            try {
                Method m = View.class.getMethod("setShowSoftInputOnFocus", boolean.class);
                m.invoke(webView, false);
            } catch (Exception ignored) {
                // Fallback silencioso: si el método no está disponible, el
                // teclado lo sigue controlando el inputmode="none" del HTML.
            }
        }
    }
}
