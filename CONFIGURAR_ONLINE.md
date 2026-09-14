# ObraControl — configuração online privada

## 1. Criar o projeto Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor** e execute o conteúdo de `supabase.sql`.
3. Em **Authentication → Providers → Email**, deixe o login por e-mail/senha ativo.
4. Desative **Allow new users to sign up**. O ObraControl não terá cadastro público.
5. Em **Authentication → Users**, crie manualmente a única conta que poderá usar o sistema.

## 2. Configurar o projeto

Copie `.env.example` para `.env.local` e coloque:

- `VITE_SUPABASE_URL`: URL do seu projeto.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável do projeto.

Não coloque a `service_role` key no aplicativo.

## 3. Publicar na Vercel

1. Importe este projeto na Vercel.
2. Em **Project Settings → Environment Variables**, cadastre as mesmas duas variáveis.
3. Faça um novo deploy.

Depois do deploy, o endereço poderá ser aberto no PC, Android e iPhone.

## 4. Como os dados funcionam

- A conta autenticada é identificada pelo usuário do Supabase.
- Cada conta só consegue ler/escrever sua própria linha graças ao RLS.
- O aplicativo não mostra botão de cadastro.
- As alterações são sincronizadas automaticamente.
- O aplicativo verifica atualizações de outro dispositivo a cada 8 segundos.
- Os dados antigos que estavam no navegador são usados como ponto inicial quando a conta ainda não possui dados online.

## Observação

Para uma única conta usada por você em vários aparelhos, este modelo é simples e seguro. Se futuramente você quiser usuários diferentes, permissões por funcionário ou várias empresas, o banco poderá ser evoluído para tabelas separadas por obra e usuário.
