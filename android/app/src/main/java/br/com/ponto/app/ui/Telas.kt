package br.com.ponto.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import br.com.ponto.app.dados.Batida
import br.com.ponto.app.dados.Comprovante
import br.com.ponto.app.dados.TipoBatida
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// Tema preto e branco. Vermelho só para recusa e erro.
private val Tinta = Color(0xFF0A0A0A)
private val Papel = Color(0xFFFAFAFA)
private val Linha = Color(0xFFE7E7E7)
private val Suave = Color(0xFF737373)
private val Perigo = Color(0xFFDC2626)
private val PerigoClaro = Color(0xFFFEF2F2)

private val fuso = ZoneId.of("America/Sao_Paulo")
private val ptBR = Locale("pt", "BR")
private val formatoHora = DateTimeFormatter.ofPattern("HH:mm").withZone(fuso)
private val formatoSegundos = DateTimeFormatter.ofPattern("ss").withZone(fuso)
private val formatoData = DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", ptBR).withZone(fuso)
private val formatoDataHora = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm:ss").withZone(fuso)

@Composable
fun TemaPonto(conteudo: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Tinta, onPrimary = Color.White, secondary = Tinta,
            background = Papel, surface = Color.White, onSurface = Tinta, error = Perigo,
        ),
    ) {
        Box(Modifier.fillMaxSize().background(Papel)) { conteudo() }
    }
}

// Componentes ---------------------------------------------------------------------

/** Botão grande que encolhe levemente ao toque. */
@Composable
private fun BotaoPonto(
    texto: String,
    aoClicar: () -> Unit,
    modifier: Modifier = Modifier,
    habilitado: Boolean = true,
    escuro: Boolean = true,
    carregando: Boolean = false,
) {
    val interacao = remember { MutableInteractionSource() }
    val pressionado by interacao.collectIsPressedAsState()
    val escala by animateFloatAsState(if (pressionado) 0.96f else 1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy), label = "escala")
    val fundo by animateColorAsState(
        when {
            !habilitado -> Color(0xFFEDEDED)
            escuro -> Tinta
            else -> Color.White
        },
        label = "fundo",
    )
    val corTexto = when {
        !habilitado -> Color(0xFFA3A3A3)
        escuro -> Color.White
        else -> Tinta
    }
    Box(
        modifier
            .scale(escala)
            .clip(RoundedCornerShape(20.dp))
            .background(fundo)
            .then(if (!escuro && habilitado) Modifier.border(1.5.dp, Tinta, RoundedCornerShape(20.dp)) else Modifier)
            .clickable(interactionSource = interacao, indication = null, enabled = habilitado && !carregando, onClick = aoClicar)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(carregando, label = "carregando") { c ->
            if (c) CircularProgressIndicator(Modifier.size(22.dp), color = corTexto, strokeWidth = 2.dp)
            else Text(texto, color = corTexto, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Bolinha com onda pulsando (localização ao vivo). */
@Composable
private fun PontoVivo(cor: Color, tamanho: Int = 10) {
    val onda = rememberInfiniteTransition(label = "onda")
    val progresso by onda.animateFloat(
        0f, 1f, infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Restart), label = "p",
    )
    Box(Modifier.size((tamanho * 2.6).dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(tamanho.dp).scale(1f + progresso * 1.6f).alpha(0.5f * (1 - progresso)).background(cor, CircleShape))
        Box(Modifier.size(tamanho.dp).background(cor, CircleShape))
    }
}

@Composable
private fun Rotulo(texto: String, cor: Color = Suave) {
    Text(texto.uppercase(), color = cor, fontSize = 11.sp, letterSpacing = 1.4.sp, fontWeight = FontWeight.Medium)
}

// Login --------------------------------------------------------------------------

@Composable
fun TelaLogin(erroInicial: String?, aoEntrar: (String, String, (String?) -> Unit) -> Unit) {
    var email by remember { mutableStateOf("") }
    var senha by remember { mutableStateOf("") }
    var erro by remember { mutableStateOf(erroInicial) }
    var enviando by remember { mutableStateOf(false) }
    var visivel by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visivel = true }

    val cores = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Tinta, unfocusedBorderColor = Linha, focusedLabelColor = Tinta, cursorColor = Tinta,
    )

    Column(Modifier.fillMaxSize().background(Color.White)) {
        // faixa preta com relógio
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp)).background(Tinta)
                .statusBarsPadding().padding(28.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(Color.White, CircleShape))
                Spacer(Modifier.width(8.dp))
                Text("Ponto", color = Color(0xFFA3A3A3), fontSize = 14.sp)
            }
            Spacer(Modifier.height(48.dp))
            Relogio(Color.White, 64)
            Spacer(Modifier.height(8.dp))
            Text("Cada batida com foto, local e hora certa.", color = Color(0xFFA3A3A3), fontSize = 15.sp)
        }

        AnimatedVisibility(visivel, enter = fadeIn(tween(500, 150)) + slideInVertically(tween(500, 150)) { it / 6 }) {
            Column(Modifier.padding(28.dp).navigationBarsPadding()) {
                Text("Entrar", fontSize = 28.sp, fontWeight = FontWeight.SemiBold, color = Tinta)
                Text("Use o e-mail e a senha que a empresa passou.", color = Suave, modifier = Modifier.padding(top = 4.dp))
                Spacer(Modifier.height(24.dp))
                OutlinedTextField(
                    value = email, onValueChange = { email = it }, label = { Text("E-mail") }, singleLine = true,
                    shape = RoundedCornerShape(14.dp), colors = cores,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = senha, onValueChange = { senha = it }, label = { Text("Senha") }, singleLine = true,
                    shape = RoundedCornerShape(14.dp), colors = cores,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth(),
                )
                AnimatedVisibility(erro != null) {
                    Text(erro ?: "", color = Perigo, modifier = Modifier.padding(top = 12.dp))
                }
                Spacer(Modifier.height(20.dp))
                BotaoPonto(
                    texto = "Entrar",
                    carregando = enviando,
                    habilitado = email.isNotBlank() && senha.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                    aoClicar = {
                        enviando = true
                        aoEntrar(email, senha) { e -> erro = e; enviando = false }
                    },
                )
            }
        }
    }
}

@Composable
private fun Relogio(cor: Color, tamanho: Int) {
    var agora by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) { while (true) { agora = Instant.now(); delay(1000) } }
    Row(verticalAlignment = Alignment.Bottom) {
        Text(formatoHora.format(agora), color = cor, fontSize = tamanho.sp, fontWeight = FontWeight.Light, letterSpacing = (-2).sp)
        AnimatedContent(
            formatoSegundos.format(agora),
            transitionSpec = { (slideInVertically { -it / 2 } + fadeIn()) togetherWith fadeOut() },
            label = "segundos",
        ) { s ->
            Text(":$s", color = cor.copy(alpha = 0.4f), fontSize = (tamanho * 0.45).sp, fontWeight = FontWeight.Light,
                modifier = Modifier.padding(bottom = (tamanho * 0.12).dp, start = 4.dp))
        }
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
    var confirmarSaida by remember { mutableStateOf(false) }
    var visivel by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visivel = true }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { Cabecalho(estado, aoSair = { confirmarSaida = true }) }

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

        item {
            AnimatedVisibility(visivel, enter = fadeIn(tween(400, 100)) + slideInVertically(tween(400, 100)) { it / 4 }) {
                CartaoCerca(estado, aoAtualizar)
            }
        }

        item {
            val dentro = estado.cerca?.dentro == true
            AnimatedVisibility(visivel, enter = fadeIn(tween(400, 200)) + slideInVertically(tween(400, 200)) { it / 4 }) {
                Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    estado.proximas.forEach { tipo ->
                        BotaoPonto(
                            texto = "Bater ${tipo.rotulo.lowercase()}",
                            aoClicar = { aoBater(tipo) },
                            habilitado = dentro && permissoes.basicas,
                            carregando = estado.enviando,
                            escuro = tipo != TipoBatida.SAIDA,
                            modifier = Modifier.fillMaxWidth().height(68.dp),
                        )
                    }
                    AnimatedVisibility(!dentro && estado.cerca != null, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                        Text(
                            "O botão libera quando você estiver no local de trabalho.",
                            color = Suave, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

        if (estado.pendentes > 0) {
            item {
                Aviso("${estado.pendentes} batida(s) feitas sem internet aguardando envio. Elas serão enviadas sozinhas quando a conexão voltar.")
            }
        }

        item {
            Row(Modifier.padding(start = 20.dp, end = 20.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Hoje", fontWeight = FontWeight.SemiBold, fontSize = 18.sp, modifier = Modifier.weight(1f))
                Rotulo("${estado.hoje.size} batida(s)")
            }
        }
        if (estado.hoje.isEmpty()) {
            item { Text("Nenhuma batida hoje.", color = Suave, modifier = Modifier.padding(horizontal = 20.dp)) }
        }
        items(estado.hoje, key = { it.id }) { b ->
            Box(Modifier.animateItem()) { LinhaBatida(b, ultima = b == estado.hoje.last()) }
        }
        item {
            Text(
                "A localização é enviada à empresa só entre a entrada e a saída. Cada batida guarda foto, hora e local.",
                fontSize = 12.sp, color = Suave, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
        }
    }

    estado.comprovante?.let { DialogoComprovante(it, aoFecharAviso) }
    estado.salvaOffline?.let { tipo ->
        AlertDialog(
            onDismissRequest = aoFecharAviso,
            containerColor = Color.White,
            confirmButton = { TextButton(onClick = aoFecharAviso) { Text("OK", color = Tinta) } },
            title = { Text("Sem internet") },
            text = { Text("Sua ${tipo.rotulo.lowercase()} foi guardada no celular e será enviada quando a conexão voltar. O gestor vai conferir o horário.") },
        )
    }
    estado.erro?.let { e ->
        AlertDialog(
            onDismissRequest = aoFecharAviso,
            containerColor = Color.White,
            confirmButton = { TextButton(onClick = aoFecharAviso) { Text("OK", color = Tinta) } },
            title = { Text("Não foi possível registrar") },
            text = { Text(e) },
        )
    }
    if (confirmarSaida) {
        AlertDialog(
            onDismissRequest = { confirmarSaida = false },
            containerColor = Color.White,
            confirmButton = { TextButton(onClick = { confirmarSaida = false; aoSair() }) { Text("Sair da conta", color = Perigo) } },
            dismissButton = { TextButton(onClick = { confirmarSaida = false }) { Text("Cancelar", color = Tinta) } },
            title = { Text("Sair da conta?") },
            text = { Text("Você vai precisar do e-mail e da senha para entrar de novo.") },
        )
    }
}

@Composable
private fun Cabecalho(estado: EstadoPonto, aoSair: () -> Unit) {
    val agora = remember { Instant.now() }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp)).background(Tinta)
            .statusBarsPadding().padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 28.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            LogoEmpresa(estado.logoUrl, estado.empresa)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(estado.empresa.ifBlank { "Ponto" }, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text("Olá, ${estado.nome.substringBefore(' ')}", color = Color(0xFFA3A3A3), fontSize = 13.sp)
            }
            TextButton(onClick = aoSair) { Text("Sair", color = Color(0xFFA3A3A3)) }
        }
        Spacer(Modifier.height(28.dp))
        Text(formatoData.format(agora).replaceFirstChar { it.uppercase() }, color = Color(0xFFA3A3A3), fontSize = 14.sp)
        Relogio(Color.White, 72)
    }
}

/** Logo da empresa do colaborador (cada empresa cliente tem a sua); sem logo, mostra as iniciais. */
@Composable
private fun LogoEmpresa(url: String?, nome: String) {
    val forma = RoundedCornerShape(14.dp)
    Box(Modifier.size(48.dp).clip(forma).background(Color.White), contentAlignment = Alignment.Center) {
        if (url != null) {
            AsyncImage(model = url, contentDescription = nome, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(4.dp))
        } else {
            Text(nome.take(2).uppercase().ifBlank { "PT" }, fontWeight = FontWeight.Bold, color = Tinta)
        }
    }
}

@Composable
private fun CartaoCerca(estado: EstadoPonto, aoAtualizar: () -> Unit) {
    val cerca = estado.cerca
    val situacao = when {
        estado.semLocal -> 3
        cerca == null -> 0
        cerca.dentro -> 1
        else -> 2
    }
    val fundo by animateColorAsState(if (situacao >= 2) PerigoClaro else Color.White, tween(500), label = "fundo")
    val cor = when (situacao) {
        1 -> Tinta
        0 -> Suave
        else -> Perigo
    }
    Column(
        Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(fundo)
            .border(1.dp, if (situacao >= 2) Perigo.copy(alpha = 0.2f) else Linha, RoundedCornerShape(24.dp))
            .clickable(onClick = aoAtualizar).padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (situacao == 1) PontoVivo(Tinta) else Box(Modifier.size(26.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(10.dp).background(cor, CircleShape))
            }
            Spacer(Modifier.width(6.dp))
            Rotulo(
                when (situacao) {
                    1 -> "No local de trabalho"
                    2 -> "Fora do local"
                    3 -> "Sem local cadastrado"
                    else -> if (estado.buscandoGps) "Buscando GPS" else "GPS indisponível"
                },
                cor,
            )
            Spacer(Modifier.weight(1f))
            if (estado.buscandoGps) CircularProgressIndicator(Modifier.size(16.dp), color = Suave, strokeWidth = 2.dp)
        }
        Spacer(Modifier.height(10.dp))
        AnimatedContent(
            targetState = when (situacao) {
                1 -> cerca!!.local.nome
                2 -> "A ${distancia(cerca!!.distanciaM)} de ${cerca.local.nome}"
                3 -> "Fale com o administrador"
                else -> "Aguardando localização…"
            },
            transitionSpec = { (fadeIn(tween(300)) + slideInVertically { it / 3 }) togetherWith fadeOut(tween(150)) },
            label = "titulo",
        ) { t ->
            Text(t, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = if (situacao >= 2) Perigo else Tinta)
        }
        Row(Modifier.padding(top = 6.dp)) {
            estado.posicao?.precisaoM?.let { Text("Precisão ±${it.toInt()} m", fontSize = 12.sp, color = Suave) }
            Spacer(Modifier.weight(1f))
            Text("Toque para atualizar", fontSize = 12.sp, color = Suave)
        }
    }
}

@Composable
private fun LinhaBatida(b: Batida, ultima: Boolean) {
    val (texto, cor) = when (b.status) {
        "valida" -> "OK" to Tinta
        "pendente_revisao" -> "Em revisão" to Suave
        else -> "Recusada" to Perigo
    }
    Row(Modifier.padding(horizontal = 20.dp).fillMaxWidth()) {
        // linha do tempo
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(24.dp)) {
            Box(
                Modifier.padding(top = 4.dp).size(14.dp).background(if (b.status == "rejeitada") PerigoClaro else Tinta, CircleShape)
                    .border(3.dp, Papel, CircleShape),
            )
            if (!ultima) Box(Modifier.width(1.dp).height(44.dp).background(Linha))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f).padding(bottom = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(formatoHora.format(instante(b.registradoEm)), fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                Spacer(Modifier.width(10.dp))
                Text(b.tipo.rotulo, modifier = Modifier.weight(1f), color = Tinta)
                Text(texto, color = cor, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
            b.motivoRejeicao?.let { Text(it, fontSize = 12.sp, color = Suave) }
        }
    }
}

/** Comprovante com check animado. */
@Composable
private fun DialogoComprovante(c: Comprovante, aoFechar: () -> Unit) {
    val ok = c.status != "rejeitada"
    var mostrar by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { mostrar = true }
    Dialog(onDismissRequest = aoFechar) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Color.White).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AnimatedVisibility(mostrar, enter = scaleIn(spring(dampingRatio = 0.45f, stiffness = 300f)) + fadeIn()) {
                Box(
                    Modifier.size(76.dp).background(if (ok) Tinta else PerigoClaro, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (ok) "✓" else "✕", color = if (ok) Color.White else Perigo, fontSize = 36.sp, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(if (ok) "${c.tipo.rotulo} registrada" else "Batida recusada", fontSize = 22.sp, fontWeight = FontWeight.SemiBold,
                color = if (ok) Tinta else Perigo, textAlign = TextAlign.Center)
            if (!ok) Text(c.motivoRejeicao ?: "", color = Suave, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
            if (c.status == "pendente_revisao") Text("Ficou para revisão do gestor.", color = Suave, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(18.dp))
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Papel).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LinhaComprovante("Data e hora", formatoDataHora.format(instante(c.registradoEm)))
                c.local?.let { LinhaComprovante("Local", it) }
                if (ok) {
                    c.empresa?.let { LinhaComprovante("Empresa", it) }
                    c.cnpj?.let { LinhaComprovante("CNPJ", it) }
                    LinhaComprovante("NSR", c.nsr?.toString() ?: "—")
                    c.hash?.let { LinhaComprovante("Código", it.take(16) + "…") }
                }
            }
            Spacer(Modifier.height(18.dp))
            BotaoPonto("OK", aoFechar, Modifier.fillMaxWidth().height(54.dp))
        }
    }
}

@Composable
private fun LinhaComprovante(rotulo: String, valor: String) {
    Row {
        Text(rotulo, color = Suave, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(valor, fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.End)
    }
}

@Composable
private fun Aviso(texto: String, botao: String? = null, aoClicar: () -> Unit = {}) {
    Column(
        Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .border(1.dp, Tinta, RoundedCornerShape(20.dp)).background(Color.White).padding(16.dp),
    ) {
        Text(texto, color = Tinta)
        botao?.let { BotaoPonto(it, aoClicar, Modifier.padding(top = 12.dp).height(44.dp)) }
    }
}

// O servidor manda "2026-10-26T13:19:17.39+00:00"; Instant.parse não aceita esse formato em Androids antigos.
private fun instante(texto: String): Instant = java.time.OffsetDateTime.parse(texto).toInstant()

private fun distancia(m: Double) = if (m < 1000) "${m.toInt()} m" else "%.1f km".format(m / 1000)
