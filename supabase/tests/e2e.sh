#!/usr/bin/env bash
# Teste ponta a ponta contra o Supabase local (supabase start, com seed).
# Simula o app (login, foto, batida, localização) e o painel (admin).
set -uo pipefail
A=${SUPABASE_URL:-http://127.0.0.1:54321}
K=${SUPABASE_ANON_KEY:?defina SUPABASE_ANON_KEY (supabase status)}
falhas=0
checar() { if echo "$2" | grep -q -- "$3"; then echo "ok - $1"; else echo "FALHOU - $1: $2"; falhas=$((falhas+1)); fi; }
login() { curl -s "$A/auth/v1/token?grant_type=password" -H "apikey: $K" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))'; }
rpc() { curl -s "$A/rest/v1/rpc/$2" -H "apikey: $K" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$3"; }

TJ=$(login joao@ponto.dev ponto123); TA=$(login admin@ponto.dev ponto123)
checar "login do colaborador" "$TJ" "."
JOAO=10000000-0000-0000-0000-000000000001
ID=$(python3 -c 'import uuid;print(uuid.uuid4())')

checar "meus_locais diz que está dentro" "$(rpc "$TJ" meus_locais '{"p_lat":-23.5276,"p_lng":-46.6789}')" '"dentro_cerca":true'

F=$(mktemp); printf '\xff\xd8\xff\xe0teste' > "$F"
up() { curl -s "$A/storage/v1/object/fotos-ponto/$1" -H "apikey: $K" -H "Authorization: Bearer $TJ" -H 'Content-Type: image/jpeg' -H 'x-upsert: true' --data-binary @"$F"; }
checar "envia a própria foto" "$(up "$JOAO/$ID.jpg")" '"Key"'
checar "não envia foto na pasta de outro" "$(up "10000000-0000-0000-0000-000000000002/$ID.jpg")" 'row-level security\|403\|Unauthorized'

# usa a próxima batida esperada, para o teste poder rodar várias vezes
TIPO=$(rpc "$TJ" minhas_proximas_batidas '{}' | python3 -c 'import sys,json;print(json.load(sys.stdin)[0])')
B=$(rpc "$TJ" registrar_batida "{\"p_id_cliente\":\"$ID\",\"p_tipo\":\"$TIPO\",\"p_lat\":-23.5276,\"p_lng\":-46.6789,\"p_precisao_m\":12,\"p_foto_path\":\"$JOAO/$ID.jpg\",\"p_dispositivo\":\"e2e\"}")
checar "batida ($TIPO) no local é válida" "$B" '"status": *"valida"'
checar "fora do local é recusada" "$(rpc "$TJ" registrar_batida "{\"p_id_cliente\":\"$(python3 -c 'import uuid;print(uuid.uuid4())')\",\"p_tipo\":\"saida\",\"p_lat\":-23.54,\"p_lng\":-46.6789,\"p_precisao_m\":10}")" '"status": *"rejeitada"'
[ "$TIPO" = saida ] || checar "localização gravada na jornada" "$(rpc "$TJ" enviar_localizacoes "{\"p_pontos\":[{\"lat\":-23.528,\"lng\":-46.679,\"bateria\":80,\"capturado_em\":\"$(date -u +%FT%TZ)\"}]}")" '^1$'
checar "colaborador não insere batida direto" "$(curl -s "$A/rest/v1/batidas" -H "apikey: $K" -H "Authorization: Bearer $TJ" -H 'Content-Type: application/json' -d '{"tipo":"entrada"}')" 'permission denied\|42501'

checar "painel mostra a situação do João" "$(rpc "$TA" painel_colaboradores '{}')" '"nome":"João Silva","cargo":"Repositor","situacao":"'
checar "admin lista batidas com nome e local" "$(curl -s "$A/rest/v1/batidas?select=tipo,usuarios!batidas_usuario_id_fkey(nome),locais(nome)&status=eq.valida" -H "apikey: $K" -H "Authorization: Bearer $TA")" 'Atacadão (exemplo)'
checar "admin abre a foto" "$(curl -s -X POST "$A/storage/v1/object/sign/fotos-ponto/$JOAO/$ID.jpg" -H "apikey: $K" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"expiresIn":60}')" 'signedURL'
checar "admin vê alerta de fora do local" "$(curl -s "$A/rest/v1/alertas?select=tipo" -H "apikey: $K" -H "Authorization: Bearer $TA")" 'fora_cerca'

EMAIL="teste$RANDOM@ponto.dev"
fn() { curl -s "${FUNCTIONS_URL:-$A/functions/v1}/colaboradores" -H "apikey: $K" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2"; }
checar "admin cria colaborador" "$(fn "$TA" "{\"acao\":\"criar\",\"nome\":\"Ana Teste\",\"email\":\"$EMAIL\",\"senha\":\"segredo1\",\"locais\":[\"20000000-0000-0000-0000-000000000001\"]}")" '"id"'
checar "colaborador não cria conta" "$(fn "$TJ" '{"acao":"criar","nome":"X","email":"x@ponto.dev","senha":"segredo1"}')" 'Apenas o administrador'
TN=$(login "$EMAIL" segredo1)
checar "novo colaborador entra e vê o local" "$(rpc "$TN" meus_locais '{}')" 'Atacadão'

rm -f "$F"
[ $falhas -eq 0 ] && echo "Todos os testes ponta a ponta passaram" || { echo "$falhas falha(s)"; exit 1; }
