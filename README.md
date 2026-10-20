# PulseVote

Aplicação de enquete/votação em tempo real feita para o trabalho de WebSocket.

## Como executar

1. Instale o [Node.js](https://nodejs.org/) (versão 18 ou superior).
2. Na pasta do projeto, execute:

   ```bash
   npm install
   npm start
   ```

3. Acesse <http://localhost:3000>.
4. Abra a página em duas ou mais abas para testar a sincronização.

## Eventos WebSocket

- `poll_state`: envia a enquete atual ao conectar.
- `identify`: registra o nome do participante.
- `vote`: registra um voto e transmite o novo resultado a todos.
- `create_poll`: publica uma nova enquete para todos os clientes.
- `reset_poll`: zera os votos da enquete atual.
- `presence`: atualiza a quantidade de usuários conectados.

As mensagens trocadas pelo cliente e pelo servidor são objetos JSON.
