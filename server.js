const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, "public");

let poll = {
  id: `poll-${Date.now()}`,
  question: "Qual recurso você gostaria de ver na próxima versão?",
  options: [
    { id: "interface", label: "Uma interface mais moderna", votes: 0 },
    { id: "relatorios", label: "Relatórios detalhados", votes: 0 },
    { id: "integracoes", label: "Mais integrações", votes: 0 }
  ],
  totalVotes: 0,
  updatedAt: new Date().toISOString()
};

const clients = new Map();
const registrations = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  const requestedPath = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.normalize(path.join(publicDirectory, requestedPath));

  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(403);
    response.end("Acesso negado");
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Página não encontrada" : "Erro interno");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  });
});

const websocketServer = new WebSocketServer({ server });

function send(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function broadcast(message) {
  websocketServer.clients.forEach((client) => send(client, message));
}

function pollState() {
  return {
    type: "poll_state",
    poll,
    onlineUsers: clients.size
  };
}

function broadcastState() {
  broadcast(pollState());
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createPoll(question, options) {
  const validOptions = Array.isArray(options)
    ? options
        .map((option) => cleanText(option, 80))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  if (question.length < 5 || validOptions.length < 2) {
    return false;
  }

  poll = {
    id: `poll-${Date.now()}`,
    question,
    options: validOptions.map((label, index) => ({
      id: `option-${Date.now()}-${index}`,
      label,
      votes: 0
    })),
    totalVotes: 0,
    updatedAt: new Date().toISOString()
  };
  return true;
}

websocketServer.on("connection", (client) => {
  clients.set(client, { name: "", email: "", registered: false });
  send(client, pollState());
  broadcast({ type: "presence", onlineUsers: clients.size });

  client.on("message", (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      send(client, { type: "error", message: "Mensagem inválida. Use o formato JSON." });
      return;
    }

    if (!message || typeof message.type !== "string") {
      send(client, { type: "error", message: "O tipo da mensagem é obrigatório." });
      return;
    }

    if (message.type === "register") {
      const name = cleanText(message.name, 30);
      const email = cleanText(message.email, 120).toLowerCase();
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        send(client, { type: "error", message: "Informe seu nome e um e-mail válido para votar." });
        return;
      }

      const registration = registrations.get(email) || { name, votedPollId: null };
      registration.name = name;
      registrations.set(email, registration);
      clients.set(client, { name, email, registered: true });
      send(client, {
        type: "registered",
        name,
        email,
        hasVoted: registration.votedPollId === poll.id
      });
      return;
    }

    if (message.type === "identify") {
      send(client, { type: "error", message: "Faça seu cadastro para poder votar." });
      return;
    }

    if (message.type === "vote") {
      const participant = clients.get(client);
      if (!participant || !participant.registered) {
        send(client, { type: "error", message: "Faça seu cadastro antes de votar." });
        return;
      }
      const registration = registrations.get(participant.email);
      if (registration.votedPollId === poll.id) {
        send(client, { type: "already_voted", message: "Este cadastro já votou nesta enquete." });
        return;
      }
      const option = poll.options.find((item) => item.id === message.optionId);
      if (!option) {
        send(client, { type: "error", message: "Essa opção não existe mais." });
        return;
      }

      option.votes += 1;
      poll.totalVotes += 1;
      registration.votedPollId = poll.id;
      poll.updatedAt = new Date().toISOString();
      broadcast({
        ...pollState(),
        type: "vote_registered",
        voter: clients.get(client).name,
        voterEmail: clients.get(client).email,
        optionId: option.id
      });
      return;
    }

    if (message.type === "create_poll") {
      const question = cleanText(message.question, 160);
      if (!createPoll(question, message.options)) {
        send(client, {
          type: "error",
          message: "Informe uma pergunta e pelo menos duas opções válidas."
        });
        return;
      }

      broadcast({ ...pollState(), type: "poll_created" });
      return;
    }

    if (message.type === "reset_poll") {
      poll.options.forEach((option) => {
        option.votes = 0;
      });
      poll.totalVotes = 0;
      registrations.forEach((registration) => {
        registration.votedPollId = null;
      });
      poll.updatedAt = new Date().toISOString();
      broadcast({ ...pollState(), type: "poll_reset" });
      return;
    }

    send(client, { type: "error", message: "Tipo de evento não reconhecido." });
  });

  client.on("close", () => {
    clients.delete(client);
    broadcast({ type: "presence", onlineUsers: clients.size });
  });
});

server.listen(PORT, () => {
  console.log(`Enquete disponível em http://localhost:${PORT}`);
});
