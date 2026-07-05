const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let turnOrder = [];
let currentTurnIndex = 0;

// Упрощенная карта: 16 клеток (4x4)
const BOARD_SIZE = 16;

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Добавление игрока в игру
    socket.on('joinGame', (name) => {
        players[socket.id] = {
            id: socket.id,
            name: name || `Игрок ${turnOrder.length + 1}`,
            position: 0,
            money: 1500,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`
        };
        turnOrder.push(socket.id);
        
        io.emit('updateGameState', { players, currentTurn: turnOrder[currentTurnIndex] });
    });

    // Бросок кубика
    socket.on('rollDice', () => {
        if (socket.id !== turnOrder[currentTurnIndex]) return; // Ход не этого игрока

        const dice = Math.floor(Math.random() * 6) + 1;
        const player = players[socket.id];
        
        player.position = (player.position + dice) % BOARD_SIZE;
        
        // Передаем ход следующему
        currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;

        io.emit('diceRolled', { playerId: socket.id, dice, newPosition: player.position });
        io.emit('updateGameState', { players, currentTurn: turnOrder[currentTurnIndex] });
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        delete players[socket.id];
        turnOrder = turnOrder.filter(id => id !== socket.id);
        if (currentTurnIndex >= turnOrder.length) currentTurnIndex = 0;
        io.emit('updateGameState', { players, currentTurn: turnOrder[currentTurnIndex] });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
