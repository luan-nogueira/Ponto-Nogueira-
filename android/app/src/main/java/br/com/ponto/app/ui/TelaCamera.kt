package br.com.ponto.app.ui

import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import br.com.ponto.app.dados.TipoBatida
import java.io.File

/** Selfie obrigatória na batida (câmera frontal, foto pequena para economizar dados). */
@Composable
fun TelaCamera(tipo: TipoBatida, novoArquivo: () -> File, aoCapturar: (File?) -> Unit, aoCancelar: () -> Unit) {
    val contexto = LocalContext.current
    val dono = LocalLifecycleOwner.current
    var tirando by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    val captura = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .setJpegQuality(70)
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                    .build()
            )
            .build()
    }
    val previa = remember { PreviewView(contexto).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }

    DisposableEffect(dono) {
        val futuro = ProcessCameraProvider.getInstance(contexto)
        futuro.addListener({
            val provedor = futuro.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previa.surfaceProvider) }
            val camera = if (provedor.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
            runCatching {
                provedor.unbindAll()
                provedor.bindToLifecycle(dono, camera, preview, captura)
            }.onFailure { erro = "Não foi possível abrir a câmera" }
        }, ContextCompat.getMainExecutor(contexto))
        onDispose { runCatching { futuro.get().unbindAll() } }
    }

    Column(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()) {
        Text(
            "Selfie para ${tipo.rotulo.lowercase()}",
            color = Color.White, fontSize = 18.sp, modifier = Modifier.padding(16.dp),
        )
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            AndroidView(factory = { previa }, modifier = Modifier.fillMaxSize())
            erro?.let { Text(it, color = Color.White) }
        }
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = aoCancelar, modifier = Modifier.weight(1f).height(56.dp)) { Text("Cancelar", color = Color.White) }
            Button(
                enabled = !tirando && erro == null,
                modifier = Modifier.weight(2f).height(56.dp),
                onClick = {
                    tirando = true
                    val arquivo = novoArquivo()
                    captura.takePicture(
                        ImageCapture.OutputFileOptions.Builder(arquivo).build(),
                        ContextCompat.getMainExecutor(contexto),
                        object : ImageCapture.OnImageSavedCallback {
                            override fun onImageSaved(r: ImageCapture.OutputFileResults) = aoCapturar(arquivo)
                            override fun onError(e: ImageCaptureException) {
                                tirando = false
                                erro = "Erro ao tirar a foto, tente de novo"
                            }
                        },
                    )
                },
            ) { Text(if (tirando) "Registrando…" else "Tirar foto e bater ponto", fontSize = 16.sp) }
        }
    }
}
