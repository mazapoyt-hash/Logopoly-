const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const BOARD_DATA = require('./public/boardData.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let turnOrder = [];
let currentTurnIndex = 0;
let cellsOwner = {}; // id_клетки: id_игрока
let cellsHouses = {}; // id_клетки: количество домов (0-5)

// Инициализация домов для улиц
BOARD_DATA.forEach(c => { if(c.type === 'property') cellsHouses[c.id] = 0; });

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        if (turnOrder.includes(socket.id)) return;
        players[socket.id] = {
            id: socket.id,
            name: name || `Игрок ${turnOrder.length + 1}`,
            position: 0,
            money: 1500,
            inJail: false,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`
        };
        turnOrder.push(socket.id);
        sendState();
    });

    socket.on('rollDice', () => {
        if (socket.id !== turnOrder[currentTurnIndex]) return;
        const player = players[socket.id];
        
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2;

        let logMsg = `${player.name} выбросил ${d1} и ${d2} (Всего: ${total}).`;

        if (player.inJail) {
            if (d1 === d2) {
                player.inJail = false;
                logMsg += " Вышел из тюрьмы дублем!";
            } else {
                logMsg += " Остается в тюрьме.";
                nextTurn();
                io.emit('gameLog', logMsg);
                sendState();
                return;
            }
        }

        const oldPos = player.position;
        player.position = (player.position + total) % 40;

        // Проход через СТАРТ
        if (player.position < oldPos) {
            player.money += 200;
            logMsg += " Прошел круг (+ $200).";
        }

        const currentCell = BOARD_DATA[player.position];
        logMsg += ` Встал на кнопку: "${currentCell.name}".`;

        // Логика клеток
        if (currentCell.type === 'go-to-jail') {
            player.position = 10;
            player.inJail = true;
            logMsg += " Отправлен в тюрьму!";
        } else if (currentCell.type === 'tax') {
            player.money -= currentCell.price;
            logMsg += ` Заплатил налог $${currentCell.price}.`;
        } else if (['property', 'railroad', 'utility'].includes(currentCell.type)) {
            const ownerId = cellsOwner[currentCell.id];
            if (ownerId && ownerId !== socket.id) {
                // Рассчет аренды
                let rent = 0;
                if (currentCell.type === 'property') {
                    const houseCount = cellsHouses[currentCell.id] || 0;
                    rent = currentCell.rent[houseCount];
                } else if (currentCell.type === 'railroad') {
                    rent = 25; // Упростим для бэка
                } else {
                    rent = total * 4;
                }
                player.money -= rent;
                players[ownerId].money += rent;
                logMsg += ` Заплатил аренду $${rent} игроку ${players[ownerId].name}.`;
            }
        }

        io.emit('gameLog', logMsg);

        // Если не дубль — передаем ход
        if (d1 !== d2) {
            nextTurn();
        } else {
            io.emit('gameLog', `🎲 ${player.name} бросает еще раз благодаря дублю!`);
        }
        
        sendState();
    });

    // Покупка недвижимости
    socket.on('buyProperty', () => {
        if (socket.id !== turnOrder[currentTurnIndex]) return;
        const player = players[socket.id];
        const cell = BOARD_DATA[player.position];

        if (['property', 'railroad', 'utility'].includes(cell.type) && !cellsOwner[cell.id]) {
            if (player.money >= cell.price) {
                player.money -= cell.price;
                cellsOwner[cell.id] = socket.id;
                io.emit('gameLog', `${player.name} купил "${cell.name}" за $${cell.price}`);
                sendState();
            }
        }
    });

    socket.on('disconnect', () => {
        players = {}; turnOrder = []; currentTurnIndex = 0; cellsOwner = {};
        io.emit('updateGameState', { players: {}, currentTurn: null, cellsOwner, cellsHouses });
    });
});

function nextTurn() {
    currentTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
}

function sendState() {
    io.emit('updateGameState', { players, currentTurn: turnOrder[currentTurnIndex], cellsOwner, cellsHouses });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Монополия на порту ${PORT}`));
