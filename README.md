# Ponto

Controle de ponto com cerca virtual: o colaborador só consegue bater ponto no local de trabalho dele (ex.: só dentro do Atacadão), com selfie, GPS e hora do servidor. O dono acompanha tudo num painel web com mapa ao vivo.

| Pasta | O que é |
|---|---|
| `supabase/` | Banco (Postgres + PostGIS), regras de acesso, validação da batida e função para criar contas |
| `admin/` | Painel web do dono/gestor (Next.js) |
| `android/` | App do colaborador (Kotlin + Jetpack Compose) |

## Como funciona

- **A batida é validada no servidor** (`registrar_batida` em `supabase/migrations/…_regras.sql`): hora oficial do servidor, distância até o local cadastrado (raio ou polígono), precisão do GPS, detecção de GPS falso e ordem das batidas (entrada → intervalo → volta → saída). O celular não consegue burlar.
- **Tentativas recusadas também ficam registradas** e geram alerta no painel (fora do local, GPS falso).
- **Batidas nunca são apagadas nem alteradas** (trigger no banco). Cada batida válida recebe um NSR sequencial e um código de verificação (hash), como pede a Portaria 671/2021. Correções entram como ajuste.
- **Sem internet** o app guarda a batida (com foto e GPS) e envia quando a conexão volta; o gestor revisa o horário.
- **Localização contínua só durante a jornada** (entre entrada e saída), com notificação fixa no celular. Fora disso o servidor recusa os pontos (LGPD). O histórico é apagado depois de 90 dias (configurável).

## Colocar no ar

### 1. Supabase (banco e login)

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo).
2. Instale o CLI e publique o banco e a função:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push
   npx supabase functions deploy colaboradores
   ```
3. Em **Authentication > Sign In / Providers**, desligue "Allow new users to sign up" (contas são criadas pelo painel).
4. Crie o primeiro admin: **Authentication > Users > Add user** (e-mail e senha, marque "Auto confirm"). Depois, no **SQL Editor**:
   ```sql
   select criar_empresa_com_admin('email-do-admin@exemplo.com', 'Nome da Empresa', '00000000000100', 'Nome do Dono');
   ```
5. Limpeza automática do histórico de localização: em **Database > Extensions** ative `pg_cron` e rode:
   ```sql
   select cron.schedule('limpar-localizacoes', '0 4 * * *', 'select limpar_localizacoes_antigas()');
   ```

### 2. Painel

Na [Vercel](https://vercel.com), importe o repositório com **Root Directory = `admin`** e as variáveis:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
```

Entre com o admin, em **Empresa** coloque o nome, o CNPJ e a logo (cada empresa cliente tem a sua; ela aparece no painel e no app), cadastre os **Locais** (busque o endereço, ajuste o centro no mapa e o raio) e depois os **Colaboradores**, marcando onde cada um pode bater ponto.

### 3. App Android

1. Instale o [Android Studio](https://developer.android.com/studio) e abra a pasta `android/`.
2. Copie `local.properties.example` para `local.properties` e preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Rode num celular (Run ▶). Para gerar o APK: **Build > Build APK(s)**.

O GitHub Actions também gera o APK de teste a cada push (aba Actions > artefato `ponto-debug-apk`), usando os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` do repositório.

## Desenvolvimento local

```bash
npx supabase start          # sobe Supabase local (Docker) com dados de exemplo
cd admin && cp .env.example .env.local   # use a URL e a anon key do "supabase status"
npm install && npm run dev
```

Contas de exemplo (senha `ponto123`): `admin@ponto.dev`, `joao@ponto.dev`, `maria@ponto.dev`, `pedro@ponto.dev`.

Testes:

```bash
PGURL=postgres://postgres@localhost:5432/postgres supabase/tests/run.sh   # regras do banco (Postgres com PostGIS)
SUPABASE_ANON_KEY=... supabase/tests/e2e.sh                                          # ponta a ponta no Supabase local
```

## Próximas fases

- **Fase 2:** restrição do celular pela Android Management API (só apps liberados, app de ponto impossível de remover, GPS sempre ligado), trilha do dia no mapa, alertas de atraso/falta/sem sinal.
- **Fase 3:** espelho de ponto em PDF, arquivos AFD/AEJ, fluxo de ajustes com aprovação, escalas e banco de horas.

## Pontos legais (confirmar com o contador)

- **Portaria 671/2021:** app de ponto é REP-P. Exige comprovante de cada batida, AFD/AEJ e registro inalterável (já previsto aqui).
- **LGPD:** avisar por escrito o que é coletado (foto, localização), colher termo de ciência e rastrear só na jornada (já é o comportamento do app).
