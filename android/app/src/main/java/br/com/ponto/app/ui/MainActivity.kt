package br.com.ponto.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle

class MainActivity : ComponentActivity() {
    private val vm: PontoViewModel by viewModels()
    private var permissoes by mutableStateOf(Permissoes())
    private var jaPediu = false

    private val pedirBasicas = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        lerPermissoes()
        vm.aoAparecer()
    }
    private val pedirSegundoPlano = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        lerPermissoes()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val estado by vm.estado.collectAsStateWithLifecycle()
            TemaPonto {
                when {
                    !estado.logado -> TelaLogin(estado.erro, vm::entrar)
                    estado.fotografando != null -> TelaCamera(
                        tipo = estado.fotografando!!,
                        novoArquivo = vm::arquivoFoto,
                        aoCapturar = vm::confirmarBatida,
                        aoCancelar = vm::cancelarFoto,
                    )
                    else -> TelaPrincipal(
                        estado = estado,
                        permissoes = permissoes,
                        pedirPermissoes = ::pedirPermissoes,
                        aoBater = vm::iniciarBatida,
                        aoAtualizar = { vm.aoAparecer() },
                        aoFecharAviso = vm::fecharAvisos,
                        aoSair = vm::sair,
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        lerPermissoes()
        // pede uma vez sozinho; depois só pelo botão (o diálogo também dispara onResume)
        if (!permissoes.basicas && !jaPediu) {
            jaPediu = true
            pedirPermissoes()
        } else {
            vm.aoAparecer()
        }
    }

    override fun onPause() {
        super.onPause()
        vm.aoSumir()
    }

    private fun tem(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun lerPermissoes() {
        val energia = getSystemService(PowerManager::class.java)
        permissoes = Permissoes(
            basicas = tem(Manifest.permission.ACCESS_FINE_LOCATION) && tem(Manifest.permission.CAMERA),
            segundoPlano = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || tem(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
            bateria = energia.isIgnoringBatteryOptimizations(packageName),
        )
    }

    /**
     * Pede as permissões em etapas, como o Android exige. Em celular gerenciado
     * (Device Owner) a política do MDM já concede tudo e nada aparece.
     */
    private fun pedirPermissoes() {
        when {
            !permissoes.basicas -> pedirBasicas.launch(
                buildList {
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
                    add(Manifest.permission.ACCESS_COARSE_LOCATION)
                    add(Manifest.permission.CAMERA)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
                }.toTypedArray()
            )
            !permissoes.segundoPlano && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
                pedirSegundoPlano.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            !permissoes.bateria -> startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            )
        }
    }
}

data class Permissoes(val basicas: Boolean = true, val segundoPlano: Boolean = true, val bateria: Boolean = true) {
    val todas get() = basicas && segundoPlano && bateria
}
