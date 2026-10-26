package br.com.ponto.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.com.ponto.app.dados.Batida
import coil.compose.AsyncImage
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import br.com.ponto.app.dados.TipoBatida
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val Verde = Color(0xFF047857)
private val VerdeClaro = Color(0xFFD1FAE5)
private val Vermelho = Color(0xFFB91C1C)
private val VermelhoClaro = Color(0xFFFEE2E2)
private val Ambar = Color(0xFFB45309)
private val fuso = ZoneId.of("America/Sao_Paulo")
private val formatoHora = DateTimeFormatter.ofPattern("HH:mm").withZone(fuso)
private val formatoDataHora = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss").withZone(fuso)

@Composable
fun TemaPonto(conteudo: @Composable () -> Unit) {
    MaterialTheme(colorScheme = lightColorScheme(primary = Verde, secondary = Verde), content = conteudo)
}

// Login --------------------------------------------------------------------------

@Composable
fun TelaLogin(erroInicial: String?, aoEntrar: (String, String, (String?) -> Unit) -> Unit) {
    var email by remember { mutableStateOf("") }
    var senha by remember { mutableStateOf("") }
    var erro by remember { mutableStateOf(erroInicial) }
    var enviando by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().systemBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Ponto", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Verde)
        Text("Entre com o e-mail e a senha que a empresa passou.", color = Color.Gray)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = email, onValueChange = { email = it }, label = { Text("E-mail") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = senha, onValueChange = { senha = it }, label = { Text("Senha") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth(),
        )
        erro?.let { Text(it, color = Vermelho, modifier = Modifier.padding(top = 12.dp)) }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                enviando = true
                aoEntrar(email, senha) { e -> erro = e; enviando = false }
            },
            enabled = !enviando && email.isNotBlank() && senha.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text(if (enviando) "Entrando…" else "Entrar") }
    }
}

// Tela principal -------------------------------------------------------------------

@Composable
fun TelaPrincipal(
    estado: EstadoPonto,
    permissoes: Permissoes,
    pedirPermissoes: () -> Unit,
    aoBater: (TipoBatida) -> Unit,
    aoAtualizar: () -> Unit,
    aoFecharAviso: () -> Unit,
    aoSair: () -> Unit,
) {
    var agora by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) { while (true) { agora = Instant.now(); delay(1000) } }
    var confirmarSaida by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize().systemBarsPadding().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                LogoEmpresa(estado.logoUrl, estado.empresa)
                Spacer(Modifier.size(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Olá, ${estado.nome.substringBefore(' ')}", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text(DateTimeFormatter.ofPattern("EEEE, dd/MM", java.util.Locale("pt", "BR")).withZone(fuso).format(agora), color = Color.Gray)
                }
                TextButton(onClick = { confirmarSaida = true }) { Text("Sair") }
            }
        }
        item {
            Text(formatoHora.format(agora), fontSize = 56.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }

        if (!permissoes.todas) {
            item {
                Aviso(
                    texto = when {
                        !permissoes.basicas -> "O app precisa de acesso à localização e à câmera para bater o ponto."
                        !permissoes.segundoPlano -> "Permita a localização \"o tempo todo\" para a empresa acompanhar a jornada."
                        else -> "Desative a economia de bateria para o Ponto, senão o Android interrompe o envio."
                    },
                    botao = "Permitir",
                    aoClicar = pedirPermissoes,
                )
            }
        }

        item { CartaoCerca(estado, aoAtualizar) }

        item {
            val dentro = estado.cerca?.dentro == true
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                estado.proximas.forEach { tipo ->
                    Button(
                        onClick = { aoBater(tipo) },
                        enabled = dentro && !estado.enviando && permissoes.basicas,
                        modifier = Modifier.fillMaxWidth().height(64.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = if (tipo == TipoBatida.SAIDA) ButtonDefaults.buttonColors(containerColor = Ambar) else ButtonDefaults.buttonColors(),
                    ) { Text("Bater ${tipo.rotulo.lowercase()}", fontSize = 18.sp) }
                }
                if (estado.enviando) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("Registrando…")
                    }
                }
                if (!dentro && estado.cerca != null) {
                    Text("O botão só libera quando você está no local de trabalho.", color = Color.Gray, fontSize = 13.sp)
                }
            }
        }

        if (estado.pendentes > 0) {
            item {
                Aviso("${estado.pendentes} batida(s) feitas sem internet aguardando envio. Elas serão enviadas sozinhas quando a conexão voltar.")
            }
        }

        item { Text("Hoje", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp)) }
        if (estado.hoje.isEmpty()) item { Text("Nenhuma batida hoje.", color = Color.Gray) }
        items(estado.hoje, key = { it.id }) { LinhaBatida(it) }
        item {
            Text(
                "A localização é enviada à empresa só entre a entrada e a saída. Cada batida guarda foto, hora e local.",
                fontSize = 12.sp, color = Color.Gray, modifier = Modifier.padding(vertical = 16.dp),
            )
        }
    }

    estado.comprovante?.let { c ->
        val ok = c.status != "rejeitada"
        AlertDialog(
            onDismissRequest = aoFecharAviso,
            confirmButton = { TextButton(onClick = aoFecharAviso) { Text("OK") } },
            title = { Text(if (ok) "${c.tipo.rotulo} registrada" else "Batida recusada", color = if (ok) Verde else Vermelho) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (!ok) Text(c.motivoRejeicao ?: "", fontWeight = FontWeight.SemiBold)
                    if (c.status == "pendente_revisao") Text("Ficou para revisão do gestor.", color = Ambar)
                    Text("Data e hora: ${formatoDataHora.format(instante(c.registradoEm))}")
                    c.local?.let { Text("Local: $it") }
                    if (ok) {
                        Text("${c.empresa ?: ""} ${c.cnpj?.let { "CNPJ $it" } ?: ""}".trim())
                        Text("NSR: ${c.nsr}")
                        c.hash?.let { Text("Código: ${it.take(16)}…", fontSize = 12.sp, color = Color.Gray) }
                    }
                }
            },
        )
    }
    estado.salvaOffline?.let { tipo ->
        AlertDialog(
            onDismissRequest = aoFecharAviso,
            confirmButton = { TextButton(onClick = aoFecharAviso) { Text("OK") } },
            title = { Text("Sem internet") },
            text = { Text("Sua ${tipo.rotulo.lowercase()} foi guardada no celular e será enviada quando a conexão voltar. O gestor vai conferir o horário.") },
        )
    }
    estado.erro?.let { e ->
        AlertDialog(
            onDismissRequest = aoFecharAviso,
            confirmButton = { TextButton(onClick = aoFecharAviso) { Text("OK") } },
            title = { Text("Não foi possível registrar") },
            text = { Text(e) },
        )
    }
    if (confirmarSaida) {
        AlertDialog(
            onDismissRequest = { confirmarSaida = false },
            confirmButton = { TextButton(onClick = { confirmarSaida = false; aoSair() }) { Text("Sair da conta") } },
            dismissButton = { TextButton(onClick = { confirmarSaida = false }) { Text("Cancelar") } },
            title = { Text("Sair da conta?") },
            text = { Text("Você vai precisar do e-mail e da senha para entrar de novo.") },
        )
    }
}

/** Logo da empresa do colaborador (cada empresa cliente tem a sua); sem logo, mostra as iniciais. */
@Composable
private fun LogoEmpresa(url: String?, nome: String) {
    val forma = RoundedCornerShape(10.dp)
    Box(
        Modifier.size(52.dp).clip(forma).background(Color.White).border(1.dp, Color(0xFFE5E7EB), forma),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(model = url, contentDescription = nome, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(4.dp))
        } else {
            Text(nome.take(2).uppercase(), fontWeight = FontWeight.Bold, color = Verde)
        }
    }
}

@Composable
private fun CartaoCerca(estado: EstadoPonto, aoAtualizar: () -> Unit) {
    val cerca = estado.cerca
    val (fundo, cor, titulo) = when {
        estado.semLocal -> Triple(VermelhoClaro, Vermelho, "Nenhum local de trabalho cadastrado")
        cerca == null -> Triple(Color(0xFFF3F4F6), Color.DarkGray, if (estado.buscandoGps) "Buscando sua localização…" else "Localização indisponível")
        cerca.dentro -> Triple(VerdeClaro, Verde, "Você está em ${cerca.local.nome}")
        else -> Triple(VermelhoClaro, Vermelho, "Fora do local de trabalho")
    }
    Card(colors = CardDefaults.cardColors(containerColor = fundo), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).background(cor, CircleShape))
                Spacer(Modifier.size(8.dp))
                Text(titulo, color = cor, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (estado.buscandoGps) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            }
            if (cerca != null && !cerca.dentro) {
                Text("Mais próximo: ${cerca.local.nome}, a ${distancia(cerca.distanciaM)}", modifier = Modifier.padding(top = 4.dp))
            }
            if (estado.semLocal) Text("Fale com o administrador.", modifier = Modifier.padding(top = 4.dp))
            estado.posicao?.precisaoM?.let { Text("Precisão do GPS: ${it.toInt()} m", fontSize = 12.sp, color = Color.Gray) }
            TextButton(onClick = aoAtualizar, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                Text("Atualizar localização")
            }
        }
    }
}

@Composable
private fun LinhaBatida(b: Batida) {
    Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(formatoHora.format(instante(b.registradoEm)), fontWeight = FontWeight.SemiBold, modifier = Modifier.size(width = 64.dp, height = 20.dp))
            Text(b.tipo.rotulo, modifier = Modifier.weight(1f))
            val (texto, cor) = when (b.status) {
                "valida" -> "OK" to Verde
                "pendente_revisao" -> "Em revisão" to Ambar
                else -> "Recusada" to Vermelho
            }
            Text(texto, color = cor, fontSize = 13.sp)
        }
        b.motivoRejeicao?.let { Text(it, fontSize = 12.sp, color = Color.Gray) }
        HorizontalDivider()
    }
}

@Composable
private fun Aviso(texto: String, botao: String? = null, aoClicar: () -> Unit = {}) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF3C7)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(texto)
            botao?.let { OutlinedButton(onClick = aoClicar, modifier = Modifier.padding(top = 8.dp)) { Text(it) } }
        }
    }
}

// O servidor manda "2026-10-26T13:19:17.39+00:00"; Instant.parse não aceita esse formato em Androids antigos.
private fun instante(texto: String): Instant = java.time.OffsetDateTime.parse(texto).toInstant()

private fun distancia(m: Double) = if (m < 1000) "${m.toInt()} m" else "%.1f km".format(m / 1000)
