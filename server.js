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

        // --- АПГРЕЙД ГРАФИКИ (AAA НАСТРОЙКИ СВЕТА И МАТЕРИАЛОВ) ---
        
        // 1. Делаем центральное сукно похожим на дорогой кожаный или деревянный стол
        const centerGeo = new THREE.BoxGeometry(28, 0.6, 28);
        const centerMat = new THREE.MeshStandardMaterial({ 
            color: 0x1e272e,      // Глубокий темный цвет стола
            roughness: 0.15,      // Низкая шероховатость = стол лакированный и отражает свет!
            metalness: 0.3        // Небольшой металлический отблеск
        });
        const centerMesh = new THREE.Mesh(centerGeo, centerMat);
        centerMesh.position.set(0, -0.1, 0);
        centerMesh.receiveShadow = true;
        boardGroup.add(centerMesh);

        // 2. Настраиваем более теплое, «каминное» освещение (как на референсе image_28caeb.jpg)
        warmLight.intensity = 2.5;
        warmLight.distance = 150;
        warmLight.color.setHex(0xffd79e); // Уютный янтарный свет камина/люстры
        
        // Добавим еще один источник света снизу-сбоку, чтобы подчеркнуть грани 3D-объектов
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
        rimLight.position.set(10, 5, -20);
        scene.add(rimLight);

        // 3. Переделываем генерацию ячеек, добавляя фаску и текстурный контраст
        BOARD_DATA.forEach((cell, idx) => {
            const pos = get3DCoordinates(idx);
            const isCorner = idx % 10 === 0;
            const w = isCorner ? 3.8 : 2.8;
            const d = isCorner ? 3.8 : 2.8;

            // Сама карточка
            const geo = new THREE.BoxGeometry(w, 0.6, d);
            const mat = new THREE.MeshStandardMaterial({ 
                color: 0xf5f6fa, 
                roughness: 0.1, 
                metalness: 0.05 
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos.x, 0.1, pos.z);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            boardGroup.add(mesh);
            cellMeshes[idx] = mesh;

            // Цветная полоса (сделаем ее объемнее и ярче)
            if (cell.group) {
                const stripGeo = new THREE.BoxGeometry(w, 0.25, 0.5);
                const stripMat = new THREE.MeshStandardMaterial({ 
                    color: groupColors[cell.group], 
                    roughness: 0.2,
                    emissive: groupColors[cell.group], // Свечение полосы для сочности
                    emissiveIntensity: 0.2
                });
                const stripMesh = new THREE.Mesh(stripGeo, stripMat);
                // Позиционируем полосу строго по краю
                stripMesh.position.set(pos.x, 0.41, pos.z + (d/2 - 0.25));
                boardGroup.add(stripMesh);
            }
        });

        // 4. Прокачиваем фишки игроков (делаем их металлическими, как в оригинале)
        // Замени код создания фишки в socket.on('updateGameState') на этот:
        if (!tokenMeshes[p.id]) {
            // Вместо конуса используем тор + сферу (более сложная 3D форма)
            const tokenGroup = new THREE.Group();
            
            const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.2, 16);
            const bodyGeo = new THREE.ConeGeometry(0.4, 1.2, 16);
            const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
            
            // ААА Металлический материал с хромированным отражением
            const tokenMat = new THREE.MeshStandardMaterial({ 
                color: p.color, 
                roughness: 0.05,   // Идеально гладкий металл
                metalness: 0.9,    // Максимальный блеск
            });
            
            const base = new THREE.Mesh(baseGeo, tokenMat);
            const body = new THREE.Mesh(bodyGeo, tokenMat);
            const head = new THREE.Mesh(headGeo, tokenMat);
            
            body.position.y = 0.6;
            head.position.y = 1.3;
            
            tokenGroup.add(base, body, head);
            tokenGroup.position.set(pos3d.x, 0.2, pos3d.z);
            
            // Включаем тени для всех частей фишки
            tokenGroup.traverse(child => { if(child.isMesh) child.castShadow = true; });
            
            scene.add(tokenGroup);
            tokenMeshes[p.id] = tokenGroup;
        }
        */

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
