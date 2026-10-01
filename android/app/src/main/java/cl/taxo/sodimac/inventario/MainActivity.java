package cl.taxo.sodimac.inventario;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Va ANTES del super: el bridge lee la lista de plugins al construirse,
        // y registrarlo después lo deja fuera sin ningún error visible — la
        // llamada desde JS falla recién en tiempo de ejecución.
        registerPlugin(ActualizadorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
